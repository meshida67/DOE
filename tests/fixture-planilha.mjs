/**
 * Gera uma planilha de ensaios já preenchida com resultados sintéticos.
 * Serve de fixture para o teste de ponta a ponta no navegador e como
 * arquivo de exemplo para conferir o layout no Excel.
 *
 *   node tests/fixture-planilha.mjs <caminho-de-saida.xlsx>
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
globalThis.XLSX = require(path.join(raiz, 'app/js/vendor/xlsx.full.min.js'));
const XLSX = globalThis.XLSX;

const { criarPlanejamento } = await import('../app/js/core/pipeline.js');
const { gerarPlanilhaEnsaios, gerarModeloEntrada } = await import('../app/js/io/excel.js');
const { montarTermos, prever } = await import('../app/js/core/model.js');
const { paraCodificado } = await import('../app/js/core/coding.js');

const spec = {
  experimento: { nome: 'Síntese do acetato de etila', grupo: '3' },
  resposta: { nome: 'Rendimento', unidade: '%', objetivo: 'maximizar' },
  fatores: [
    { nome: 'Temperatura', unidade: '°C', min: 50, max: 80 },
    { nome: 'Concentração do catalisador', unidade: 'mol/L', min: 0.05, max: 0.25 },
  ],
  config: { tipoAlpha: 'face', pontosCentrais: 3 },
};

const { meta, ensaios, diagnostico } = criarPlanejamento(spec);

// Superfície verdadeira com pico interno, mais ruído reprodutível.
const VERDADE = [78, 4.2, 6.1, -7.5, -9.0, -2.4];
const termos = montarTermos(2);
let seed = 2026;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };

const respostas = new Map(ensaios.map((e) => [
  e.id,
  Number((prever(e.reais.map((r, j) => paraCodificado(r, meta.fatores[j])), VERDADE, termos) + rnd() * 1.6).toFixed(2)),
]));

const saida = process.argv[2] || path.join(raiz, 'exemplos', 'ensaios-preenchido.xlsx');
fs.mkdirSync(path.dirname(saida), { recursive: true });

const wb = gerarPlanilhaEnsaios(meta, ensaios, diagnostico);
const ws = wb.Sheets['Ensaios'];
const range = XLSX.utils.decode_range(ws['!ref']);
for (let r = 1; r <= range.e.r; r++) {
  const id = ws[XLSX.utils.encode_cell({ r, c: 1 })]?.v;
  if (respostas.has(id)) ws[XLSX.utils.encode_cell({ r, c: 4 })] = { t: 'n', v: respostas.get(id) };
}
fs.writeFileSync(saida, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));

const base = path.dirname(saida);
fs.writeFileSync(path.join(base, 'ensaios-em-branco.xlsx'),
  XLSX.write(gerarPlanilhaEnsaios(meta, ensaios, diagnostico), { bookType: 'xlsx', type: 'buffer' }));
fs.writeFileSync(path.join(base, 'modelo-experimento-doe.xlsx'),
  XLSX.write(gerarModeloEntrada(), { bookType: 'xlsx', type: 'buffer' }));

console.log(`preenchida:  ${saida}`);
console.log(`em branco:   ${path.join(base, 'ensaios-em-branco.xlsx')}`);
console.log(`modelo:      ${path.join(base, 'modelo-experimento-doe.xlsx')}`);
