/**
 * Teste de ida e volta da camada Excel: gera os arquivos, escreve em disco,
 * lê de volta e confere que a informação sobreviveu à viagem.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
globalThis.XLSX = require(path.join(raiz, 'app/js/vendor/xlsx.full.min.js'));
const XLSX = globalThis.XLSX;

const { gerarModeloEntrada, gerarPlanilhaEnsaios, gerarPlanilhaResultados,
  lerArquivo, identificarArquivo, lerModeloPreenchido, lerEnsaiosPreenchidos,
  nomeArquivo } = await import('../app/js/io/excel.js');
const { criarPlanejamento, analisarResultados } = await import('../app/js/core/pipeline.js');
const { parseNumero, parseObjetivo, acharColuna, lerSpecDeAbas } = await import('../app/js/io/schema.js');
const { prever, montarTermos } = await import('../app/js/core/model.js');
const { paraCodificado } = await import('../app/js/core/coding.js');

let falhas = 0;
const ok = (nome, cond, extra = '') => {
  if (cond) console.log(`  ok  ${nome}`);
  else { console.log(`FALHA  ${nome} ${extra}`); falhas++; }
};
const perto = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const ciclo = (wb) => lerArquivo(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
const aoa = (wb, nome) => XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null });

console.log('\n— Leitura tolerante —');
ok('"0,5" → 0.5', parseNumero('0,5') === 0.5);
ok('"1.234,56" → 1234.56', parseNumero('1.234,56') === 1234.56);
ok('"1,234.56" → 1234.56', parseNumero('1,234.56') === 1234.56);
ok('"50" → 50', parseNumero('50') === 50);
ok('número puro passa direto', parseNumero(42.5) === 42.5);
ok('vazio → NaN', Number.isNaN(parseNumero('')));
ok('texto → NaN', Number.isNaN(parseNumero('abc')));
ok('"Máximo" reconhece maximizar', parseObjetivo('Máximo') === 'maximizar');
ok('"MINIMIZAR" reconhece minimizar', parseObjetivo('MINIMIZAR') === 'minimizar');
ok('"alvo" reconhece alvo', parseObjetivo('alvo') === 'alvo');
ok('objetivo desconhecido → null', parseObjetivo('sei lá') === null);

console.log('\n— Colisão de nomes de coluna —');
const cab = ['Ensaio', 'Concentração final (M)', 'Concentração (M)', 'Rendimento (%)'];
const i1 = acharColuna(cab, ['Concentração']);
ok('casamento exato ganha do prefixo', i1 === 2, `(achou ${i1}: "${cab[i1]}")`);
const i2 = acharColuna(cab, ['Concentração final']);
ok('o nome mais longo acha a sua coluna', i2 === 1, `(achou ${i2})`);
ok('coluna já usada é ignorada', acharColuna(cab, ['Concentração'], [2]) === 1);

console.log('\n— Modelo em branco: ida e volta —');
const modelo = ciclo(gerarModeloEntrada());
ok('tipo identificado como "modelo"', identificarArquivo(modelo) === 'modelo', `(${identificarArquivo(modelo)})`);
const { spec, erros } = lerModeloPreenchido(modelo);
ok('lido sem erros', erros.length === 0, erros.join(' | '));
ok('nome do experimento lido', spec.experimento.nome === 'Otimização da síntese X', `("${spec.experimento.nome}")`);
ok('resposta lida', spec.resposta.nome === 'Rendimento');
ok('unidade lida', spec.resposta.unidade === '%');
ok('objetivo lido', spec.resposta.objetivo === 'maximizar');
ok('2 fatores de exemplo lidos', spec.fatores.length === 2, `(${spec.fatores.length})`);
ok('fator 1 = Temperatura 40–60', spec.fatores[0].nome === 'Temperatura' && spec.fatores[0].min === 40 && spec.fatores[0].max === 60);
ok('fator 2 = Concentração 0,1–0,5', spec.fatores[1].min === 0.1 && spec.fatores[1].max === 0.5);
ok('linhas de exemplo em branco não viram fatores', spec.fatores.every((f) => f.nome !== ''));
ok('opções avançadas lidas', spec.config.pontosCentrais === 3 && spec.config.tipoAlpha === 'face',
  JSON.stringify(spec.config));

console.log('\n— Planilha de ensaios —');
const { meta, ensaios, diagnostico } = criarPlanejamento(spec);
const wbEnsaios = ciclo(gerarPlanilhaEnsaios(meta, ensaios, diagnostico));
ok('tipo identificado como "ensaios"', identificarArquivo(wbEnsaios) === 'ensaios');
ok('tem as 4 abas esperadas',
  ['Ensaios', 'Instruções', 'Planejamento', '_DOE'].every((n) => wbEnsaios.SheetNames.includes(n)),
  wbEnsaios.SheetNames.join(', '));

const linhasEnsaios = aoa(wbEnsaios, 'Ensaios');
ok('11 linhas de ensaio + cabeçalho', linhasEnsaios.length === 12, `(${linhasEnsaios.length})`);
ok('cabeçalho traz fator com unidade', linhasEnsaios[0][2] === 'Temperatura (°C)', `("${linhasEnsaios[0][2]}")`);
ok('cabeçalho traz a resposta com unidade', linhasEnsaios[0][4] === 'Rendimento (%)', `("${linhasEnsaios[0][4]}")`);
ok('coluna de resultado vem vazia', linhasEnsaios.slice(1).every((l) => l[4] === null));
ok('ordem de execução vai de 1 a 11 sem repetir',
  JSON.stringify(linhasEnsaios.slice(1).map((l) => l[0])) === JSON.stringify([...Array(11)].map((_, i) => i + 1)));
ok('valores dos fatores dentro dos limites',
  linhasEnsaios.slice(1).every((l) => l[2] >= 40 && l[2] <= 60 && l[3] >= 0.1 && l[3] <= 0.5));

console.log('\n— Preenchendo resultados e reanalisando —');
const VERDADE = [82, 3, 2.5, -5, -4, -1.5];
const termos = montarTermos(2);
// Escreve na coluna de resultado como um usuário faria.
const ws = wbEnsaios.Sheets['Ensaios'];
for (let r = 1; r <= 11; r++) {
  const t = ws[XLSX.utils.encode_cell({ r, c: 2 })].v;
  const c = ws[XLSX.utils.encode_cell({ r, c: 3 })].v;
  const cod = [paraCodificado(t, meta.fatores[0]), paraCodificado(c, meta.fatores[1])];
  ws[XLSX.utils.encode_cell({ r, c: 4 })] = { t: 'n', v: prever(cod, VERDADE, termos) };
}
const devolvido = ciclo(wbEnsaios);
const leitura = lerEnsaiosPreenchidos(devolvido);
ok('metadados recuperados da aba _DOE', leitura.meta !== null);
ok('lido sem erros', leitura.erros.length === 0, leitura.erros.join(' | '));
ok('11 ensaios com resultado', leitura.ensaios.length === 11, `(${leitura.ensaios.length})`);
ok('tipo do ponto preservado', leitura.ensaios.filter((e) => e.tipo === 'central').length === 3);
ok('coordenadas planejadas preservadas', leitura.ensaios.every((e) => Array.isArray(e.codificadosPlanejados)));

const analise = analisarResultados(leitura.meta, leitura.ensaios);
ok('coeficientes recuperados após a ida e volta',
  VERDADE.every((v, i) => perto(analise.ajuste.beta[i], v, 1e-7)),
  JSON.stringify(analise.ajuste.beta.map((b) => +b.toFixed(4))));
ok('R² = 1', perto(analise.anova.r2, 1, 1e-10));
ok('erro puro detectado', analise.anova.temErroPuro);
ok('máximo identificado', analise.otimo.canonica.tipo === 'maximo');

console.log('\n— Ensaio em branco é ignorado, valor corrigido é respeitado —');
const wb2 = ciclo(wbEnsaios);
const ws2 = wb2.Sheets['Ensaios'];
delete ws2[XLSX.utils.encode_cell({ r: 5, c: 4 })];         // um ensaio sem resultado
ws2[XLSX.utils.encode_cell({ r: 6, c: 2 })] = { t: 'n', v: 47.3 }; // temperatura corrigida
const leitura2 = lerEnsaiosPreenchidos(ciclo(wb2));
ok('ensaio sem resultado descartado', leitura2.ensaios.length === 10, `(${leitura2.ensaios.length})`);
ok('avisa sobre ensaio não preenchido', leitura2.avisos.some((a) => a.includes('sem resultado')));
ok('valor corrigido pelo usuário foi lido', leitura2.ensaios.some((e) => e.reais[0] === 47.3));

console.log('\n— Planilha de resultados —');
const wbRes = ciclo(gerarPlanilhaResultados(analise));
const esperadas = ['Resumo', 'Condição ótima', 'Ensaios', 'Modelo', 'ANOVA', 'Diagnóstico', '_DOE'];
ok('todas as abas de resultado presentes',
  esperadas.every((n) => wbRes.SheetNames.includes(n)), wbRes.SheetNames.join(', '));
const resumo = aoa(wbRes, 'Resumo').flat().filter(Boolean).map(String).join(' ');
ok('resumo cita a condição recomendada', resumo.includes('CONDIÇÃO RECOMENDADA'));
ok('resumo cita os fatores', resumo.includes('Temperatura') && resumo.includes('Concentração'));
const anovaAoa = aoa(wbRes, 'ANOVA');
ok('ANOVA tem linha de falta de ajuste', anovaAoa.some((l) => String(l[0]).includes('Falta de ajuste')));
ok('ANOVA tem linha de erro puro', anovaAoa.some((l) => String(l[0]).includes('Erro puro')));
const modeloAoa = aoa(wbRes, 'Modelo');
ok('modelo lista os 6 coeficientes', modeloAoa.filter((l) => /^b\d/.test(String(l[0]))).length === 6);

console.log('\n— Erros com mensagem útil —');
const vazio = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(vazio, XLSX.utils.aoa_to_sheet([['nada aqui']]), 'Planilha1');
ok('arquivo estranho é identificado como desconhecido', identificarArquivo(ciclo(vazio)) === 'desconhecido');
const semMeta = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(semMeta, XLSX.utils.aoa_to_sheet([['Ensaio', 'Temperatura (°C)']]), 'Ensaios');
const r3 = lerEnsaiosPreenchidos(ciclo(semMeta));
ok('planilha copiada sem _DOE dá erro explicativo',
  r3.erros.length > 0 && r3.erros[0].includes('_DOE'), r3.erros.join(' | '));

const semFator = lerSpecDeAbas({
  experimento: [['Nome do experimento', 'X'], ['O que será medido', 'Y']],
  fatores: [['Fator', 'Unidade', 'Valor mínimo', 'Valor máximo']],
});
ok('modelo sem fatores dá erro explicativo', semFator.erros.some((e) => e.includes('Fatores')), semFator.erros.join(' | '));

const minMaiorQueMax = lerSpecDeAbas({
  experimento: [['Nome do experimento', 'X'], ['O que será medido', 'Y']],
  fatores: [['Fator', 'Unidade', 'Valor mínimo', 'Valor máximo'], ['T', 'C', '60', '40'], ['P', 'bar', '1', '2']],
});
ok('mínimo > máximo é aceito na leitura e barrado na validação',
  minMaiorQueMax.erros.length === 0);
let barrou = false;
try { criarPlanejamento(minMaiorQueMax.spec); } catch { barrou = true; }
ok('criarPlanejamento rejeita mínimo > máximo', barrou);

console.log('\n— Nome de arquivo —');
ok('acentos e espaços viram hífen',
  nomeArquivo('ensaios', 'Otimização da Síntese X') === 'ensaios-otimizacao-da-sintese-x.xlsx',
  nomeArquivo('ensaios', 'Otimização da Síntese X'));
ok('nome vazio tem fallback', nomeArquivo('ensaios', '') === 'ensaios-experimento.xlsx');

console.log(falhas === 0 ? '\n✅ Todos os testes de Excel passaram.\n' : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
