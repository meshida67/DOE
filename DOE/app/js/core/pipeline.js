/**
 * pipeline.js — orquestra os dois momentos do fluxo.
 *
 *   criarPlanejamento(spec)      → quais ensaios fazer
 *   analisarResultados(meta, …)  → o que os resultados dizem
 *
 * É a única camada que a interface e a camada de Excel precisam conhecer.
 */

import { prepararFator, paraCodificado, arredondar, casasDecimaisSugeridas } from './coding.js';
import { gerarMatrizCCD, resolverAlpha, diagnosticarPlanejamento, sementeDeTexto, MIN_FATORES, MAX_FATORES } from './design.js';
import { montarTermos, ajustar, prever } from './model.js';
import { anova, interpretar } from './anova.js';
import { encontrarOtimo } from './optimize.js';

export const VERSAO_ESQUEMA = 1;

export const CONFIG_PADRAO = {
  tipoAlpha: 'face',      // limites informados são intransponíveis
  pontosCentrais: 3,      // 2 g.l. de erro puro → teste de falta de ajuste
  limitMode: 'absoluto',
  aleatorizar: true,
  confianca: 0.95,
};

/** Validação da especificação, com mensagens dirigidas ao usuário final. */
export function validarSpec(spec) {
  const erros = [];
  const fatores = spec.fatores || [];

  if (!spec.experimento?.nome) erros.push('Informe um nome para o experimento.');
  if (!spec.resposta?.nome) erros.push('Informe o que você quer medir (a resposta do experimento).');

  if (fatores.length < MIN_FATORES) {
    erros.push(`São necessários ao menos ${MIN_FATORES} fatores. Com um só fator não há superfície de resposta para explorar.`);
  }
  if (fatores.length > MAX_FATORES) {
    erros.push(`Esta ferramenta trabalha com no máximo ${MAX_FATORES} fatores (recebidos: ${fatores.length}).`);
  }

  fatores.forEach((f, i) => {
    const rotulo = f.nome ? `"${f.nome}"` : `nº ${i + 1}`;
    if (!f.nome) erros.push(`O fator ${rotulo} está sem nome.`);
    if (!isFinite(Number(f.min))) erros.push(`O valor mínimo do fator ${rotulo} não é um número.`);
    if (!isFinite(Number(f.max))) erros.push(`O valor máximo do fator ${rotulo} não é um número.`);
    if (isFinite(Number(f.min)) && isFinite(Number(f.max)) && Number(f.min) >= Number(f.max)) {
      erros.push(`No fator ${rotulo}, o mínimo precisa ser menor que o máximo.`);
    }
  });

  const nomes = fatores.map((f) => String(f.nome || '').trim().toLowerCase()).filter(Boolean);
  if (new Set(nomes).size !== nomes.length) erros.push('Há fatores com o mesmo nome. Cada fator precisa de um nome distinto.');

  const objetivo = spec.resposta?.objetivo;
  if (objetivo && !['maximizar', 'minimizar', 'alvo'].includes(objetivo)) {
    erros.push(`Objetivo desconhecido: "${objetivo}". Use maximizar, minimizar ou alvo.`);
  }
  if (objetivo === 'alvo' && !isFinite(Number(spec.resposta?.alvo))) {
    erros.push('O objetivo é atingir um valor alvo, mas o alvo não foi informado.');
  }

  const pc = spec.config?.pontosCentrais ?? CONFIG_PADRAO.pontosCentrais;
  if (!(Number(pc) >= 1)) erros.push('O número de repetições no ponto central precisa ser pelo menos 1.');

  return erros;
}

/** spec do usuário → planejamento completo pronto para exportar. */
export function criarPlanejamento(spec) {
  const erros = validarSpec(spec);
  if (erros.length) {
    const e = new Error(erros.join('\n'));
    e.erros = erros;
    throw e;
  }

  const config = { ...CONFIG_PADRAO, ...(spec.config || {}) };
  const k = spec.fatores.length;
  const pontosCentrais = Number(config.pontosCentrais);
  const alpha = resolverAlpha(config.tipoAlpha, k, pontosCentrais);

  const fatores = spec.fatores.map((f) =>
    prepararFator(
      {
        ...f,
        min: Number(f.min),
        max: Number(f.max),
        casasDecimais: f.casasDecimais ?? casasDecimaisSugeridas(Number(f.min), Number(f.max)),
      },
      alpha,
      config.limitMode
    )
  );

  const semente = config.semente ?? sementeDeTexto(`${spec.experimento.nome}|${k}|${pontosCentrais}|${alpha}`);
  const linhas = gerarMatrizCCD({ k, alpha, pontosCentrais, aleatorizar: config.aleatorizar, semente });

  const ensaios = linhas.map((linha) => {
    const reais = linha.codificados.map((c, j) => arredondar(fatores[j].centro + c * fatores[j].unidadeCodificada, fatores[j].casasDecimais));
    return {
      id: `E${String(linha.ordemPadrao).padStart(2, '0')}`,
      ordemPadrao: linha.ordemPadrao,
      ordemExecucao: linha.ordemExecucao,
      tipo: linha.tipo,
      codificadosPlanejados: linha.codificados,
      reais,
      resposta: null,
    };
  });

  const diagnostico = diagnosticarPlanejamento({ k, alpha, pontosCentrais, limitMode: config.limitMode });

  const meta = {
    versaoEsquema: VERSAO_ESQUEMA,
    geradoEm: new Date().toISOString(),
    experimento: { ...spec.experimento },
    resposta: { objetivo: 'maximizar', ...spec.resposta },
    fatores,
    config: { ...config, alpha, semente, k },
  };

  return { meta, ensaios, diagnostico };
}

/**
 * Analisa os resultados. As coordenadas codificadas são RECALCULADAS a partir
 * dos valores reais informados na planilha, e não das planejadas: se o grupo
 * ajustou a temperatura para 45 °C onde o plano pedia 44,7 °C, a análise usa
 * o que foi realmente feito. Ensaios sem resposta são ignorados.
 */
export function analisarResultados(meta, ensaios) {
  const fatores = meta.fatores;
  const k = fatores.length;

  const usados = ensaios.filter((e) => e.resposta !== null && e.resposta !== undefined && isFinite(Number(e.resposta)));
  const termos = montarTermos(k, fatores.map((f) => f.nome));

  if (usados.length < termos.length) {
    const e = new Error(
      `Para ajustar o modelo são necessários pelo menos ${termos.length} ensaios preenchidos, mas só ${usados.length} têm resultado. Preencha a coluna de resultado na planilha.`
    );
    e.codigo = 'ENSAIOS_INSUFICIENTES';
    throw e;
  }

  const codificados = usados.map((e) => e.reais.map((r, j) => paraCodificado(Number(r), fatores[j])));
  const y = usados.map((e) => Number(e.resposta));

  const ajuste = ajustar(codificados, y, termos, meta.config.confianca ?? 0.95);

  // A identidade de réplica vem do PLANEJADO: os pontos centrais são
  // repetições por construção, mesmo que os valores executados variem um
  // pouco. Agrupar pelo executado quebraria os grupos.
  const chavesReplica = usados.map((e) =>
    (e.codificadosPlanejados || e.reais).map((v) => Number(v).toFixed(6)).join('|')
  );

  const tabelaAnova = anova({
    y,
    previstos: ajuste.previstos,
    numeroParametros: termos.length,
    chavesReplica,
  });
  const leitura = interpretar(tabelaAnova);

  const otimo = encontrarOtimo({
    ajuste,
    fatores,
    alpha: meta.config.alpha,
    objetivo: meta.resposta.objetivo || 'maximizar',
    alvo: meta.resposta.alvo !== undefined && meta.resposta.alvo !== null ? Number(meta.resposta.alvo) : null,
  });

  const ensaiosAnalisados = usados.map((e, i) => ({
    ...e,
    codificadosExecutados: codificados[i],
    previsto: ajuste.previstos[i],
    residuo: ajuste.residuos[i],
    residuoPadronizado: ajuste.qmResiduo > 0 ? ajuste.residuos[i] / Math.sqrt(ajuste.qmResiduo) : NaN,
  }));

  const ignorados = ensaios.length - usados.length;

  return { meta, ajuste, anova: tabelaAnova, leitura, otimo, ensaios: ensaiosAnalisados, ignorados, termos };
}

/** Avalia o modelo num ponto em unidades reais — usado pelos gráficos. */
export function preverEmReais(meta, ajuste, valoresReais) {
  const cod = valoresReais.map((r, j) => paraCodificado(Number(r), meta.fatores[j]));
  return prever(cod, ajuste.beta, ajuste.termos);
}
