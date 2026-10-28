/**
 * pipeline.js — orquestra os dois momentos do fluxo.
 *
 *   criarPlanejamento(spec)      → quais ensaios fazer
 *   analisarResultados(meta, …)  → o que os resultados dizem
 *
 * É a única camada que a interface e a camada de Excel precisam conhecer.
 */

import { prepararFator, paraCodificado, arredondar, casasDecimaisSugeridas } from './coding.js';
import { gerarMatrizCCD, resolverAlpha, diagnosticarPlanejamento, numeroParametros, sementeDeTexto, MIN_FATORES, MAX_FATORES } from './design.js';
import { montarTermos, ajustar, prever } from './model.js';
import { anova, interpretar } from './anova.js';
import { encontrarOtimo } from './optimize.js';

export const VERSAO_ESQUEMA = 1;

const MODELOS_VALIDOS = ['quadratico', 'cubicoReduzido', 'cubicoCompleto'];

export const CONFIG_PADRAO = {
  tipoAlpha: 'face',      // limites informados são intransponíveis
  pontosCentrais: 3,      // 2 g.l. de erro puro → teste de falta de ajuste
  limitMode: 'absoluto',
  aleatorizar: true,
  confianca: 0.95,
  modelo: 'quadratico',   // 'quadratico' | 'cubicoReduzido' | 'cubicoCompleto'
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

  const modelo = spec.config?.modelo ?? CONFIG_PADRAO.modelo;
  if (!MODELOS_VALIDOS.includes(modelo)) {
    erros.push(`Modelo desconhecido: "${modelo}". Use ${MODELOS_VALIDOS.join(', ')}.`);
  }

  // As checagens abaixo dependem do α resolvido, que só faz sentido calcular
  // se k, pontosCentrais e o modelo já são válidos — senão só duplicaria os
  // erros já reportados acima com uma mensagem pior.
  const k = fatores.length;
  const tipoAlpha = spec.config?.tipoAlpha ?? CONFIG_PADRAO.tipoAlpha;
  if (modelo !== 'quadratico' && MODELOS_VALIDOS.includes(modelo) && k >= MIN_FATORES && k <= MAX_FATORES && Number(pc) >= 1) {
    let alpha = null;
    try {
      alpha = resolverAlpha(tipoAlpha, k, Number(pc));
    } catch (err) {
      erros.push(err.message);
    }
    if (alpha !== null) {
      if (alpha <= 1 + 1e-9) {
        erros.push('Com os ensaios distribuídos apenas nas faces, cada fator assume só três valores diferentes, e nesses três valores um termo em S é indistinguível do termo simples — o modelo não pode ser ajustado. Escolha "Distribuição mais uniforme" em Opções avançadas.');
      }
      if (modelo === 'cubicoCompleto' && tipoAlpha === 'ortogonal') {
        erros.push('A distribuição "ortogonal" não é compatível com a curvatura em S completa. Escolha "Distribuição mais uniforme" em Opções avançadas.');
      }
      if (modelo === 'cubicoCompleto' && k > 3) {
        const extras = Math.pow(3, k) - Math.pow(2, k) - 1;
        erros.push(`A curvatura em S completa com ${k} fatores exigiria ${extras} ensaios extras — inviável numa turma de laboratório. Use "Curvatura em S — mesmos ensaios" ou reduza o número de fatores.`);
      } else if (alpha > 1 + 1e-9) {
        const extras = modelo === 'cubicoCompleto' ? Math.pow(3, k) - Math.pow(2, k) - 1 : 0;
        const N = Math.pow(2, k) + 2 * k + Number(pc) + extras;
        const p = numeroParametros(k, modelo);
        if (p > N) {
          erros.push(`Esse modelo tem ${p} coeficientes a estimar, mas o planejamento teria só ${N} ensaios. Aumente as repetições no centro ou escolha um modelo mais simples.`);
        }
      }
    }
  }

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

  // A semente NÃO inclui o modelo: um planejamento cujo único ensaio extra é
  // o bloco complementar do cúbico completo precisa embaralhar os blocos
  // fatorial/axial/central exatamente como o mesmo planejamento sem esse
  // bloco — é o que preserva os planejamentos (e os casos de referência) já
  // gerados quando alguém troca só o modelo.
  const semente = config.semente ?? sementeDeTexto(`${spec.experimento.nome}|${k}|${pontosCentrais}|${alpha}`);
  const linhas = gerarMatrizCCD({ k, alpha, pontosCentrais, aleatorizar: config.aleatorizar, semente, modelo: config.modelo });

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

  const diagnostico = diagnosticarPlanejamento({ k, alpha, pontosCentrais, limitMode: config.limitMode, modelo: config.modelo });

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
 *
 * `opcoes.modelo` permite reanalisar os MESMOS ensaios com um grau de modelo
 * diferente do gravado em `meta.config.modelo` — é o que possibilita comparar
 * quadrático e cúbico sem regerar o planejamento (o que mudaria o sorteio e
 * os ids). `meta.config` é normalizado com `CONFIG_PADRAO` antes de qualquer
 * uso: uma planilha `_DOE` gerada antes do modelo cúbico existir não tem
 * `config.modelo`, e precisa continuar analisando como quadrático.
 */
export function analisarResultados(meta, ensaios, opcoes = {}) {
  const config = { ...CONFIG_PADRAO, ...(meta.config || {}) };
  const modelo = opcoes.modelo || config.modelo;
  const fatores = meta.fatores;
  const k = fatores.length;

  const usados = ensaios.filter((e) => e.resposta !== null && e.resposta !== undefined && isFinite(Number(e.resposta)));
  const termos = montarTermos(k, fatores.map((f) => f.nome), modelo);

  if (usados.length < termos.length) {
    const e = new Error(
      `Para ajustar o modelo são necessários pelo menos ${termos.length} ensaios preenchidos, mas só ${usados.length} têm resultado. Preencha a coluna de resultado na planilha.`
    );
    e.codigo = 'ENSAIOS_INSUFICIENTES';
    throw e;
  }

  const codificados = usados.map((e) => e.reais.map((r, j) => paraCodificado(Number(r), fatores[j])));
  const y = usados.map((e) => Number(e.resposta));

  const ajuste = ajustar(codificados, y, termos, config.confianca ?? 0.95);

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
    ajusteExato: ajuste.ajusteExato,
  });
  const leitura = interpretar(tabelaAnova);

  const otimo = encontrarOtimo({
    ajuste,
    fatores,
    alpha: config.alpha,
    objetivo: meta.resposta.objetivo || 'maximizar',
    alvo: meta.resposta.alvo !== undefined && meta.resposta.alvo !== null ? Number(meta.resposta.alvo) : null,
  });

  // Com ajuste exato, os resíduos são só arredondamento de ponto flutuante
  // (~1e-14): padronizá-los produz valores em torno de ±1 que PARECEM um
  // padrão real no gráfico de resíduos, quando são só ruído numérico.
  const ensaiosAnalisados = usados.map((e, i) => ({
    ...e,
    codificadosExecutados: codificados[i],
    previsto: ajuste.previstos[i],
    residuo: ajuste.residuos[i],
    residuoPadronizado: ajuste.qmResiduo > 0 && !ajuste.ajusteExato ? ajuste.residuos[i] / Math.sqrt(ajuste.qmResiduo) : NaN,
  }));

  const ignorados = ensaios.length - usados.length;

  return { meta, ajuste, anova: tabelaAnova, leitura, otimo, ensaios: ensaiosAnalisados, ignorados, termos, modelo };
}

/** Avalia o modelo num ponto em unidades reais — usado pelos gráficos. */
export function preverEmReais(meta, ajuste, valoresReais) {
  const cod = valoresReais.map((r, j) => paraCodificado(Number(r), meta.fatores[j]));
  return prever(cod, ajuste.beta, ajuste.termos);
}
