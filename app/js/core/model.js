/**
 * model.js — modelo polinomial (quadrático ou cúbico) e seu ajuste por
 * mínimos quadrados.
 *
 *   quadrático:  ŷ = b₀ + Σ bᵢ xᵢ + Σ bᵢᵢ xᵢ² + Σ bᵢⱼ xᵢxⱼ
 *   cúbico:      + Σ bᵢᵢᵢ xᵢ³ + Σ bᵢⱼₗ xᵢxⱼxₗ [+ Σ bᵢᵢⱼ xᵢ²xⱼ]
 *
 * O quadrático é o modelo padrão de Metodologia de Superfície de Resposta: o
 * menor polinômio capaz de ter um máximo interno. O cúbico existe para
 * superfícies que o quadrático não descreve bem — ver `montarTermos`.
 *
 * Cada termo carrega `expoentes` (um por fator) além de `tipo`/`rotulo`/
 * `descricao`: é o que permite `valorTermo`, `gradiente` e `hessiana` serem
 * genéricos sobre o grau do modelo, em vez de um `switch` por tipo que
 * silenciosamente ignora qualquer tipo que não conheça.
 */

import { lstsq } from './matrix.js';
import { tPValue, tCritical, mean } from './stats.js';

/** Potência de expoente inteiro pequeno, bit-idêntica às multiplicações diretas que substitui (nunca `Math.pow`, que pode arredondar 1 ulp diferente de x*x). */
function pot(x, e) {
  if (e === 0) return 1;
  if (e === 1) return x;
  if (e === 2) return x * x;
  if (e === 3) return x * x * x;
  return Math.pow(x, e);
}

/**
 * Lista ordenada dos termos do modelo.
 * A ordem é fixa e é o contrato entre o vetor de coeficientes e todo o resto:
 * intercepto, lineares, quadráticos, interações — e, se `modelo` pedir grau
 * cúbico, cúbicos puros, interações triplas e, no modelo completo, os mistos
 * xᵢ²xⱼ. Os grupos quadráticos nunca mudam de posição: `cubicoReduzido` e
 * `cubicoCompleto` apenas apensam grupos novos, então os `k` primeiros
 * coeficientes de um ajuste cúbico significam a mesma coisa que num ajuste
 * quadrático (e os casos de referência do quadrático continuam válidos
 * byte a byte).
 */
export function montarTermos(k, nomesFatores = null, modelo = 'quadratico') {
  const nome = (i) => (nomesFatores ? nomesFatores[i] : `x${i + 1}`);
  const zeros = () => new Array(k).fill(0);
  const termos = [{ tipo: 'intercepto', expoentes: zeros(), rotulo: 'b0', descricao: 'Constante' }];

  for (let i = 0; i < k; i++) {
    const e = zeros(); e[i] = 1;
    termos.push({ tipo: 'linear', i, expoentes: e, rotulo: `b${i + 1}`, descricao: `Efeito de ${nome(i)}` });
  }
  for (let i = 0; i < k; i++) {
    const e = zeros(); e[i] = 2;
    termos.push({ tipo: 'quadratico', i, expoentes: e, rotulo: `b${i + 1}${i + 1}`, descricao: `Curvatura de ${nome(i)}` });
  }
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const e = zeros(); e[i] = 1; e[j] = 1;
      termos.push({ tipo: 'interacao', i, j, expoentes: e, rotulo: `b${i + 1}${j + 1}`, descricao: `Interação ${nome(i)} × ${nome(j)}` });
    }
  }

  if (modelo === 'quadratico') return termos;

  // Cúbicos puros: xᵢ³. Estimáveis no mesmo CCD do quadrático, desde que
  // α não seja 1 (com só 3 níveis por fator, x³ ≡ x exatamente).
  for (let i = 0; i < k; i++) {
    const e = zeros(); e[i] = 3;
    termos.push({ tipo: 'cubico', i, expoentes: e, rotulo: `b${i + 1}${i + 1}${i + 1}`, descricao: `Curvatura em S de ${nome(i)}` });
  }
  // Interações triplas: xᵢxⱼxₗ. Também estimáveis sem ensaios extras.
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      for (let l = j + 1; l < k; l++) {
        const e = zeros(); e[i] = 1; e[j] = 1; e[l] = 1;
        termos.push({
          tipo: 'interacaoTripla', i, j, l, expoentes: e,
          rotulo: `b${i + 1}${j + 1}${l + 1}`,
          descricao: `Interação tripla ${nome(i)} × ${nome(j)} × ${nome(l)}`,
        });
      }
    }
  }

  if (modelo === 'cubicoReduzido') return termos;

  // Mistos xᵢ²xⱼ: fecham o cúbico completo, mas exigem ensaios além do CCD
  // (são colineares com os pontos fatoriais e axiais de qualquer CCD).
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      if (i === j) continue;
      const e = zeros(); e[i] = 2; e[j] = 1;
      termos.push({
        tipo: 'quadraticoCruzado', i, j, expoentes: e,
        rotulo: `b${i + 1}${i + 1}${j + 1}`,
        descricao: `Curvatura de ${nome(i)} dependente de ${nome(j)}`,
      });
    }
  }
  return termos;
}

/** Valor de um termo numa linha de coordenadas codificadas: produto das coordenadas elevadas aos seus expoentes. */
export function valorTermo(termo, x) {
  const expoentes = termo.expoentes;
  if (!expoentes) throw new Error(`Termo sem expoentes: ${JSON.stringify(termo)}`);
  let v = 1;
  for (let idx = 0; idx < expoentes.length; idx++) {
    const e = expoentes[idx];
    if (e === 0) continue;
    v *= pot(x[idx], e);
  }
  return v;
}

/** Matriz X do modelo (uma linha por ensaio, uma coluna por termo). */
export function montarX(linhasCodificadas, termos) {
  return linhasCodificadas.map((x) => termos.map((t) => valorTermo(t, x)));
}

/**
 * Forma quadrática x0'(X'X)⁻¹x0 — a alavancagem de um ponto sobre o ajuste.
 * `x0` já é a linha de X (valores dos termos), não coordenadas cruas: tanto
 * `erroPadraoPrevisao` (num ponto novo) quanto o PRESS (nos próprios ensaios,
 * onde `x0` é `ajuste.X[i]`) usam exatamente a mesma forma.
 */
function alavancagem(x0, XtXinv) {
  let s = 0;
  const p = x0.length;
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) s += x0[i] * XtXinv[i][j] * x0[j];
  }
  return s;
}

/** Previsão do modelo num ponto codificado. */
export function prever(x, beta, termos) {
  let s = 0;
  for (let i = 0; i < termos.length; i++) s += beta[i] * valorTermo(termos[i], x);
  return s;
}

/**
 * Ajusta o modelo. Devolve coeficientes com erro-padrão, estatística t,
 * p-valor e intervalo de confiança.
 */
export function ajustar(linhasCodificadas, y, termos, confianca = 0.95) {
  const n = y.length;
  const p = termos.length;
  if (n < p) {
    throw new Error(`São necessários pelo menos ${p} ensaios com resultado para ajustar o modelo (há ${n}).`);
  }

  const X = montarX(linhasCodificadas, termos);
  const { beta, XtXinv } = lstsq(X, y);

  const previstos = linhasCodificadas.map((x) => prever(x, beta, termos));
  const residuos = y.map((v, i) => v - previstos[i]);

  const glResiduo = n - p;
  const sqResiduo = residuos.reduce((s, r) => s + r * r, 0);
  const qmResiduo = glResiduo > 0 ? sqResiduo / glResiduo : NaN;

  // Ajuste exato: os dados vêm de um cálculo (simulador), não de medição, e o
  // modelo reproduziu todos os pontos a menos do arredondamento de ponto
  // flutuante. Sem isso, qmResiduo ~1e-28 faz t ~1e15 e TODOS os coeficientes
  // aparecem como "altamente significativos" — falsa confiança, não falsa
  // insignificância. O limiar é relativo à escala da resposta (não a zero
  // absoluto): medido, o arredondamento típico fica em sqResiduo/sqTotal
  // ~1e-12; 1e-8 é quatro ordens de grandeza acima disso e muito abaixo de
  // qualquer ruído real de laboratório.
  const media = mean(y);
  const sqTotalLocal = y.reduce((s, v) => s + (v - media) ** 2, 0);
  const escala = sqTotalLocal > 0 ? sqTotalLocal : Math.max(1e-300, ...y.map((v) => v * v));
  const ajusteExato = sqResiduo <= 1e-8 * escala;

  const tCrit = glResiduo > 0 && !ajusteExato ? tCritical(confianca, glResiduo) : NaN;

  const coeficientes = termos.map((termo, j) => {
    const erroPadrao = glResiduo > 0 && !ajusteExato ? Math.sqrt(qmResiduo * XtXinv[j][j]) : NaN;
    const t = erroPadrao > 0 ? beta[j] / erroPadrao : NaN;
    const pValor = glResiduo > 0 && !ajusteExato ? tPValue(t, glResiduo) : NaN;
    const margem = erroPadrao * tCrit;
    return {
      ...termo,
      valor: beta[j],
      erroPadrao,
      t,
      pValor,
      // null (não `false`) quando ajusteExato: "não sabemos se é significativo"
      // é diferente de "não é significativo".
      significativo: ajusteExato ? null : (isFinite(pValor) ? pValor < 1 - confianca : false),
      ic: [beta[j] - margem, beta[j] + margem],
    };
  });

  // PRESS e R² predito: a capacidade de previsão em ensaios NÃO usados no
  // ajuste (leave-one-out, calculado sem refazer o ajuste n vezes, pela
  // fórmula clássica e_i/(1−h_i)). É a métrica que distingue "o modelo
  // melhorou" de "o modelo decorou os pontos" quando dois graus diferentes
  // são comparados — o R² comum não discrimina isso.
  const alavancagens = X.map((linha) => alavancagem(linha, XtXinv));
  const pontosNaoDeletaveis = alavancagens.filter((h) => 1 - h < 1e-10).length;
  let press = NaN;
  let r2Predito = NaN;
  if (pontosNaoDeletaveis === 0) {
    press = residuos.reduce((s, r, i) => s + (r / (1 - alavancagens[i])) ** 2, 0);
    r2Predito = sqTotalLocal > 0 ? 1 - press / sqTotalLocal : NaN;
  }

  return {
    beta, coeficientes, previstos, residuos, X, XtXinv, glResiduo, sqResiduo, qmResiduo, ajusteExato,
    alavancagens, press, r2Predito, pontosNaoDeletaveis, termos, confianca,
  };
}

/**
 * Gradiente ∇ŷ em coordenadas codificadas, genérico sobre o grau do modelo:
 * cada termo contribui e_i·x^(e_i−1)·Πₘxₘ^(e_m) à derivada parcial em x_i.
 * Para um modelo quadrático é bit-idêntico ao antigo dispatch por tipo
 * (verificado: 2·b·x e b·2·x arredondam o mesmo produto real, pois multiplicar
 * por 2 nunca introduz erro em ponto flutuante).
 */
export function gradiente(x, beta, termos, k) {
  const g = new Array(k).fill(0);
  termos.forEach((t, idx) => {
    const b = beta[idx];
    const e = t.expoentes;
    for (let i = 0; i < k; i++) {
      if (e[i] === 0) continue;
      let d = e[i] * pot(x[i], e[i] - 1);
      for (let m = 0; m < k; m++) {
        if (m === i || e[m] === 0) continue;
        d *= pot(x[m], e[m]);
      }
      g[i] += b * d;
    }
  });
  return g;
}

/**
 * Hessiana ∂²ŷ/∂xᵢ∂xⱼ em coordenadas codificadas, genérica sobre o grau do
 * modelo. Para um modelo quadrático é bit-idêntica a 2·matrizB (verificado:
 * a diagonal reduz a b·2·pot(x,0) = 2b, e o cruzado a b·1·1·pot(x,0)² = b,
 * que é 2·(b/2) porque dividir e multiplicar por 2 são exatos em IEEE-754).
 */
export function hessiana(x, beta, termos, k) {
  const H = Array.from({ length: k }, () => new Array(k).fill(0));
  termos.forEach((t, idx) => {
    const b = beta[idx];
    const e = t.expoentes;
    for (let a = 0; a < k; a++) {
      if (e[a] < 1) continue;
      if (e[a] >= 2) {
        let d = e[a] * (e[a] - 1) * pot(x[a], e[a] - 2);
        for (let m = 0; m < k; m++) {
          if (m === a || e[m] === 0) continue;
          d *= pot(x[m], e[m]);
        }
        H[a][a] += b * d;
      }
      for (let c = a + 1; c < k; c++) {
        if (e[c] < 1) continue;
        let d = e[a] * e[c] * pot(x[a], e[a] - 1) * pot(x[c], e[c] - 1);
        for (let m = 0; m < k; m++) {
          if (m === a || m === c || e[m] === 0) continue;
          d *= pot(x[m], e[m]);
        }
        H[a][c] += b * d;
        H[c][a] += b * d;
      }
    }
  });
  return H;
}

/**
 * Matriz B dos coeficientes de segunda ordem, tal que a parte quadrática do
 * modelo seja x' B x. Os termos cruzados entram divididos por 2 porque
 * b_ij·x_i·x_j se reparte entre as posições (i,j) e (j,i).
 * A Hessiana do modelo QUADRÁTICO é 2B — para um modelo cúbico, B não é a
 * Hessiana (que depende de x); use `hessiana(x, beta, termos, k)`.
 */
export function matrizB(beta, termos, k) {
  const B = Array.from({ length: k }, () => new Array(k).fill(0));
  termos.forEach((t, idx) => {
    if (t.tipo === 'quadratico') B[t.i][t.i] = beta[idx];
    else if (t.tipo === 'interacao') { B[t.i][t.j] = beta[idx] / 2; B[t.j][t.i] = beta[idx] / 2; }
  });
  return B;
}

/** Vetor dos coeficientes lineares. */
export function vetorLinear(beta, termos, k) {
  const b = new Array(k).fill(0);
  termos.forEach((t, idx) => { if (t.tipo === 'linear') b[t.i] = beta[idx]; });
  return b;
}

/**
 * Erro-padrão da previsão num ponto: se(ŷ) = √(QM_res · x₀'(X'X)⁻¹x₀).
 * É o que permite dizer "o ótimo previsto é 87 ± 3", em vez de um número seco.
 */
export function erroPadraoPrevisao(x, ajuste) {
  const x0 = ajuste.termos.map((t) => valorTermo(t, x));
  return Math.sqrt(Math.max(0, ajuste.qmResiduo * alavancagem(x0, ajuste.XtXinv)));
}
