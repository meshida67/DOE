/**
 * design.js — geração do Planejamento Composto Central (CCD).
 *
 * Um CCD tem três blocos de ensaios:
 *   fatorial  2^k pontos nos vértices (±1 em todos os fatores) → termos
 *             lineares e de interação;
 *   axial     2k pontos sobre os eixos (±α num fator, 0 nos demais) → é o
 *             que permite estimar curvatura de cada fator separadamente;
 *   central   n_c réplicas no centro (0 em todos) → estimam o erro puro do
 *             experimento, e sem elas não há teste de falta de ajuste.
 */

import { extremeCoded } from './coding.js';

export const MAX_FATORES = 4;
export const MIN_FATORES = 2;

/** PRNG determinístico — mesma semente, mesma ordem de ensaios. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash estável de string para semente (FNV-1a de 32 bits). */
export function sementeDeTexto(texto) {
  let h = 0x811c9dc5;
  const s = String(texto ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * α rotacionável: (2^k)^(1/4). Faz a variância da previsão depender só da
 * distância ao centro, não da direção — o planejamento "enxerga" igualmente
 * bem para todos os lados.
 */
export function alphaRotacionavel(k) {
  return Math.pow(Math.pow(2, k), 0.25);
}

/**
 * α ortogonal: desacopla as estimativas dos termos quadráticos entre si.
 * Depende do número de pontos centrais.
 */
export function alphaOrtogonal(k, pontosCentrais) {
  const F = Math.pow(2, k);
  const N = F + 2 * k + pontosCentrais;
  return Math.sqrt((Math.sqrt(N * F) - F) / 2);
}

export function resolverAlpha(tipo, k, pontosCentrais) {
  switch (tipo) {
    case 'face': return 1;
    case 'rotacionavel': return alphaRotacionavel(k);
    case 'ortogonal': return alphaOrtogonal(k, pontosCentrais);
    default: {
      const v = Number(tipo);
      if (!isFinite(v) || v <= 0) throw new Error(`Valor de α inválido: ${tipo}`);
      return v;
    }
  }
}

/** Bloco fatorial completo 2^k em ordem de Yates. */
export function blocoFatorial(k) {
  const linhas = [];
  for (let i = 0; i < Math.pow(2, k); i++) {
    const linha = [];
    for (let j = 0; j < k; j++) linha.push((i >> j) & 1 ? 1 : -1);
    linhas.push(linha);
  }
  return linhas;
}

/** Bloco axial: 2k pontos a ±α sobre cada eixo. */
export function blocoAxial(k, alpha) {
  const linhas = [];
  for (let j = 0; j < k; j++) {
    for (const s of [-1, 1]) {
      const linha = new Array(k).fill(0);
      linha[j] = s * alpha;
      linhas.push(linha);
    }
  }
  return linhas;
}

/** Bloco central: n_c réplicas na origem. */
export function blocoCentral(k, n) {
  return Array.from({ length: n }, () => new Array(k).fill(0));
}

/**
 * Monta a matriz do planejamento em coordenadas codificadas.
 * Devolve as linhas em ordem padrão, com tipo e ordem de execução sorteada.
 *
 * @param {object} opcoes
 * @param {number} opcoes.k             número de fatores
 * @param {number} opcoes.alpha         distância axial já resolvida
 * @param {number} opcoes.pontosCentrais
 * @param {boolean} opcoes.aleatorizar
 * @param {number} opcoes.semente
 */
export function gerarMatrizCCD({ k, alpha, pontosCentrais, aleatorizar = true, semente = 1 }) {
  if (k < MIN_FATORES || k > MAX_FATORES) {
    throw new Error(`O planejamento composto central aqui suporta de ${MIN_FATORES} a ${MAX_FATORES} fatores (recebido: ${k}).`);
  }
  if (!(pontosCentrais >= 1)) throw new Error('É preciso ao menos 1 ponto central.');

  const linhas = [
    ...blocoFatorial(k).map((c) => ({ codificados: c, tipo: 'fatorial' })),
    ...blocoAxial(k, alpha).map((c) => ({ codificados: c, tipo: 'axial' })),
    ...blocoCentral(k, pontosCentrais).map((c) => ({ codificados: c, tipo: 'central' })),
  ].map((linha, i) => ({ ...linha, ordemPadrao: i + 1 }));

  // Ordem de execução aleatória: protege contra tendências temporais
  // (o reagente que envelhece, o banho que aquece ao longo do dia)
  // se confundirem com o efeito dos fatores.
  const ordem = linhas.map((_, i) => i);
  if (aleatorizar) {
    const rnd = mulberry32(semente);
    for (let i = ordem.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
    }
  }
  ordem.forEach((idxLinha, posicao) => { linhas[idxLinha].ordemExecucao = posicao + 1; });

  return linhas;
}

/** Número de coeficientes do modelo quadrático completo com k fatores. */
export function numeroParametros(k) {
  return 1 + k + k + (k * (k - 1)) / 2;
}

/**
 * Diagnóstico do planejamento, em linguagem que o usuário final entende.
 * Roda ANTES dos ensaios, quando ainda dá para corrigir.
 */
export function diagnosticarPlanejamento({ k, alpha, pontosCentrais, limitMode }) {
  const N = Math.pow(2, k) + 2 * k + pontosCentrais;
  const p = numeroParametros(k);
  const glResiduo = N - p;
  const glErroPuro = pontosCentrais - 1;
  const avisos = [];

  if (glResiduo < 0) {
    avisos.push({
      nivel: 'erro',
      texto: `O planejamento tem ${N} ensaios para estimar ${p} coeficientes. Faltam ensaios — aumente o número de repetições no ponto central.`,
    });
  } else if (glResiduo === 0) {
    avisos.push({
      nivel: 'erro',
      texto: `Com ${N} ensaios e ${p} coeficientes, o modelo passaria exatamente por todos os pontos e não seria possível avaliar se ele é bom. Aumente as repetições no ponto central.`,
    });
  }
  if (glErroPuro < 1) {
    avisos.push({
      nivel: 'aviso',
      texto: 'Sem repetições no ponto central não é possível medir o erro do próprio experimento nem testar se o modelo descreve bem os dados. Recomendamos ao menos 3 repetições.',
    });
  } else if (glErroPuro < 2) {
    avisos.push({
      nivel: 'aviso',
      texto: 'Com apenas 2 repetições no ponto central a estimativa do erro experimental é frágil. 3 repetições é o mínimo confortável.',
    });
  }
  if (limitMode === 'fatorial' && alpha > 1) {
    const excesso = ((alpha - 1) * 100).toFixed(0);
    avisos.push({
      nivel: 'aviso',
      texto: `Alguns ensaios vão pedir valores até ${excesso}% além dos limites informados. Confirme que esses valores são viáveis no laboratório.`,
    });
  }

  return {
    totalEnsaios: N,
    numeroCoeficientes: p,
    glResiduo,
    glErroPuro,
    pontosFatoriais: Math.pow(2, k),
    pontosAxiais: 2 * k,
    pontosCentrais,
    alpha,
    extremoCodificado: extremeCoded(alpha),
    avisos,
  };
}
