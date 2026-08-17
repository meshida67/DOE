/** Confere a geração das tabelas LaTeX. */
import { criarPlanejamento, analisarResultados } from '../app/js/core/pipeline.js';
import { montarTermos, prever } from '../app/js/core/model.js';
import { paraCodificado } from '../app/js/core/coding.js';
import { gerarLatex } from '../app/js/io/latex.js';

const spec = {
  experimento: { nome: 'Síntese & purificação (teste_100%)' },
  resposta: { nome: 'Rendimento', unidade: '%', objetivo: 'maximizar' },
  fatores: [
    { nome: 'Temperatura', unidade: '°C', min: 40, max: 60 },
    { nome: 'Concentração', unidade: 'mol/L', min: 0.1, max: 0.5 },
  ],
  config: { tipoAlpha: 'face', pontosCentrais: 3 },
};
const { meta, ensaios } = criarPlanejamento(spec);
const t = montarTermos(2);
const B = [80, 2, 3, -4, -5, -1];
let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff - 0.5; };
const an = analisarResultados(meta, ensaios.map((e) => ({
  ...e, resposta: prever(e.reais.map((r, j) => paraCodificado(r, meta.fatores[j])), B, t) + rnd() * 0.5,
})));

const tex = gerarLatex(an);
let falhas = 0;
const ok = (n, c) => { console.log(c ? `  ok  ${n}` : `FALHA  ${n}`); if (!c) falhas++; };

ok('tem tabela de ensaios', tex.includes('\\label{tab:ensaios}'));
ok('tem tabela de coeficientes', tex.includes('\\label{tab:coeficientes}'));
ok('tem tabela ANOVA', tex.includes('\\label{tab:anova}'));
ok('tem equação do modelo', tex.includes('\\begin{equation}') && tex.includes('\\hat{y}'));
ok('usa booktabs', tex.includes('\\toprule') && tex.includes('\\midrule') && tex.includes('\\bottomrule'));
ok('linha de falta de ajuste presente', tex.includes('Falta de ajuste'));
ok('escapa & e % e _ no nome do experimento',
  tex.includes('Síntese \\& purificação (teste\\_100\\%)'));
ok('vírgula decimal nos números', /\d,\d/.test(tex));
ok('ambientes balanceados',
  (tex.match(/\\begin\{table\}/g) || []).length === (tex.match(/\\end\{table\}/g) || []).length &&
  (tex.match(/\\begin\{tabular\}/g) || []).length === (tex.match(/\\end\{tabular\}/g) || []).length);
ok('parágrafo de conclusão cita a condição ótima', tex.includes('condição ótima'));
ok('sem "undefined" ou "NaN" vazando', !/undefined|NaN/.test(tex));

console.log(`\n--- amostra ---\n${tex.split('\n').slice(6, 22).join('\n')}\n`);
console.log(falhas === 0 ? '✅ LaTeX ok.\n' : `❌ ${falhas} falha(s).\n`);
process.exit(falhas ? 1 : 0);
