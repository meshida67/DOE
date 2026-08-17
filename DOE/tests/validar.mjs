/**
 * validar.mjs — confere a implementação JavaScript contra um arquivo de casos
 * de referência.
 *
 *   node tests/validar.mjs                              (referência analítica)
 *   node tests/validar.mjs tests/casos-matlab.json      (referência do MATLAB)
 *
 * O arquivo analítico traz valores deduzidos em forma fechada, independentes
 * de qualquer implementação. O arquivo do MATLAB é produzido por
 * matlab/validacao/gerar_casos.m e tem exatamente a mesma estrutura, de modo
 * que este mesmo runner serve para os dois — é o elo que mantém o MATLAB como
 * referência matemática do projeto sem que ele precise rodar na entrega.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { criarPlanejamento, analisarResultados } from '../app/js/core/pipeline.js';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arquivo = process.argv[2] || path.join(raiz, 'tests', 'casos-referencia.json');

if (!fs.existsSync(arquivo)) {
  console.error(`\nArquivo de referência não encontrado: ${arquivo}`);
  console.error('Gere-o no MATLAB com matlab/validacao/gerar_casos.m, ou rode sem argumento para usar a referência analítica.\n');
  process.exit(2);
}

const ref = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
console.log(`\nReferência: ${path.relative(raiz, arquivo)}  (fonte: ${ref.fonte})`);

let total = 0, falhas = 0;

const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toPrecision(12)) : JSON.stringify(v));

function conferir(rotulo, obtido, esperado, tol) {
  total++;
  let ok;
  if (Array.isArray(esperado)) {
    ok = Array.isArray(obtido) && obtido.length === esperado.length
      && esperado.every((v, i) => Math.abs(obtido[i] - v) <= tol + tol * Math.abs(v));
  } else if (typeof esperado === 'number') {
    ok = typeof obtido === 'number' && Math.abs(obtido - esperado) <= tol + tol * Math.abs(esperado);
  } else {
    ok = obtido === esperado;
  }
  if (ok) { console.log(`    ok  ${rotulo}`); return true; }
  falhas++;
  console.log(`  FALHA ${rotulo}`);
  console.log(`          esperado: ${fmt(esperado)}`);
  console.log(`          obtido:   ${fmt(obtido)}`);
  return false;
}

/** Só confere as chaves presentes no arquivo — referências parciais são válidas. */
const se = (obj, chave, fn) => { if (obj[chave] !== undefined) fn(obj[chave]); };

for (const caso of ref.casos) {
  console.log(`\n  ${caso.nome}`);
  if (caso.descricao) console.log(`    ${caso.descricao}`);
  const tol = caso.tolerancia ?? 1e-8;

  let plano;
  try {
    plano = criarPlanejamento(caso.spec);
  } catch (e) {
    falhas++; total++;
    console.log(`  FALHA não foi possível gerar o planejamento: ${e.message}`);
    continue;
  }

  // ── verificações sobre o planejamento ──────────────────────────────────
  const ep = caso.esperadoPlanejamento;
  if (ep) {
    const d = plano.diagnostico;
    const f = plano.meta.fatores;
    se(ep, 'alpha', (v) => conferir('distância axial α', plano.meta.config.alpha, v, tol));
    se(ep, 'totalEnsaios', (v) => conferir('total de ensaios', d.totalEnsaios, v, 0));
    se(ep, 'pontosFatoriais', (v) => conferir('pontos fatoriais', d.pontosFatoriais, v, 0));
    se(ep, 'pontosAxiais', (v) => conferir('pontos axiais', d.pontosAxiais, v, 0));
    se(ep, 'pontosCentrais', (v) => conferir('pontos centrais', d.pontosCentrais, v, 0));
    se(ep, 'numeroCoeficientes', (v) => conferir('nº de coeficientes', d.numeroCoeficientes, v, 0));
    se(ep, 'glResiduo', (v) => conferir('g.l. do resíduo', d.glResiduo, v, 0));
    se(ep, 'glErroPuro', (v) => conferir('g.l. do erro puro', d.glErroPuro, v, 0));
    se(ep, 'unidadeCodificada', (v) => conferir('unidade codificada', f.map((x) => x.unidadeCodificada), v, tol));
    se(ep, 'minimoReal', (v) => conferir('menor valor gerado por fator',
      f.map((_, j) => Math.min(...plano.ensaios.map((e) => e.reais[j]))), v, tol));
    se(ep, 'maximoReal', (v) => conferir('maior valor gerado por fator',
      f.map((_, j) => Math.max(...plano.ensaios.map((e) => e.reais[j]))), v, tol));
  }

  if (!caso.y) continue;

  // ── verificações sobre a análise ───────────────────────────────────────
  if (caso.y.length !== plano.ensaios.length) {
    falhas++; total++;
    console.log(`  FALHA o caso traz ${caso.y.length} resultados, mas o planejamento gerou ${plano.ensaios.length} ensaios`);
    continue;
  }
  // 'y' segue a ordem padrão, não a de execução.
  const porOrdem = [...plano.ensaios].sort((a, b) => a.ordemPadrao - b.ordemPadrao);
  const ensaios = porOrdem.map((e, i) => ({ ...e, resposta: caso.y[i] }));

  let an;
  try {
    an = analisarResultados(plano.meta, ensaios);
  } catch (e) {
    falhas++; total++;
    console.log(`  FALHA não foi possível analisar: ${e.message}`);
    continue;
  }

  const x = caso.esperado || {};
  const est = an.otimo.estacionario;
  const autov = an.otimo.canonica.autovalores;

  se(x, 'beta', (v) => conferir('coeficientes do modelo', an.ajuste.beta, v, tol));
  se(x, 'sqTotal', (v) => conferir('soma quadrática total', an.anova.sqTotal, v, tol));
  se(x, 'sqRegressao', (v) => conferir('soma quadrática da regressão', an.anova.sqRegressao, v, tol));
  se(x, 'sqResiduo', (v) => conferir('soma quadrática residual', an.anova.sqResiduo, v, tol));
  se(x, 'sqErroPuro', (v) => conferir('soma quadrática do erro puro', an.anova.sqErroPuro, v, tol));
  se(x, 'glRegressao', (v) => conferir('g.l. da regressão', an.anova.glRegressao, v, 0));
  se(x, 'glResiduo', (v) => conferir('g.l. do resíduo', an.anova.glResiduo, v, 0));
  se(x, 'glTotal', (v) => conferir('g.l. total', an.anova.glTotal, v, 0));
  se(x, 'glErroPuro', (v) => conferir('g.l. do erro puro', an.anova.glErroPuro, v, 0));
  se(x, 'glFaltaAjuste', (v) => conferir('g.l. da falta de ajuste', an.anova.glFaltaAjuste, v, 0));
  se(x, 'r2', (v) => conferir('R²', an.anova.r2, v, tol));
  se(x, 'estacionarioCodificado', (v) => conferir('ponto estacionário (codificado)', est?.codificados, v, tol));
  se(x, 'estacionarioReal', (v) => conferir('ponto estacionário (real)', est?.reais, v, tol));
  se(x, 'estacionarioPrevisto', (v) => conferir('resposta no ponto estacionário', est?.previsto, v, tol));
  se(x, 'autovalores', (v) => conferir('autovalores de B', autov, v, tol));
  se(x, 'somaAutovalores', (v) => conferir('traço de B (soma dos autovalores)', autov.reduce((s, a) => s + a, 0), v, tol));
  se(x, 'produtoAutovalores', (v) => conferir('determinante de B (produto dos autovalores)', autov.reduce((s, a) => s * a, 1), v, tol));
  se(x, 'tipoSuperficie', (v) => conferir('classificação da superfície', an.otimo.canonica.tipo, v, 0));
  se(x, 'otimoCodificado', (v) => conferir('ótimo restrito (codificado)', an.otimo.recomendado.codificados, v, tol));
  se(x, 'otimoPrevisto', (v) => conferir('resposta no ótimo restrito', an.otimo.recomendado.previsto, v, tol));
  se(x, 'otimoNaBorda', (v) => conferir('ótimo está na borda', an.otimo.recomendado.naBorda, v, 0));
}

console.log(`\n${falhas === 0 ? '✅' : '❌'}  ${total - falhas}/${total} verificações passaram${falhas ? ` — ${falhas} falha(s)` : ''}.\n`);
process.exit(falhas === 0 ? 0 : 1);
