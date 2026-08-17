/**
 * schema.js — contrato das planilhas.
 *
 * Trabalha sobre matrizes simples (array de arrays), sem conhecer a SheetJS.
 * Assim o formato pode ser testado no Node sem abrir um .xlsx de verdade, e
 * trocar a biblioteca de Excel um dia não mexe nas regras de leitura.
 *
 * Princípio de projeto: a planilha é preenchida por gente com pressa, num
 * laboratório. Toda leitura aqui é deliberadamente tolerante — aceita vírgula
 * decimal, acentos, maiúsculas, linhas em branco, colunas reordenadas e
 * sinônimos — e só reclama quando a informação de fato não está lá.
 */

export const ABAS = {
  INSTRUCOES: 'Instruções',
  EXPERIMENTO: 'Experimento',
  FATORES: 'Fatores',
  OPCOES: 'Opções (avançado)',
  ENSAIOS: 'Ensaios',
  PLANEJAMENTO: 'Planejamento',
  RESUMO: 'Resumo',
  OTIMO: 'Condição ótima',
  MODELO: 'Modelo',
  ANOVA: 'ANOVA',
  DIAGNOSTICO: 'Diagnóstico',
  META: '_DOE',
};

/** Minúsculas, sem acento, sem espaços nas pontas — para comparar rótulos. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas diacríticas separadas pelo NFD
    .trim()
    .toLowerCase();
}

/**
 * Lê número aceitando vírgula decimal e separador de milhar.
 * "1.234,56" → 1234.56 ; "0,5" → 0.5 ; "50" → 50
 */
export function parseNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return NaN;
  if (typeof valor === 'number') return valor;
  let s = String(valor).trim().replace(/\s/g, '');
  if (s === '') return NaN;
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    // O último separador que aparece é o decimal.
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (temVirgula) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

const SINONIMOS_OBJETIVO = {
  maximizar: ['maximizar', 'maximo', 'max', 'maior', 'aumentar', 'maximizar a resposta'],
  minimizar: ['minimizar', 'minimo', 'min', 'menor', 'reduzir', 'diminuir'],
  alvo: ['alvo', 'valor alvo', 'atingir', 'atingir um valor', 'target', 'especifico'],
};

export function parseObjetivo(valor) {
  const n = normalizar(valor);
  if (!n) return null;
  for (const [chave, lista] of Object.entries(SINONIMOS_OBJETIVO)) {
    if (lista.some((s) => n === s || n.startsWith(s))) return chave;
  }
  return null;
}

const SINONIMOS_ALPHA = {
  face: ['face', 'face centrada', 'faces', 'dentro dos limites', 'padrao'],
  rotacionavel: ['rotacionavel', 'rotacional', 'rotatable', 'rotativo'],
  ortogonal: ['ortogonal', 'orthogonal'],
};

export function parseTipoAlpha(valor) {
  const n = normalizar(valor);
  if (!n) return null;
  for (const [chave, lista] of Object.entries(SINONIMOS_ALPHA)) {
    if (lista.some((s) => n.startsWith(s))) return chave;
  }
  const num = parseNumero(valor);
  return isFinite(num) && num > 0 ? String(num) : null;
}

/**
 * Índice da coluna cujo cabeçalho casa com algum dos rótulos aceitos.
 *
 * Casamento exato tem prioridade sobre casamento por prefixo: com os fatores
 * "Concentração" e "Concentração final" na mesma planilha, buscar por
 * "Concentração" precisa achar a coluna certa, e não a primeira que começa
 * com esse texto. `ignorar` exclui colunas já atribuídas a outro campo.
 */
export function acharColuna(cabecalho, rotulosAceitos, ignorar = []) {
  const alvos = rotulosAceitos.map(normalizar).filter(Boolean);
  const livre = (i) => !ignorar.includes(i);
  // "Temperatura (°C)" → "temperatura": a unidade final não faz parte do nome.
  const semUnidade = (c) => c.replace(/\s*\([^)]*\)\s*$/, '').trim();

  const passes = [
    (c, a) => c === a,
    (c, a) => semUnidade(c) === a,
    (c, a) => c.startsWith(a),
  ];
  for (const casa of passes) {
    for (let i = 0; i < cabecalho.length; i++) {
      const c = normalizar(cabecalho[i]);
      if (!c || !livre(i)) continue;
      if (alvos.some((a) => casa(c, a))) return i;
    }
  }
  return -1;
}

const vazia = (linha) => !linha || linha.every((c) => c === null || c === undefined || String(c).trim() === '');

/**
 * Lê a aba Experimento, que é uma lista de pares rótulo/valor.
 * Ler por rótulo (e não por posição fixa) sobrevive a alguém inserir uma
 * linha no meio da planilha, o que acontece.
 */
export function lerParesRotuloValor(linhas) {
  const mapa = new Map();
  for (const linha of linhas || []) {
    if (vazia(linha)) continue;
    const rotulo = normalizar(linha[0]);
    if (!rotulo) continue;
    // Só a coluna B conta. A coluna C do modelo traz textos de ajuda, e
    // varrer "a primeira célula não vazia" leria a ajuda como se fosse a
    // resposta sempre que o usuário deixasse o campo em branco.
    const valor = linha[1];
    mapa.set(rotulo, valor === null || valor === undefined ? '' : valor);
  }
  return mapa;
}

function buscar(mapa, ...rotulos) {
  for (const r of rotulos) {
    const n = normalizar(r);
    if (mapa.has(n)) return mapa.get(n);
    for (const [chave, valor] of mapa) if (chave.startsWith(n)) return valor;
  }
  return undefined;
}

/**
 * Monta a especificação a partir das abas do modelo preenchido.
 * @param {{experimento:any[][], fatores:any[][], opcoes?:any[][]}} abas
 * @returns {{spec:object, erros:string[], avisos:string[]}}
 */
export function lerSpecDeAbas({ experimento, fatores, opcoes }) {
  const erros = [];
  const avisos = [];
  const meta = lerParesRotuloValor(experimento);

  const nome = String(buscar(meta, 'nome do experimento', 'experimento', 'nome') ?? '').trim();
  const respostaNome = String(buscar(meta, 'resposta', 'o que sera medido', 'variavel resposta', 'grandeza medida') ?? '').trim();
  const respostaUnidade = String(buscar(meta, 'unidade da resposta', 'unidade') ?? '').trim();
  const objetivoBruto = buscar(meta, 'objetivo', 'queremos');
  const objetivo = parseObjetivo(objetivoBruto) || 'maximizar';
  if (objetivoBruto && !parseObjetivo(objetivoBruto)) {
    avisos.push(`Não entendi o objetivo "${objetivoBruto}" — assumindo "maximizar". Use maximizar, minimizar ou alvo.`);
  }
  const alvo = parseNumero(buscar(meta, 'valor alvo', 'alvo'));

  if (!nome) erros.push('Na aba "Experimento", preencha o nome do experimento.');
  if (!respostaNome) erros.push('Na aba "Experimento", preencha o que será medido (a resposta).');
  if (objetivo === 'alvo' && !isFinite(alvo)) {
    erros.push('O objetivo é atingir um valor alvo, mas o campo "Valor alvo" está vazio na aba "Experimento".');
  }

  // ── Fatores ────────────────────────────────────────────────────────────
  const linhasFatores = (fatores || []).filter((l) => !vazia(l));
  const listaFatores = [];
  if (linhasFatores.length < 2) {
    erros.push('A aba "Fatores" está vazia. Preencha ao menos dois fatores (nome, unidade, mínimo e máximo).');
  } else {
    const cab = linhasFatores[0];
    const iNome = acharColuna(cab, ['fator', 'nome do fator', 'nome', 'variavel']);
    const iUnid = acharColuna(cab, ['unidade', 'un']);
    const iMin = acharColuna(cab, ['minimo', 'valor minimo', 'min', 'limite inferior']);
    const iMax = acharColuna(cab, ['maximo', 'valor maximo', 'max', 'limite superior']);
    const iCasas = acharColuna(cab, ['casas decimais', 'precisao', 'arredondar']);

    if (iNome < 0 || iMin < 0 || iMax < 0) {
      erros.push('Na aba "Fatores", não encontrei as colunas esperadas. O cabeçalho precisa ter: Fator, Unidade, Valor mínimo e Valor máximo.');
    } else {
      // A tabela termina na primeira linha que tem texto mas nenhum número:
      // é onde começam as notas de rodapé do modelo. Linhas totalmente vazias
      // são puladas, para que quem deixar um espaço entre os fatores não
      // perca os de baixo.
      for (let r = 1; r < linhasFatores.length; r++) {
        const linha = linhasFatores[r];
        const nomeFator = String(linha[iNome] ?? '').trim();
        if (!nomeFator) continue;

        const min = parseNumero(linha[iMin]);
        const max = parseNumero(linha[iMax]);
        if (!isFinite(min) && !isFinite(max)) {
          if (nomeFator.length <= 40) {
            avisos.push(`A linha "${nomeFator}" da aba "Fatores" foi ignorada porque não tem valor mínimo nem máximo.`);
          }
          break;
        }
        if (!isFinite(min)) erros.push(`O valor mínimo do fator "${nomeFator}" não é um número válido.`);
        if (!isFinite(max)) erros.push(`O valor máximo do fator "${nomeFator}" não é um número válido.`);

        const casas = iCasas >= 0 ? parseNumero(linha[iCasas]) : NaN;
        listaFatores.push({
          nome: nomeFator,
          unidade: iUnid >= 0 ? String(linha[iUnid] ?? '').trim() : '',
          min, max,
          ...(isFinite(casas) ? { casasDecimais: Math.max(0, Math.round(casas)) } : {}),
        });
      }
      if (listaFatores.length === 0) erros.push('Na aba "Fatores", nenhuma linha foi preenchida.');
    }
  }

  // ── Opções avançadas (todas com padrão seguro) ─────────────────────────
  const config = {};
  if (opcoes && opcoes.length) {
    const mo = lerParesRotuloValor(opcoes);
    const pc = parseNumero(buscar(mo, 'repeticoes no ponto central', 'pontos centrais', 'repeticoes'));
    if (isFinite(pc) && pc >= 1) config.pontosCentrais = Math.round(pc);
    const tipo = parseTipoAlpha(buscar(mo, 'tipo de planejamento', 'abrangencia', 'tipo'));
    if (tipo) config.tipoAlpha = tipo;
    const extrap = normalizar(buscar(mo, 'permitir ultrapassar os limites', 'extrapolar', 'ultrapassar'));
    if (extrap) config.limitMode = ['sim', 's', 'true', 'verdadeiro', '1'].includes(extrap) ? 'fatorial' : 'absoluto';
  }

  return {
    spec: {
      experimento: {
        nome,
        grupo: String(buscar(meta, 'grupo', 'equipe') ?? '').trim(),
        responsavel: String(buscar(meta, 'responsavel', 'aluno', 'contato') ?? '').trim(),
        data: String(buscar(meta, 'data') ?? '').trim(),
        observacoes: String(buscar(meta, 'observacoes', 'observacao') ?? '').trim(),
      },
      resposta: {
        nome: respostaNome,
        unidade: respostaUnidade,
        objetivo,
        ...(isFinite(alvo) ? { alvo } : {}),
      },
      fatores: listaFatores,
      config,
    },
    erros,
    avisos,
  };
}

/**
 * Lê a aba Ensaios devolvida pelo grupo: valores reais efetivamente usados e
 * a resposta medida. Casa cada linha com o planejamento pelo código do ensaio.
 */
export function lerEnsaiosDeAba(linhas, meta) {
  const erros = [];
  const avisos = [];
  const uteis = (linhas || []).filter((l) => !vazia(l));
  if (uteis.length < 2) {
    erros.push('A aba "Ensaios" está vazia.');
    return { ensaios: [], erros, avisos };
  }

  const cab = uteis[0];
  const iId = acharColuna(cab, ['ensaio', 'id', 'codigo']);

  // As colunas dos fatores são localizadas pelo nome do fator no cabeçalho;
  // a unidade entre parênteses é ignorada pelo casamento por prefixo. Cada
  // coluna encontrada sai do jogo para a busca seguinte, de modo que fatores
  // com nomes parecidos não disputem a mesma coluna.
  const usadas = [iId].filter((i) => i >= 0);
  const idxFatores = meta.fatores.map((f) => {
    const i = acharColuna(cab, [f.nome], usadas);
    if (i >= 0) usadas.push(i);
    return i;
  });

  const iResp = acharColuna(cab, [
    meta.resposta?.nome ? `${meta.resposta.nome}` : 'resultado',
    'resultado', 'resposta', 'valor medido', 'medida',
  ], usadas);
  if (iResp >= 0) usadas.push(iResp);
  const iObs = acharColuna(cab, ['observacoes', 'observacao', 'notas'], usadas);
  const faltando = meta.fatores.filter((_, j) => idxFatores[j] < 0).map((f) => f.nome);
  if (faltando.length) {
    erros.push(`Na aba "Ensaios" não encontrei as colunas dos fatores: ${faltando.join(', ')}. Use a planilha gerada pelo programa, sem renomear as colunas.`);
  }
  if (iResp < 0) {
    erros.push(`Na aba "Ensaios" não encontrei a coluna de resultado ("${meta.resposta?.nome || 'Resultado'}"). Preencha os resultados nessa coluna.`);
  }
  if (erros.length) return { ensaios: [], erros, avisos };

  const porId = new Map((meta.ensaios || []).map((e) => [normalizar(e.id), e]));
  const ensaios = [];
  let semResposta = 0;

  for (let r = 1; r < uteis.length; r++) {
    const linha = uteis[r];
    const id = iId >= 0 ? String(linha[iId] ?? '').trim() : '';
    const planejado = porId.get(normalizar(id));

    const reais = idxFatores.map((idx) => parseNumero(linha[idx]));
    if (reais.some((v) => !isFinite(v))) {
      if (id) avisos.push(`Ensaio ${id}: algum valor de fator não é um número — linha ignorada.`);
      continue;
    }
    const resposta = parseNumero(linha[iResp]);
    if (!isFinite(resposta)) { semResposta++; continue; }

    ensaios.push({
      id: id || `linha${r + 1}`,
      ordemPadrao: planejado?.ordemPadrao ?? r,
      ordemExecucao: planejado?.ordemExecucao ?? r,
      tipo: planejado?.tipo ?? 'desconhecido',
      codificadosPlanejados: planejado?.codificadosPlanejados ?? null,
      reais,
      resposta,
      observacoes: iObs >= 0 ? String(linha[iObs] ?? '').trim() : '',
    });
  }

  if (semResposta > 0) {
    avisos.push(`${semResposta} ensaio(s) ainda sem resultado preenchido — foram desconsiderados na análise.`);
  }
  if (ensaios.length === 0) erros.push('Nenhum ensaio com resultado preenchido foi encontrado na aba "Ensaios".');

  return { ensaios, erros, avisos };
}

/** Serializa os metadados para as células da aba _DOE, em blocos seguros. */
export function serializarMeta(meta) {
  const json = JSON.stringify(meta);
  const TAMANHO = 20000; // bem abaixo do limite de 32767 caracteres por célula
  const blocos = [];
  for (let i = 0; i < json.length; i += TAMANHO) blocos.push(json.slice(i, i + TAMANHO));
  return [
    ['NÃO EDITE ESTA ABA — ela guarda o planejamento para que o programa possa analisar seus resultados depois.'],
    ['versao', 1],
    ['blocos', blocos.length],
    ...blocos.map((b, i) => [`dados${i}`, b]),
  ];
}

/** Reconstrói os metadados a partir da aba _DOE. */
export function desserializarMeta(linhas) {
  if (!linhas || !linhas.length) return null;
  const partes = [];
  for (const linha of linhas) {
    if (String(linha[0] ?? '').startsWith('dados')) partes.push(String(linha[1] ?? ''));
  }
  if (!partes.length) return null;
  try {
    return JSON.parse(partes.join(''));
  } catch {
    return null;
  }
}
