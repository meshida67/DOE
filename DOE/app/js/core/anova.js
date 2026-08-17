/**
 * anova.js — Análise de Variância do ajuste.
 *
 * Além da decomposição usual (regressão / resíduo / total), quando existem
 * ensaios repetidos a soma quadrática residual é quebrada em:
 *
 *   erro puro       — a variação entre repetições do MESMO ponto. É o ruído
 *                     do experimento; nenhum modelo pode explicá-la.
 *   falta de ajuste — o que sobra. Se for grande comparada ao erro puro, o
 *                     problema não é o experimento ser ruidoso: é o modelo
 *                     quadrático não descrever bem a superfície.
 *
 * Essa separação é a única forma honesta de responder "o modelo está bom?",
 * e é por isso que repetições no ponto central não são opcionais.
 * Referência: Barros Neto, Scarminio & Bruns, "Como Fazer Experimentos".
 */

import { fPValue, mean } from './stats.js';

/** Agrupa índices de linhas que compartilham a mesma chave de réplica. */
function agrupar(chaves) {
  const mapa = new Map();
  chaves.forEach((chave, i) => {
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(i);
  });
  return [...mapa.values()];
}

/**
 * @param {object} entrada
 * @param {number[]} entrada.y                 resultados observados
 * @param {number[]} entrada.previstos         valores ajustados pelo modelo
 * @param {number}   entrada.numeroParametros  coeficientes do modelo (inclui b0)
 * @param {string[]} entrada.chavesReplica     identidade do ponto planejado
 */
export function anova({ y, previstos, numeroParametros, chavesReplica }) {
  const n = y.length;
  const p = numeroParametros;
  const media = mean(y);
  const residuos = y.map((v, i) => v - previstos[i]);

  const sqTotal = y.reduce((s, v) => s + (v - media) ** 2, 0);
  const sqResiduo = residuos.reduce((s, r) => s + r * r, 0);
  const sqRegressao = sqTotal - sqResiduo;

  const glTotal = n - 1;
  const glRegressao = p - 1;
  const glResiduo = n - p;

  const qmRegressao = glRegressao > 0 ? sqRegressao / glRegressao : NaN;
  const qmResiduo = glResiduo > 0 ? sqResiduo / glResiduo : NaN;
  const qmTotal = glTotal > 0 ? sqTotal / glTotal : NaN;

  const fRegressao = glResiduo > 0 ? qmRegressao / qmResiduo : NaN;
  const pRegressao = fPValue(fRegressao, glRegressao, glResiduo);

  const r2 = sqTotal > 0 ? 1 - sqResiduo / sqTotal : NaN;
  const r2Ajustado = glResiduo > 0 && glTotal > 0 ? 1 - (sqResiduo / glResiduo) / (sqTotal / glTotal) : NaN;

  const resultado = {
    n, p,
    sqRegressao, sqResiduo, sqTotal,
    glRegressao, glResiduo, glTotal,
    qmRegressao, qmResiduo, qmTotal,
    fRegressao, pRegressao,
    r2, r2Ajustado,
    temErroPuro: false,
  };

  // ── Erro puro e falta de ajuste ────────────────────────────────────────
  if (chavesReplica && chavesReplica.length === n) {
    const grupos = agrupar(chavesReplica).filter((g) => g.length > 1);
    if (grupos.length > 0) {
      let sqErroPuro = 0;
      let glErroPuro = 0;
      for (const g of grupos) {
        const valores = g.map((i) => y[i]);
        const m = mean(valores);
        sqErroPuro += valores.reduce((s, v) => s + (v - m) ** 2, 0);
        glErroPuro += g.length - 1;
      }
      const sqFaltaAjuste = sqResiduo - sqErroPuro;
      const glFaltaAjuste = glResiduo - glErroPuro;

      const qmErroPuro = glErroPuro > 0 ? sqErroPuro / glErroPuro : NaN;
      const qmFaltaAjuste = glFaltaAjuste > 0 ? sqFaltaAjuste / glFaltaAjuste : NaN;
      const fFaltaAjuste = glFaltaAjuste > 0 && qmErroPuro > 0 ? qmFaltaAjuste / qmErroPuro : NaN;
      const pFaltaAjuste = fPValue(fFaltaAjuste, glFaltaAjuste, glErroPuro);

      Object.assign(resultado, {
        temErroPuro: true,
        sqErroPuro, glErroPuro, qmErroPuro,
        sqFaltaAjuste, glFaltaAjuste, qmFaltaAjuste,
        fFaltaAjuste, pFaltaAjuste,
        // Teto de R² imposto pelo próprio ruído experimental: nenhum modelo,
        // por melhor que seja, explica a variação entre repetições.
        r2Maximo: sqTotal > 0 ? 1 - sqErroPuro / sqTotal : NaN,
        desvioPadraoExperimental: Math.sqrt(qmErroPuro),
      });
    }
  }

  return resultado;
}

/**
 * Traduz a ANOVA em frases que um usuário sem formação em estatística
 * consegue agir sobre. Devolve um veredito e a justificativa.
 */
export function interpretar(a, nivel = 0.05) {
  const mensagens = [];
  let veredito = 'ok';

  if (isFinite(a.pRegressao)) {
    if (a.pRegressao < nivel) {
      mensagens.push({
        nivel: 'bom',
        texto: `Os fatores realmente afetam a resposta — a chance de o padrão observado ser coincidência é de ${formatarP(a.pRegressao)}.`,
      });
    } else {
      veredito = 'ruim';
      mensagens.push({
        nivel: 'ruim',
        texto: 'Não há evidência de que os fatores afetem a resposta dentro da faixa testada. O modelo não deve ser usado para decidir condições ótimas.',
      });
    }
  }

  if (a.temErroPuro && isFinite(a.pFaltaAjuste)) {
    if (a.pFaltaAjuste < nivel) {
      veredito = veredito === 'ruim' ? 'ruim' : 'atencao';
      mensagens.push({
        nivel: 'ruim',
        texto: 'O modelo não acompanha bem o formato dos dados (falta de ajuste significativa). O ótimo indicado é uma aproximação grosseira — considere reduzir a faixa dos fatores e repetir o planejamento.',
      });
    } else {
      mensagens.push({
        nivel: 'bom',
        texto: 'O modelo descreve os dados dentro do ruído do próprio experimento — não há sinal de que ele esteja errando o formato da superfície.',
      });
    }
  } else {
    mensagens.push({
      nivel: 'neutro',
      texto: 'Sem repetições, não foi possível testar se o modelo descreve bem os dados. Repetir o ponto central resolveria isso no próximo planejamento.',
    });
  }

  if (isFinite(a.r2)) {
    const pct = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
    if (a.temErroPuro && isFinite(a.r2Maximo)) {
      mensagens.push({
        nivel: 'neutro',
        texto: `O modelo explica ${pct(a.r2)} da variação observada, de um máximo possível de ${pct(a.r2Maximo)} (o restante é ruído experimental).`,
      });
    } else {
      mensagens.push({ nivel: 'neutro', texto: `O modelo explica ${pct(a.r2)} da variação observada.` });
    }
  }

  return { veredito, mensagens };
}

export function formatarP(p) {
  if (!isFinite(p)) return '—';
  if (p < 0.0001) return 'menos de 0,01%';
  return `${(p * 100).toFixed(2).replace('.', ',')}%`;
}
