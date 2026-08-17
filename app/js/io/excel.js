/**
 * excel.js — leitura e escrita dos arquivos .xlsx (SheetJS).
 *
 * São três arquivos no fluxo, e o segundo faz papel duplo — é a peça central
 * do desenho:
 *
 *   1. modelo-experimento.xlsx   o grupo descreve o que quer estudar
 *   2. ensaios-<experimento>.xlsx  o programa diz o que fazer  ← o MESMO
 *      arquivo volta com a coluna de resultado preenchida
 *   3. resultados-<experimento>.xlsx  a análise final
 *
 * Reaproveitar o arquivo de ensaios como arquivo de entrada dos resultados
 * elimina um formato inteiro, e com ele a chance de o grupo devolver algo com
 * as colunas fora de ordem: a planilha já vem pronta, só falta uma coluna.
 * Os metadados viajam junto, na aba _DOE, para que a análise saiba
 * exatamente qual planejamento gerou aqueles ensaios.
 */

import { ABAS, normalizar, lerSpecDeAbas, lerEnsaiosDeAba, serializarMeta, desserializarMeta } from './schema.js';
import { formatarP } from '../core/anova.js';

const XLSX = () => {
  if (typeof globalThis.XLSX === 'undefined') {
    throw new Error('A biblioteca de planilhas não foi carregada. Recarregue a página.');
  }
  return globalThis.XLSX;
};

// ── utilidades de escrita ────────────────────────────────────────────────

function formatoNumerico(casas) {
  if (!casas || casas <= 0) return '0';
  return `0.${'0'.repeat(Math.min(casas, 8))}`;
}

/** Cria uma aba a partir de matriz, com larguras e formatos por coluna. */
function criarAba(aoa, { larguras, formatos, negritoLinhas = [] } = {}) {
  const X = XLSX();
  const ws = X.utils.aoa_to_sheet(aoa);
  if (larguras) ws['!cols'] = larguras.map((w) => ({ wch: w }));

  if (formatos) {
    const intervalo = X.utils.decode_range(ws['!ref']);
    for (let r = intervalo.s.r; r <= intervalo.e.r; r++) {
      for (let c = intervalo.s.c; c <= intervalo.e.c; c++) {
        const fmt = formatos[c];
        if (!fmt) continue;
        const cel = ws[X.utils.encode_cell({ r, c })];
        if (cel && cel.t === 'n') cel.z = fmt;
      }
    }
  }
  // Marcação de linhas de título: o SheetJS community não escreve estilos,
  // então o destaque fica por conta do texto (maiúsculas / separadores).
  void negritoLinhas;
  return ws;
}

function adicionar(wb, nome, ws) {
  XLSX().utils.book_append_sheet(wb, ws, nome.slice(0, 31));
}

const novoLivro = () => XLSX().utils.book_new();

const cabecalhoFator = (f) => (f.unidade ? `${f.nome} (${f.unidade})` : f.nome);
const cabecalhoResposta = (r) => (r.unidade ? `${r.nome} (${r.unidade})` : r.nome);

const NOME_TIPO = { fatorial: 'Vértice', axial: 'Eixo', central: 'Centro (repetição)' };

// ── 1. modelo de entrada ─────────────────────────────────────────────────

/**
 * Modelo em branco para o grupo preencher. Vem com um exemplo já escrito nas
 * células, porque um formulário vazio é sempre mais difícil de preencher do
 * que um preenchido para outra coisa.
 */
export function gerarModeloEntrada() {
  const wb = novoLivro();

  adicionar(wb, ABAS.INSTRUCOES, criarAba([
    ['COMO PREENCHER ESTE ARQUIVO'],
    [],
    ['Este arquivo descreve o experimento que você quer otimizar. São 3 abas para preencher,'],
    ['e leva uns 5 minutos. Você não precisa saber nada de planejamento de experimentos.'],
    [],
    ['1) Aba "Experimento"'],
    ['   Diga o nome do experimento e O QUE você quer medir (por exemplo: rendimento,'],
    ['   pureza, tempo de reação) e se quer que esse valor seja o MAIOR ou o MENOR possível.'],
    [],
    ['2) Aba "Fatores"'],
    ['   Liste o que você consegue CONTROLAR no experimento (temperatura, concentração,'],
    ['   tempo...) e, para cada um, o menor e o maior valor que você consegue usar na prática.'],
    ['   Use de 2 a 4 fatores. Escolha os limites com cuidado: o programa vai pedir ensaios'],
    ['   em toda essa faixa, então tudo dentro dela precisa ser executável e seguro.'],
    [],
    ['3) Aba "Opções (avançado)" — OPCIONAL'],
    ['   Já vem preenchida com valores recomendados. Se você não sabe o que mudar,'],
    ['   não mude nada. Está tudo certo assim.'],
    [],
    ['Depois: salve o arquivo e envie no programa. Ele devolve a lista de ensaios a fazer.'],
    [],
    ['Dicas'],
    ['  - Vale usar vírgula ou ponto como separador decimal.'],
    ['  - Não renomeie as abas nem as colunas.'],
    ['  - Se um fator só tem 2 ou 3 valores possíveis (por exemplo, tipo de catalisador),'],
    ['    ele não serve para este tipo de planejamento, que precisa de valores contínuos.'],
  ], { larguras: [100] }));

  adicionar(wb, ABAS.EXPERIMENTO, criarAba([
    ['Campo', 'Preencha aqui', 'Ajuda'],
    ['Nome do experimento', 'Otimização da síntese X', 'Um nome curto para identificar este estudo'],
    ['Grupo', '', 'Número do seu grupo'],
    ['Responsável', '', 'Quem preencheu'],
    ['Data', '', ''],
    [],
    ['O que será medido', 'Rendimento', 'A grandeza que você quer otimizar'],
    ['Unidade da resposta', '%', 'Ex.: %, g, mol/L, min'],
    ['Objetivo', 'maximizar', 'Escreva: maximizar, minimizar ou alvo'],
    ['Valor alvo', '', 'Preencha SÓ se o objetivo for "alvo"'],
    [],
    ['Observações', '', 'Qualquer informação livre (opcional)'],
  ], { larguras: [26, 30, 52] }));

  adicionar(wb, ABAS.FATORES, criarAba([
    ['Fator', 'Unidade', 'Valor mínimo', 'Valor máximo', 'Casas decimais'],
    ['Temperatura', '°C', 40, 60, 1],
    ['Concentração', 'mol/L', 0.1, 0.5, 2],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    [],
    ['↑ Substitua as linhas de exemplo pelos SEUS fatores (de 2 a 4).'],
    ['"Casas decimais" é opcional: quantas casas você consegue ajustar na prática.'],
    ['Deixe em branco se não souber — o programa escolhe um valor razoável.'],
  ], { larguras: [24, 12, 14, 14, 14] }));

  adicionar(wb, ABAS.OPCOES, criarAba([
    ['Opção', 'Valor', 'Ajuda'],
    ['Repetições no ponto central', 3, 'Quantas vezes repetir o ensaio do meio da faixa. Serve para medir o erro do experimento. Mínimo recomendado: 3'],
    ['Tipo de planejamento', 'face', '"face" mantém todos os ensaios dentro dos seus limites. "rotacionavel" distribui melhor os ensaios. Na dúvida, deixe "face"'],
    ['Permitir ultrapassar os limites', 'não', 'Se "sim", alguns ensaios podem pedir valores um pouco além do mínimo/máximo informado'],
    [],
    ['Estas opções já estão nos valores recomendados. Se você não sabe o que são, não mude.'],
  ], { larguras: [30, 14, 80] }));

  return wb;
}

// ── 2. planilha de ensaios (ida e volta) ─────────────────────────────────

export function gerarPlanilhaEnsaios(meta, ensaios, diagnostico) {
  const wb = novoLivro();
  const fatores = meta.fatores;
  const resposta = meta.resposta;

  const emOrdem = [...ensaios].sort((a, b) => a.ordemExecucao - b.ordemExecucao);

  const cabecalho = [
    'Ordem',
    'Ensaio',
    ...fatores.map(cabecalhoFator),
    cabecalhoResposta(resposta),
    'Observações',
  ];
  const linhas = emOrdem.map((e) => [
    e.ordemExecucao,
    e.id,
    ...e.reais,
    null, // ← a coluna que o grupo preenche
    '',
  ]);

  const formatos = { 0: '0' };
  fatores.forEach((f, j) => { formatos[2 + j] = formatoNumerico(f.casasDecimais); });

  adicionar(wb, ABAS.ENSAIOS, criarAba([cabecalho, ...linhas], {
    larguras: [8, 10, ...fatores.map(() => 18), 22, 30],
    formatos,
  }));

  adicionar(wb, ABAS.INSTRUCOES, criarAba([
    ['O QUE FAZER AGORA'],
    [],
    [`Faça os ${emOrdem.length} ensaios listados na aba "Ensaios".`],
    [],
    ['1) Siga a coluna "Ordem". Ela está embaralhada de propósito: executar na ordem'],
    ['   sorteada evita que alguma variação ao longo do dia (temperatura da sala, reagente'],
    ['   que envelhece, cansaço) seja confundida com o efeito dos fatores estudados.'],
    [],
    [`2) Para cada ensaio, ajuste os fatores nos valores indicados e meça ${resposta.nome}.`],
    [`3) Anote o resultado na coluna "${cabecalhoResposta(resposta)}".`],
    [],
    ['4) Salve o arquivo e envie de volta no programa. Ele faz o resto.'],
    [],
    ['Importante'],
    ['  - Alguns ensaios se repetem com os mesmos valores. Isso é intencional: são eles que'],
    ['    medem o erro do próprio experimento. Faça todos, não pule os repetidos.'],
    ['  - Se você não conseguiu usar exatamente o valor pedido (usou 45,2 °C em vez de 45,0),'],
    ['    CORRIJA o valor na planilha para o que realmente foi usado. A análise leva isso em conta.'],
    ['  - Se um ensaio deu errado, deixe o resultado em branco. A análise ignora ensaios vazios.'],
    ['  - Não apague a aba "_DOE": é ela que guarda o planejamento.'],
  ], { larguras: [100] }));

  const av = (diagnostico?.avisos || []).map((a) => [a.nivel === 'erro' ? 'ATENÇÃO' : 'Aviso', a.texto]);
  adicionar(wb, ABAS.PLANEJAMENTO, criarAba([
    ['RESUMO DO PLANEJAMENTO'],
    [],
    ['Experimento', meta.experimento.nome],
    ['Grupo', meta.experimento.grupo || '—'],
    ['Gerado em', new Date(meta.geradoEm).toLocaleString('pt-BR')],
    [],
    ['Resposta medida', cabecalhoResposta(resposta)],
    ['Objetivo', resposta.objetivo === 'maximizar' ? 'Obter o maior valor possível'
      : resposta.objetivo === 'minimizar' ? 'Obter o menor valor possível'
      : `Chegar o mais perto possível de ${resposta.alvo}`],
    [],
    ['FATORES ESTUDADOS'],
    ['Fator', 'Unidade', 'Mínimo', 'Máximo', 'Valor central'],
    ...fatores.map((f) => [f.nome, f.unidade || '—', f.min, f.max, f.centro]),
    [],
    ['COMPOSIÇÃO DOS ENSAIOS'],
    ['Total de ensaios', diagnostico.totalEnsaios],
    ['  nos vértices da faixa', diagnostico.pontosFatoriais],
    ['  sobre os eixos', diagnostico.pontosAxiais],
    ['  repetições no centro', diagnostico.pontosCentrais],
    [],
    ['Coeficientes a estimar', diagnostico.numeroCoeficientes],
    ['Ensaios sobrando para verificar o modelo', diagnostico.glResiduo],
    ...(av.length ? [[], ['OBSERVAÇÕES'], ...av] : []),
  ], { larguras: [38, 26, 14, 14, 14] }));

  adicionar(wb, ABAS.META, criarAba(serializarMeta({ ...meta, ensaios }), { larguras: [14, 120] }));
  return wb;
}

// ── 3. planilha de resultados ────────────────────────────────────────────

export function gerarPlanilhaResultados(analise) {
  const wb = novoLivro();
  const { meta, ajuste, anova: an, leitura, otimo, ensaios } = analise;
  const fatores = meta.fatores;
  const resposta = meta.resposta;
  const un = resposta.unidade ? ` ${resposta.unidade}` : '';

  const objetivoTexto = resposta.objetivo === 'maximizar' ? 'o maior valor possível'
    : resposta.objetivo === 'minimizar' ? 'o menor valor possível'
    : `o mais perto possível de ${resposta.alvo}`;

  // Resumo — a aba que responde a pergunta, em português, sem jargão.
  const linhasResumo = [
    ['RESULTADO DA ANÁLISE'],
    [],
    ['Experimento', meta.experimento.nome],
    ['Grupo', meta.experimento.grupo || '—'],
    ['Analisado em', new Date().toLocaleString('pt-BR')],
    ['Ensaios usados', ensaios.length],
    [],
    ['CONDIÇÃO RECOMENDADA'],
    [`Para obter ${objetivoTexto} de ${resposta.nome}, use:`],
    [],
    ...fatores.map((f, j) => [`  ${f.nome}`, otimo.recomendado.reais[j], f.unidade || '']),
    [],
    [`  ${resposta.nome} previsto`, Number(otimo.recomendado.previsto.toFixed(4)), resposta.unidade || ''],
    ...(isFinite(otimo.recomendado.erroPadrao)
      ? [['  Margem esperada', `± ${(2 * otimo.recomendado.erroPadrao).toFixed(3)}${un}`, '(aproximadamente 95% de confiança)']]
      : []),
    [],
    ['O QUE OS DADOS DIZEM'],
    ...leitura.mensagens.map((m) => [m.texto]),
    ...(otimo.avisos.length ? [[], ['PONTOS DE ATENÇÃO'], ...otimo.avisos.map((a) => [a.texto])] : []),
    [],
    ['Confira as demais abas para o detalhamento: ensaios, modelo ajustado e ANOVA.'],
  ];
  adicionar(wb, ABAS.RESUMO, criarAba(linhasResumo, { larguras: [46, 20, 34] }));

  // Condição ótima, com comparação contra o melhor ensaio realmente feito —
  // é isso que diz se valeu a pena modelar em vez de só olhar a tabela.
  const melhorObservado = [...ensaios].sort((a, b) =>
    resposta.objetivo === 'minimizar' ? a.resposta - b.resposta
      : resposta.objetivo === 'alvo' ? Math.abs(a.resposta - resposta.alvo) - Math.abs(b.resposta - resposta.alvo)
      : b.resposta - a.resposta)[0];

  adicionar(wb, ABAS.OTIMO, criarAba([
    ['CONDIÇÃO ÓTIMA'],
    [],
    ['Fator', 'Valor recomendado', 'Unidade', 'Mínimo testado', 'Máximo testado'],
    ...fatores.map((f, j) => [f.nome, otimo.recomendado.reais[j], f.unidade || '—', f.min, f.max]),
    [],
    [`${resposta.nome} previsto nessa condição`, Number(otimo.recomendado.previsto.toFixed(4)), resposta.unidade || ''],
    [],
    ['COMPARAÇÃO COM O MELHOR ENSAIO REALIZADO'],
    ['Melhor ensaio feito', melhorObservado.id],
    ...fatores.map((f, j) => [`  ${f.nome}`, melhorObservado.reais[j], f.unidade || '']),
    [`  ${resposta.nome} medido`, melhorObservado.resposta, resposta.unidade || ''],
    ['Ganho previsto sobre o melhor ensaio',
      Number((otimo.recomendado.previsto - melhorObservado.resposta).toFixed(4)), resposta.unidade || ''],
    [],
    ['FORMATO DA SUPERFÍCIE'],
    ['Classificação', {
      maximo: 'Pico bem definido', minimo: 'Vale bem definido',
      sela: 'Ponto de sela', cume: 'Cume alongado',
    }[otimo.canonica.tipo] || otimo.canonica.tipo],
    ['', otimo.canonica.explicacao],
    ...(otimo.estacionario ? [
      [],
      ['Ponto estacionário do modelo', otimo.estacionario.dentroDaRegiao ? 'dentro da faixa testada' : 'FORA da faixa testada'],
      ...fatores.map((f, j) => [`  ${f.nome}`, Number(otimo.estacionario.reais[j].toFixed(4)), f.unidade || '']),
      [`  ${resposta.nome} nesse ponto`, Number(otimo.estacionario.previsto.toFixed(4)), resposta.unidade || ''],
    ] : []),
    ...(otimo.caminho ? [
      [],
      ['SUGESTÃO PARA A PRÓXIMA RODADA'],
      ['O ótimo está na borda. Para continuar melhorando, desloque a faixa nesta direção:'],
      ['Passo', ...fatores.map(cabecalhoFator), `${resposta.nome} previsto`],
      ...otimo.caminho.pontos.map((p) => [p.passo, ...p.reais, Number(p.previsto.toFixed(3))]),
      ['Os valores acima extrapolam o modelo: use-os apenas para escolher onde centrar o próximo planejamento.'],
    ] : []),
  ], { larguras: [40, 20, 14, 16, 16] }));

  // Ensaios com previsto e resíduo
  adicionar(wb, ABAS.ENSAIOS, criarAba([
    ['Ordem', 'Ensaio', 'Tipo', ...fatores.map(cabecalhoFator),
      `${resposta.nome} medido`, `${resposta.nome} previsto`, 'Diferença'],
    ...[...ensaios].sort((a, b) => a.ordemPadrao - b.ordemPadrao).map((e) => [
      e.ordemExecucao, e.id, NOME_TIPO[e.tipo] || e.tipo,
      ...e.reais,
      e.resposta,
      Number(e.previsto.toFixed(4)),
      Number(e.residuo.toFixed(4)),
    ]),
  ], { larguras: [8, 10, 20, ...fatores.map(() => 16), 18, 18, 12] }));

  // Modelo ajustado
  adicionar(wb, ABAS.MODELO, criarAba([
    ['MODELO AJUSTADO'],
    ['Os coeficientes estão em escala codificada: os fatores foram colocados numa mesma'],
    ['régua (−1 a +1), então dá para comparar diretamente qual deles pesa mais.'],
    [],
    ['Termo', 'O que representa', 'Coeficiente', 'Erro padrão', 'p-valor', 'Importante?'],
    ...ajuste.coeficientes.map((c) => [
      c.rotulo, c.descricao,
      Number(c.valor.toFixed(5)),
      isFinite(c.erroPadrao) ? Number(c.erroPadrao.toFixed(5)) : '—',
      isFinite(c.pValor) ? formatarP(c.pValor) : '—',
      c.tipo === 'intercepto' ? '—' : c.significativo ? 'sim' : 'não',
    ]),
    [],
    ['"Importante?" responde se o efeito é distinguível do ruído do experimento'],
    [`(nível de ${((1 - ajuste.confianca) * 100).toFixed(0)}%). Termos "não" podem ser fruto do acaso.`],
  ], { larguras: [10, 34, 14, 14, 16, 12] }));

  // ANOVA
  const linhasAnova = [
    ['ANÁLISE DE VARIÂNCIA'],
    [],
    ['Fonte de variação', 'Soma quadrática', 'G.L.', 'Média quadrática', 'F', 'p-valor'],
    ['Regressão', num(an.sqRegressao), an.glRegressao, num(an.qmRegressao), num(an.fRegressao), isFinite(an.pRegressao) ? formatarP(an.pRegressao) : '—'],
    ['Resíduos', num(an.sqResiduo), an.glResiduo, num(an.qmResiduo), '', ''],
  ];
  if (an.temErroPuro) {
    linhasAnova.push(
      ['  Falta de ajuste', num(an.sqFaltaAjuste), an.glFaltaAjuste, num(an.qmFaltaAjuste), num(an.fFaltaAjuste), isFinite(an.pFaltaAjuste) ? formatarP(an.pFaltaAjuste) : '—'],
      ['  Erro puro', num(an.sqErroPuro), an.glErroPuro, num(an.qmErroPuro), '', '']
    );
  }
  linhasAnova.push(
    ['Total', num(an.sqTotal), an.glTotal, num(an.qmTotal), '', ''],
    [],
    ['% de variação explicada (R²)', `${(an.r2 * 100).toFixed(2)}%`],
    ['R² ajustado', `${(an.r2Ajustado * 100).toFixed(2)}%`],
    ...(an.temErroPuro ? [
      ['% máxima explicável', `${(an.r2Maximo * 100).toFixed(2)}%`],
      ['Desvio padrão experimental', num(an.desvioPadraoExperimental)],
    ] : []),
    [],
    ['Como ler'],
    ['  Regressão, p pequeno  → os fatores realmente afetam a resposta.'],
    ['  Falta de ajuste, p pequeno → o modelo NÃO descreve bem o formato dos dados.'],
    ['  Aqui, p pequeno é bom na primeira linha e ruim na segunda.'],
    ['  A "% máxima explicável" é o teto imposto pelo ruído: nenhum modelo passa dele.']
  );
  adicionar(wb, ABAS.ANOVA, criarAba(linhasAnova, { larguras: [32, 18, 8, 18, 12, 14] }));

  adicionar(wb, ABAS.DIAGNOSTICO, criarAba([
    ['DIAGNÓSTICO'],
    [],
    ['Veredito geral', { ok: 'Modelo confiável', atencao: 'Use com ressalvas', ruim: 'Não confie neste modelo' }[leitura.veredito]],
    [],
    ['Leitura dos dados'],
    ...leitura.mensagens.map((m) => [`  ${m.texto}`]),
    ...(otimo.avisos.length ? [[], ['Pontos de atenção'], ...otimo.avisos.map((a) => [`  ${a.texto}`])] : []),
    [],
    ['Ensaios com maior desvio em relação ao modelo'],
    ['Ensaio', 'Medido', 'Previsto', 'Diferença'],
    ...[...ensaios]
      .sort((a, b) => Math.abs(b.residuo) - Math.abs(a.residuo))
      .slice(0, 5)
      .map((e) => [e.id, e.resposta, Number(e.previsto.toFixed(4)), Number(e.residuo.toFixed(4))]),
    ['Um desvio muito acima dos demais pode indicar erro de execução ou de anotação nesse ensaio.'],
  ], { larguras: [90, 14, 14, 14] }));

  adicionar(wb, ABAS.META, criarAba(serializarMeta({ ...meta, ensaios }), { larguras: [14, 120] }));
  return wb;
}

const num = (v) => (isFinite(v) ? Number(v.toFixed(5)) : '—');

// ── leitura ──────────────────────────────────────────────────────────────

/** Busca uma aba pelo nome normalizado, tolerando acento e caixa. */
function acharAba(wb, ...nomes) {
  const alvos = nomes.map(normalizar);
  for (const nome of wb.SheetNames) {
    if (alvos.includes(normalizar(nome))) return wb.Sheets[nome];
  }
  return null;
}

function abaParaMatriz(ws) {
  if (!ws) return null;
  return XLSX().utils.sheet_to_json(ws, { header: 1, blankrows: true, raw: true, defval: null });
}

export function lerArquivo(arrayBuffer) {
  return XLSX().read(arrayBuffer, { type: 'array', cellDates: false });
}

/**
 * Descobre o que o usuário enviou: um modelo preenchido (para gerar o
 * planejamento) ou uma planilha de ensaios com resultados (para analisar).
 */
export function identificarArquivo(wb) {
  if (acharAba(wb, ABAS.META)) return 'ensaios';
  if (acharAba(wb, ABAS.FATORES) && acharAba(wb, ABAS.EXPERIMENTO)) return 'modelo';
  if (acharAba(wb, ABAS.ENSAIOS)) return 'ensaios-sem-meta';
  return 'desconhecido';
}

export function lerModeloPreenchido(wb) {
  const experimento = abaParaMatriz(acharAba(wb, ABAS.EXPERIMENTO));
  const fatores = abaParaMatriz(acharAba(wb, ABAS.FATORES));
  const opcoes = abaParaMatriz(acharAba(wb, ABAS.OPCOES, 'Opções', 'Opcoes', 'Avançado'));

  if (!experimento || !fatores) {
    return {
      spec: null,
      erros: ['Não encontrei as abas "Experimento" e "Fatores" neste arquivo. Baixe o modelo em branco e preencha nele.'],
      avisos: [],
    };
  }
  return lerSpecDeAbas({ experimento, fatores, opcoes });
}

export function lerEnsaiosPreenchidos(wb) {
  const metaAoa = abaParaMatriz(acharAba(wb, ABAS.META));
  const meta = desserializarMeta(metaAoa);
  if (!meta) {
    return {
      meta: null, ensaios: [],
      erros: ['Este arquivo não contém os dados do planejamento (aba "_DOE"). Envie o mesmo arquivo de ensaios que o programa gerou — copiar as colunas para uma planilha nova faz perder essa informação.'],
      avisos: [],
    };
  }
  const linhas = abaParaMatriz(acharAba(wb, ABAS.ENSAIOS));
  if (!linhas) {
    return { meta, ensaios: [], erros: ['Não encontrei a aba "Ensaios" neste arquivo.'], avisos: [] };
  }
  const { ensaios, erros, avisos } = lerEnsaiosDeAba(linhas, meta);
  return { meta, ensaios, erros, avisos };
}

// ── download ─────────────────────────────────────────────────────────────

export function baixarLivro(wb, nomeArquivo) {
  const X = XLSX();
  const dados = X.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([dados], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nome de arquivo seguro a partir do nome do experimento. */
export function nomeArquivo(prefixo, nomeExperimento, extensao = 'xlsx') {
  const base = String(nomeExperimento || 'experimento')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'experimento';
  return `${prefixo}-${base}.${extensao}`;
}
