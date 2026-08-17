/**
 * coding.js — conversão entre unidades reais (°C, mL, g/L) e coordenadas
 * codificadas adimensionais, que é onde toda a matemática acontece.
 *
 * Por que codificar: em coordenadas codificadas as colunas da matriz do
 * modelo ficam ortogonais ou quase, o sistema de mínimos quadrados fica
 * bem-condicionado por construção, e os coeficientes passam a ser
 * comparáveis entre si (um b grande significa fator influente,
 * independentemente da unidade). O usuário nunca vê esses números.
 *
 * ── A decisão de escala ──────────────────────────────────────────────────
 * Um CCD tem pontos axiais a ±α. Com α > 1 eles caem FORA do intervalo
 * fatorial ±1, e é preciso decidir o que os limites informados pelo usuário
 * significam:
 *
 *   'absoluto'  (padrão) — mín/máx são limites físicos intransponíveis.
 *                Escalamos de modo que o ponto MAIS EXTREMO do planejamento
 *                caia exatamente sobre eles. Nenhum ensaio pede algo fora da
 *                faixa declarada. É o único modo seguro quando o limite vem
 *                de segurança, solubilidade ou faixa do equipamento.
 *
 *   'fatorial'  — mín/máx são os níveis ±1, e os axiais podem extrapolar.
 *                Dá uma região explorada maior, mas só é aceitável quando o
 *                usuário confirma que consegue ir além.
 */

/** Coordenada codificada mais extrema presente num CCD com esse α. */
export function extremeCoded(alpha) {
  return Math.max(Math.abs(alpha), 1);
}

/**
 * Enriquece um fator com centro e passo de codificação.
 * @param {{nome:string, unidade:string, min:number, max:number, casasDecimais?:number}} fator
 */
export function prepararFator(fator, alpha, limitMode = 'absoluto') {
  const min = Number(fator.min);
  const max = Number(fator.max);
  const centro = (min + max) / 2;
  const semiAmplitude = (max - min) / 2;
  const unidadeCodificada =
    limitMode === 'fatorial' ? semiAmplitude : semiAmplitude / extremeCoded(alpha);
  return { ...fator, min, max, centro, semiAmplitude, unidadeCodificada };
}

/** codificado → real */
export function paraReal(codificado, fator) {
  return fator.centro + codificado * fator.unidadeCodificada;
}

/** real → codificado */
export function paraCodificado(real, fator) {
  if (fator.unidadeCodificada === 0) return 0;
  return (real - fator.centro) / fator.unidadeCodificada;
}

/**
 * Arredonda para um número de casas decimais praticável no laboratório.
 * Pedir "43,7283 °C" a um químico é ruído; pedir "43,7 °C" é uma instrução.
 */
export function arredondar(valor, casasDecimais) {
  if (casasDecimais === undefined || casasDecimais === null) return valor;
  const f = Math.pow(10, casasDecimais);
  return Math.round(valor * f) / f;
}

/**
 * Casas decimais sugeridas a partir da amplitude do fator, quando o usuário
 * não especifica: queremos ~3 dígitos significativos no passo do
 * planejamento, sem exigir precisão irreal.
 */
export function casasDecimaisSugeridas(min, max) {
  const amplitude = Math.abs(max - min);
  if (!(amplitude > 0)) return 2;
  const ordem = Math.floor(Math.log10(amplitude));
  return Math.max(0, Math.min(4, 2 - ordem));
}

/** Converte uma linha codificada inteira para valores reais arredondados. */
export function linhaParaReal(codificados, fatores) {
  return codificados.map((c, i) =>
    arredondar(paraReal(c, fatores[i]), fatores[i].casasDecimais)
  );
}

/** Converte uma linha de valores reais de volta para codificados. */
export function linhaParaCodificado(reais, fatores) {
  return reais.map((r, i) => paraCodificado(r, fatores[i]));
}
