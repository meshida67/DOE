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

import { solveLinear, jacobiEigen, matvec } from './matrix.js';
import { prever, gradiente, matrizB, vetorLinear, erroPadraoPrevisao } from './model.js';
import { extremeCoded, paraReal, arredondar } from './coding.js';

/** Score a maximizar, conforme o objetivo declarado pelo usuário. */
function montarScore(objetivo, alvo) {
  if (objetivo === 'minimizar') return (yhat) => -yhat;
  if (objetivo === 'alvo') return (yhat) => -Math.abs(yhat - alvo);
  return (yhat) => yhat;
}

/**
 * Ponto estacionário: resolve ∇ŷ = 0, isto é, b_linear + 2·B·x = 0.
 * Devolve null se B for singular (superfície sem ponto estacionário único —
 * um cume alongado, por exemplo).
 */
export function pontoEstacionario(beta, termos, k) {
  const B = matrizB(beta, termos, k);
  const bLin = vetorLinear(beta, termos, k);
  const doisB = B.map((linha) => linha.map((v) => 2 * v));
  return solveLinear(doisB, bLin.map((v) => -v));
}

/**
 * Análise canônica: diagonaliza B. O sinal dos autovalores classifica a
 * superfície, e os autovetores dão as direções principais.
 */
export function analiseCanonica(beta, termos, k) {
  const B = matrizB(beta, termos, k);
  const { values, vectors } = jacobiEigen(B);
  const maxAbs = Math.max(...values.map(Math.abs));
  const tol = maxAbs * 1e-8;

  const negativos = values.filter((v) => v < -tol).length;
  const positivos = values.filter((v) => v > tol).length;
  const nulos = values.filter((v) => Math.abs(v) <= tol).length;

  let tipo, explicacao;
  if (nulos > 0) {
    tipo = 'cume';
    explicacao = 'A superfície tem uma direção quase plana: existe uma faixa de condições, e não um único ponto, com desempenho equivalente. Isso dá liberdade para escolher a condição mais barata ou mais fácil de executar dentro dessa faixa.';
  } else if (negativos === k) {
    tipo = 'maximo';
    explicacao = 'A superfície tem um pico bem definido.';
  } else if (positivos === k) {
    tipo = 'minimo';
    explicacao = 'A superfície tem um vale bem definido.';
  } else {
    tipo = 'sela';
    explicacao = 'A superfície é um ponto de sela: sobe numa direção e desce em outra. Não existe pico interno — o melhor resultado está na borda da região testada.';
  }

  return { autovalores: values, autovetores: vectors, tipo, explicacao, B };
}

/**
 * Melhor ponto dentro da caixa viável, por busca em grade seguida de
 * refinamento local em janelas que encolhem.
 *
 * Grade + refinamento em vez de um otimizador com gradiente porque a função é
 * barata, a dimensão é ≤ 4 e queremos o ÓTIMO GLOBAL da caixa: um método
 * local partindo do centro cairia no ponto errado sempre que a superfície for
 * uma sela, que é justamente o caso difícil.
 */
export function otimoRestrito(beta, termos, k, limite, objetivo, alvo) {
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
    const passo = nPontos > 1 ? (hi[dim] - lo[dim]) / (nPontos - 1) : 0;
    for (let i = 0; i < nPontos; i++) {
      x[dim] = lo[dim] + i * passo;
      varrer(dim + 1, lo, hi, nPontos);
    }
  };

  const loGlobal = new Array(k).fill(-limite);
  const hiGlobal = new Array(k).fill(limite);
  varrer(0, loGlobal, hiGlobal, pontosPorEixo);

  // Refinamento: janelas sucessivamente menores em torno do melhor ponto,
  // sempre recortadas pela caixa viável.
  let largura = (2 * limite) / (pontosPorEixo - 1);
  for (let it = 0; it < 6; it++) {
    const centro = melhor.x.slice();
    const lo = centro.map((c) => Math.max(-limite, c - largura));
    const hi = centro.map((c) => Math.min(limite, c + largura));
    varrer(0, lo, hi, 11);
    largura /= 4;
  }

  // Polimento de Newton. Num modelo quadrático o passo de Newton salta direto
  // para o ponto estacionário, então isto leva o ótimo INTERIOR à precisão da
  // máquina — a grade sozinha para em ~1e-6. O passo só é aceito se continuar
  // dentro da caixa e melhorar o score, o que descarta automaticamente os
  // casos em que o estacionário é sela ou mínimo (ao maximizar).
  //
  // Não se aplica ao objetivo 'alvo': ali o que se otimiza é |ŷ − alvo|, cujo
  // ótimo não fica onde o gradiente de ŷ se anula.
  if (objetivo !== 'alvo') {
    const doisB = matrizB(beta, termos, k).map((linha) => linha.map((v) => 2 * v));
    const g = gradiente(melhor.x, beta, termos, k);
    const passo = solveLinear(doisB, g.map((v) => -v));
    if (passo && passo.every(Number.isFinite)) {
      const candidato = melhor.x.map((v, i) => v + passo[i]);
      if (candidato.every((v) => Math.abs(v) <= limite + 1e-12)) {
        const yhat = prever(candidato, beta, termos);
        const s = score(yhat);
        if (s > melhor.score) melhor = { score: s, yhat, x: candidato };
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

  const canonica = analiseCanonica(beta, termos, k);
  const estacionarioCodificado = pontoEstacionario(beta, termos, k);

  let estacionario = null;
  if (estacionarioCodificado && estacionarioCodificado.every(Number.isFinite)) {
    const dentro = estacionarioCodificado.every((v) => Math.abs(v) <= limite + 1e-9);
    estacionario = {
      codificados: estacionarioCodificado,
      reais: estacionarioCodificado.map((c, j) => arredondar(paraReal(c, fatores[j]), fatores[j].casasDecimais)),
      previsto: prever(estacionarioCodificado, beta, termos),
      dentroDaRegiao: dentro,
      distanciaCentro: Math.hypot(...estacionarioCodificado),
    };
  }

  const melhor = otimoRestrito(beta, termos, k, limite, objetivo, alvo);
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

  const caminho = naBorda ? caminhoMaximaInclinacao(beta, termos, k, fatores, objetivo) : null;

  return { canonica, estacionario, recomendado, avisos, caminho, limiteCodificado: limite, objetivo, alvo };
}
