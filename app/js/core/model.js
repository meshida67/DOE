/**
 * model.js — modelo quadrático completo e seu ajuste por mínimos quadrados.
 *
 *   ŷ = b₀ + Σ bᵢ xᵢ + Σ bᵢᵢ xᵢ² + Σ bᵢⱼ xᵢxⱼ
 *
 * É o modelo padrão de Metodologia de Superfície de Resposta: o menor
 * polinômio capaz de ter um máximo interno, que é justamente o que se procura
 * ao otimizar um rendimento.
 */

import { lstsq } from './matrix.js';
import { tPValue, tCritical } from './stats.js';

/**
 * Lista ordenada dos termos do modelo.
 * A ordem é fixa e é o contrato entre o vetor de coeficientes e todo o resto:
 * intercepto, lineares, quadráticos, interações.
 */
export function montarTermos(k, nomesFatores = null) {
  const nome = (i) => (nomesFatores ? nomesFatores[i] : `x${i + 1}`);
  const termos = [{ tipo: 'intercepto', rotulo: 'b0', descricao: 'Constante' }];

  for (let i = 0; i < k; i++) {
    termos.push({ tipo: 'linear', i, rotulo: `b${i + 1}`, descricao: `Efeito de ${nome(i)}` });
  }
  for (let i = 0; i < k; i++) {
    termos.push({ tipo: 'quadratico', i, rotulo: `b${i + 1}${i + 1}`, descricao: `Curvatura de ${nome(i)}` });
  }
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      termos.push({ tipo: 'interacao', i, j, rotulo: `b${i + 1}${j + 1}`, descricao: `Interação ${nome(i)} × ${nome(j)}` });
    }
  }
  return termos;
}

/** Valor de um termo numa linha de coordenadas codificadas. */
export function valorTermo(termo, x) {
  switch (termo.tipo) {
    case 'intercepto': return 1;
    case 'linear': return x[termo.i];
    case 'quadratico': return x[termo.i] * x[termo.i];
    case 'interacao': return x[termo.i] * x[termo.j];
    default: throw new Error(`Termo desconhecido: ${termo.tipo}`);
  }
}

/** Matriz X do modelo (uma linha por ensaio, uma coluna por termo). */
export function montarX(linhasCodificadas, termos) {
  return linhasCodificadas.map((x) => termos.map((t) => valorTermo(t, x)));
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

  const tCrit = glResiduo > 0 ? tCritical(confianca, glResiduo) : NaN;

  const coeficientes = termos.map((termo, j) => {
    const erroPadrao = glResiduo > 0 ? Math.sqrt(qmResiduo * XtXinv[j][j]) : NaN;
    const t = erroPadrao > 0 ? beta[j] / erroPadrao : NaN;
    const pValor = glResiduo > 0 ? tPValue(t, glResiduo) : NaN;
    const margem = erroPadrao * tCrit;
    return {
      ...termo,
      valor: beta[j],
      erroPadrao,
      t,
      pValor,
      significativo: isFinite(pValor) ? pValor < 1 - confianca : false,
      ic: [beta[j] - margem, beta[j] + margem],
    };
  });

  return { beta, coeficientes, previstos, residuos, X, XtXinv, glResiduo, sqResiduo, qmResiduo, termos, confianca };
}

/**
 * Gradiente ∇ŷ em coordenadas codificadas.
 * g_i = b_i + 2·b_ii·x_i + Σ_{j≠i} b_ij·x_j
 */
export function gradiente(x, beta, termos, k) {
  const g = new Array(k).fill(0);
  termos.forEach((t, idx) => {
    const b = beta[idx];
    if (t.tipo === 'linear') g[t.i] += b;
    else if (t.tipo === 'quadratico') g[t.i] += 2 * b * x[t.i];
    else if (t.tipo === 'interacao') { g[t.i] += b * x[t.j]; g[t.j] += b * x[t.i]; }
  });
  return g;
}

/**
 * Matriz B dos coeficientes de segunda ordem, tal que a parte quadrática do
 * modelo seja x' B x. Os termos cruzados entram divididos por 2 porque
 * b_ij·x_i·x_j se reparte entre as posições (i,j) e (j,i).
 * A Hessiana do modelo é 2B.
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
  let s = 0;
  for (let i = 0; i < x0.length; i++) {
    for (let j = 0; j < x0.length; j++) s += x0[i] * ajuste.XtXinv[i][j] * x0[j];
  }
  return Math.sqrt(Math.max(0, ajuste.qmResiduo * s));
}
