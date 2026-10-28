/**
 * optimize.js — localização do ponto ótimo sobre a superfície ajustada.
 *
 * Duas perguntas diferentes, respondidas separadamente:
 *
 *  1. Onde o modelo tem seu ponto estacionário (gradiente nulo)? É a resposta
 *     "de livro", e pode cair fora da região testada ou ser uma SELA — caso em
 *     que tratá-la como máximo é simplesmente errado. É o erro mais comum em
 *     otimização por superfície de resposta.
 *
 *  2. Qual a melhor condição DENTRO da faixa que o grupo consegue executar?
 *     É a resposta acionável, e é sempre ela que vai para o relatório final.
 */

import { solveLinear, jacobiEigen } from './matrix.js';
import { prever, gradiente, hessiana, matrizB, vetorLinear, erroPadraoPrevisao } from './model.js';
import { extremeCoded, paraReal, arredondar } from './coding.js';

/** Score a maximizar, conforme o objetivo declarado pelo usuário. */
function montarScore(objetivo, alvo) {
  if (objetivo === 'minimizar') return (yhat) => -yhat;
  if (objetivo === 'alvo') return (yhat) => -Math.abs(yhat - alvo);
  return (yhat) => yhat;
}

/** Maior grau total (soma dos expoentes) entre os termos do modelo. */
function grauMaximo(termos) {
  let g = 0;
  for (const t of termos) {
    const soma = t.expoentes.reduce((s, e) => s + e, 0);
    if (soma > g) g = soma;
  }
  return g;
}

const normaInf = (v) => Math.max(...v.map(Math.abs));

/**
 * Um passo de Newton amortecido em ‖g‖ (não em ŷ — queremos qualquer
 * estacionário, selas inclusive), com Levenberg quando a Hessiana local é
 * singular. Usado tanto no polimento de `otimoRestrito` (um passo só) quanto
 * no multistart de `pontosEstacionarios` (iterado até convergir).
 */
function passoAmortecido(x, g, beta, termos, k) {
  const H = hessiana(x, beta, termos, k);
  let passo = solveLinear(H, g.map((v) => -v));
  if (!passo) {
    const maxDiag = Math.max(1e-300, ...H.map((linha, i) => Math.abs(linha[i])));
    let lambda = 1e-6 * maxDiag;
    for (let t = 0; t < 20 && !passo; t++, lambda *= 2) {
      const Hl = H.map((linha, i) => linha.map((v, j) => (i === j ? v + lambda : v)));
      passo = solveLinear(Hl, g.map((v) => -v));
    }
    if (!passo) return null;
  }
  let fator = 1;
  for (let t = 0; t < 20; t++) {
    const xNovo = x.map((v, i) => v + fator * passo[i]);
    const gNovo = gradiente(xNovo, beta, termos, k);
    if (normaInf(gNovo) < normaInf(g)) return { x: xNovo, g: gNovo };
    fator /= 2;
  }
  return null;
}

/** Newton amortecido a partir de um ponto de partida, até ‖g‖∞ ficar desprezível relativo à escala dos coeficientes. */
function newtonAmortecido(x0, beta, termos, k, limite) {
  let x = x0.slice();
  let g = gradiente(x, beta, termos, k);
  const escalaBeta = Math.max(1e-300, ...beta.map(Math.abs));
  const tol = (1e-10 * escalaBeta) / Math.max(limite, 1e-300);

  for (let iter = 0; iter < 60; iter++) {
    if (normaInf(g) < tol) return x;
    const passo = passoAmortecido(x, g, beta, termos, k);
    if (!passo) return normaInf(g) < tol * 1000 ? x : null;
    x = passo.x; g = passo.g;
  }
  return normaInf(g) < tol ? x : null;
}

/**
 * Ponto(s) estacionário(s): resolve ∇ŷ = 0.
 *
 * Grau ≤ 2: ∇ŷ=0 é o sistema LINEAR b_linear + 2·B·x = 0 — solução única (ou
 * nenhuma, se B for singular: um cume alongado, por exemplo). Código idêntico
 * ao de sempre, byte a byte — não passa pelo Newton iterativo, que mudaria os
 * últimos bits mesmo convergindo na primeira iteração.
 *
 * Grau 3: ∇ŷ=0 é polinomial e pode ter várias raízes (até 4 em k=2). Newton
 * amortecido multistart a partir de pontos determinísticos (a ferramenta
 * precisa ser reprodutível): a origem, os pontos extras informados (o melhor
 * ponto da busca em grade de `otimoRestrito`), os 2k pontos axiais e os 2^k
 * vértices da caixa viável.
 */
export function pontosEstacionarios(beta, termos, k, limite, pontosExtras = []) {
  if (grauMaximo(termos) <= 2) {
    const B = matrizB(beta, termos, k);
    const bLin = vetorLinear(beta, termos, k);
    const doisB = B.map((linha) => linha.map((v) => 2 * v));
    const raiz = solveLinear(doisB, bLin.map((v) => -v));
    return raiz && raiz.every(Number.isFinite) ? [raiz] : [];
  }

  const partidas = [new Array(k).fill(0), ...pontosExtras];
  for (let i = 0; i < k; i++) {
    for (const s of [-1, 1]) {
      const v = new Array(k).fill(0); v[i] = s * limite;
      partidas.push(v);
    }
  }
  for (let m = 0; m < Math.pow(2, k); m++) {
    const v = new Array(k).fill(0);
    for (let j = 0; j < k; j++) v[j] = ((m >> j) & 1 ? 1 : -1) * limite;
    partidas.push(v);
  }

  const achados = [];
  for (const p0 of partidas) {
    const raiz = newtonAmortecido(p0, beta, termos, k, limite);
    if (!raiz || !raiz.every(Number.isFinite)) continue;
    if (raiz.some((v) => Math.abs(v) > 3 * limite)) continue; // extrapolação absurda, não é informação
    const duplicado = achados.some((r) => Math.hypot(...r.map((v, i) => v - raiz[i])) < 1e-6 * limite);
    if (!duplicado) achados.push(raiz);
  }
  return achados;
}

/**
 * Análise canônica no ponto `x`: diagonaliza a Hessiana/2 local. Para um
 * modelo quadrático a Hessiana não depende de x, então isto é bit-idêntico à
 * antiga `analiseCanonica(beta, termos, k)` qualquer que seja o ponto — e por
 * isso a classificação, ali, é "global": vale a superfície inteira. Para um
 * modelo cúbico ela vale só nas vizinhanças de `x`.
 */
export function analiseCanonica(x, beta, termos, k) {
  const H = hessiana(x, beta, termos, k);
  const B = H.map((linha) => linha.map((v) => v / 2));
  const { values, vectors } = jacobiEigen(B);
  const maxAbs = Math.max(...values.map(Math.abs));
  const tol = maxAbs * 1e-8;

  const negativos = values.filter((v) => v < -tol).length;
  const positivos = values.filter((v) => v > tol).length;
  const nulos = values.filter((v) => Math.abs(v) <= tol).length;

  const local = grauMaximo(termos) > 2;
  const prefixo = 'Perto dessa condição a';

  let tipo, explicacao;
  if (nulos > 0) {
    tipo = 'cume';
    explicacao = local
      ? `${prefixo} superfície tem uma direção quase plana; num modelo cúbico essa classificação vale só nas vizinhanças do ponto, não na faixa inteira.`
      : 'A superfície tem uma direção quase plana: existe uma faixa de condições, e não um único ponto, com desempenho equivalente. Isso dá liberdade para escolher a condição mais barata ou mais fácil de executar dentro dessa faixa.';
  } else if (negativos === k) {
    tipo = 'maximo';
    explicacao = local
      ? `${prefixo} superfície tem um pico; num modelo cúbico essa classificação é local e não descreve a faixa inteira.`
      : 'A superfície tem um pico bem definido.';
  } else if (positivos === k) {
    tipo = 'minimo';
    explicacao = local
      ? `${prefixo} superfície tem um vale; num modelo cúbico essa classificação é local e não descreve a faixa inteira.`
      : 'A superfície tem um vale bem definido.';
  } else {
    tipo = 'sela';
    explicacao = local
      ? `${prefixo} superfície sobe numa direção e desce em outra — um ponto de sela local.`
      : 'A superfície é um ponto de sela: sobe numa direção e desce em outra. Não existe pico interno — o melhor resultado está na borda da região testada.';
  }

  return { autovalores: values, autovetores: vectors, tipo, explicacao, B, ponto: x, local, escopo: local ? 'local' : 'global' };
}

/**
 * Melhor ponto dentro da caixa viável, por busca em grade seguida de
 * refinamento local em janelas que encolhem. Suporta restrições dimensionais (fixos).
 */
export function otimoRestrito(beta, termos, k, limite, objetivo, alvo, fixos = []) {
  const score = montarScore(objetivo, alvo);
  const pontosPorEixo = k <= 2 ? 241 : k === 3 ? 61 : 31;

  let melhor = null;
  const x = new Array(k).fill(0);

  const varrer = (dim, lo, hi, nPontos) => {
    if (dim === k) {
      const yhat = prever(x, beta, termos);
      const s = score(yhat);
      if (melhor === null || s > melhor.score) melhor = { score: s, yhat, x: x.slice() };
      return;
    }
    // Se a variável estiver travada pelo usuário, pula a varredura nela
    if (fixos[dim] !== undefined && fixos[dim] !== null) {
      x[dim] = fixos[dim];
      varrer(dim + 1, lo, hi, nPontos);
    } else {
      const passo = nPontos > 1 ? (hi[dim] - lo[dim]) / (nPontos - 1) : 0;
      for (let i = 0; i < nPontos; i++) {
        x[dim] = lo[dim] + i * passo;
        varrer(dim + 1, lo, hi, nPontos);
      }
    }
  };

  const loGlobal = new Array(k).fill(-limite);
  const hiGlobal = new Array(k).fill(limite);
  varrer(0, loGlobal, hiGlobal, pontosPorEixo);

  let largura = (2 * limite) / (pontosPorEixo - 1);
  for (let it = 0; it < 6; it++) {
    const centro = melhor.x.slice();
    const lo = centro.map((c) => Math.max(-limite, c - largura));
    const hi = centro.map((c) => Math.min(limite, c + largura));
    varrer(0, lo, hi, 11);
    largura /= 4;
  }

  // Polimento de Newton no subespaço das variáveis livres
  if (objetivo !== 'alvo') {
    const H = hessiana(melhor.x, beta, termos, k);
    const g = gradiente(melhor.x, beta, termos, k);
    
    const livres = [];
    for (let i = 0; i < k; i++) {
      if (fixos[i] === undefined || fixos[i] === null) livres.push(i);
    }
    
    if (livres.length > 0) {
      const H_livre = livres.map((i) => livres.map((j) => H[i][j]));
      const g_livre = livres.map((i) => g[i]);
      const passo_livre = solveLinear(H_livre, g_livre.map((v) => -v));
      
      if (passo_livre && passo_livre.every(Number.isFinite)) {
        const candidato = melhor.x.slice();
        livres.forEach((idx, j) => candidato[idx] += passo_livre[j]);
        
        if (candidato.every((v, i) => (fixos[i] !== null && fixos[i] !== undefined) || Math.abs(v) <= limite + 1e-12)) {
          const yhat = prever(candidato, beta, termos);
          const s = score(yhat);
          if (s > melhor.score) melhor = { score: s, yhat, x: candidato };
        }
      }
    }
  }

  return melhor;
}
/**
 * Caminho de máxima inclinação a partir do centro: a direção para onde
 * caminhar quando o ótimo está na borda e vale a pena um novo planejamento
 * mais adiante. Este é o passo clássico entre uma rodada e a seguinte.
 */
export function caminhoMaximaInclinacao(beta, termos, k, fatores, objetivo, nPassos = 8, passo = 0.5) {
  const g = gradiente(new Array(k).fill(0), beta, termos, k);
  const sentido = objetivo === 'minimizar' ? -1 : 1;
  const norma = Math.hypot(...g);
  if (!(norma > 0)) return null;

  const direcao = g.map((v) => (sentido * v) / norma);
  const pontos = [];
  for (let i = 1; i <= nPassos; i++) {
    const codificados = direcao.map((d) => d * passo * i);
    pontos.push({
      passo: i,
      codificados,
      reais: codificados.map((c, j) => arredondar(paraReal(c, fatores[j]), fatores[j].casasDecimais)),
      previsto: prever(codificados, beta, termos),
      distanciaCentro: Math.hypot(...codificados),
    });
  }
  return { direcao, pontos };
}

/**
 * Orquestra a análise completa do ótimo e devolve tudo já em unidades reais,
 * junto com a recomendação em linguagem simples.
 */
export function encontrarOtimo({ ajuste, fatores, alpha, objetivo = 'maximizar', alvo = null }) {
  const k = fatores.length;
  const { beta, termos } = ajuste;
  const limite = extremeCoded(alpha);
  const grau = grauMaximo(termos);

  // A busca em grade roda primeiro: seu melhor ponto vira uma partida extra
  // do multistart abaixo, o que ajuda o Newton a achar o estacionário
  // relevante quando há vários (grau 3). Para grau ≤ 2 a ordem não importa —
  // pontosEstacionarios não usa `melhor` nesse caminho.
  const melhor = otimoRestrito(beta, termos, k, limite, objetivo, alvo);

  const raizes = pontosEstacionarios(beta, termos, k, limite, [melhor.x]);
  const score = montarScore(objetivo, alvo);
  const estacionarios = raizes.map((codificados) => {
    const dentro = codificados.every((v) => Math.abs(v) <= limite + 1e-9);
    return {
      codificados,
      reais: codificados.map((c, j) => arredondar(paraReal(c, fatores[j]), fatores[j].casasDecimais)),
      previsto: prever(codificados, beta, termos),
      dentroDaRegiao: dentro,
      distanciaCentro: Math.hypot(...codificados),
      canonica: analiseCanonica(codificados, beta, termos, k),
    };
  });

  // Grau ≤ 2: 0 ou 1 raiz, e o comportamento é o de sempre — o estacionário é
  // ele mesmo, dentro ou fora da região (o aviso de extrapolação abaixo cobre
  // o caso fora). Grau 3: pode haver várias raízes dentro da região; entre
  // elas, a de melhor score é a "principal" — as demais continuam listadas
  // em `estacionarios`.
  let estacionario;
  if (grau <= 2) {
    estacionario = estacionarios[0] || null;
  } else {
    const dentro = estacionarios.filter((e) => e.dentroDaRegiao);
    estacionario = dentro.length ? dentro.reduce((m, e) => (score(e.previsto) > score(m.previsto) ? e : m)) : null;
  }
  const canonica = estacionario ? estacionario.canonica : analiseCanonica(melhor.x, beta, termos, k);

  const reais = melhor.x.map((c, j) => arredondar(paraReal(c, fatores[j]), fatores[j].casasDecimais));
  // Reavalia nos valores ARREDONDADOS: é a condição que o grupo vai de fato
  // executar, então é dela que a previsão precisa falar.
  const codificadosArredondados = reais.map((r, j) => (r - fatores[j].centro) / fatores[j].unidadeCodificada);
  const previstoArredondado = prever(codificadosArredondados, beta, termos);
  const sePrevisao = erroPadraoPrevisao(codificadosArredondados, ajuste);

  const naBorda = melhor.x.some((v) => Math.abs(Math.abs(v) - limite) < 1e-6);

  const recomendado = {
    codificados: codificadosArredondados,
    reais,
    previsto: previstoArredondado,
    erroPadrao: sePrevisao,
    naBorda,
  };

  const avisos = [];
  if (naBorda) {
    avisos.push({
      nivel: 'aviso',
      texto: 'A melhor condição encontrada está na borda da faixa testada. É provável que exista algo ainda melhor fora dela — vale planejar uma nova rodada deslocada nessa direção.',
    });
  }
  if (canonica.tipo === 'sela') {
    avisos.push({
      nivel: 'aviso',
      texto: canonica.explicacao,
    });
  }
  if (estacionario && !estacionario.dentroDaRegiao) {
    avisos.push({
      nivel: 'info',
      texto: 'O pico matemático do modelo cai fora da faixa testada. Usá-lo seria extrapolar; a condição recomendada abaixo respeita os limites informados.',
    });
  }
  if (objetivo === 'alvo' && alvo !== null) {
    const erro = Math.abs(previstoArredondado - alvo);
    if (erro > 3 * (sePrevisao || 0) && sePrevisao > 0) {
      avisos.push({
        nivel: 'aviso',
        texto: `Não foi possível atingir o alvo de ${alvo} dentro da faixa testada. O mais próximo alcançável é ${previstoArredondado.toFixed(3)}.`,
      });
    }
  }
  // Só num modelo cúbico ∇ŷ=0 pode ter mais de uma raiz — é informação nova
  // e acionável, então fica isolada do caminho quadrático (que nunca chega
  // a mais de 1 raiz e cujos avisos já cobrem o caso de 0).
  if (grau > 2) {
    if (estacionarios.length > 1) {
      avisos.push({
        nivel: 'aviso',
        texto: `O modelo ajustado tem ${estacionarios.length} pontos de inclinação nula dentro da faixa testada. Isso significa que a resposta não tem um único ótimo — confirme a condição recomendada experimentalmente antes de concluir.`,
      });
    } else if (estacionarios.length === 0) {
      avisos.push({
        nivel: 'info',
        texto: 'O modelo não tem nenhum ponto de inclinação nula dentro da faixa testada — o melhor resultado está na borda, e a condição recomendada abaixo é a melhor executável.',
      });
    }
  }

  const caminho = naBorda ? caminhoMaximaInclinacao(beta, termos, k, fatores, objetivo) : null;

  return { canonica, estacionario, estacionarios, recomendado, avisos, caminho, limiteCodificado: limite, objetivo, alvo };
}
