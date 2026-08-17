/**
 * Teste de fumaça do núcleo: gera dados de um quadrático conhecido e verifica
 * se o pipeline recupera coeficientes, ponto estacionário e classificação.
 */
import { criarPlanejamento, analisarResultados } from '../app/js/core/pipeline.js';
import { prever, montarTermos } from '../app/js/core/model.js';
import { paraCodificado } from '../app/js/core/coding.js';

let falhas = 0;
function ok(nome, cond, extra = '') {
  if (cond) console.log(`  ok  ${nome}`);
  else { console.log(`FALHA  ${nome} ${extra}`); falhas++; }
}
function perto(a, b, tol = 1e-8) { return Math.abs(a - b) <= tol; }

// Verdade: y = 80 + 2x1 + 3x2 − 4x1² − 5x2² − 1x1x2  (em coordenadas codificadas)
const VERDADE = [80, 2, 3, -4, -5, -1];
const termosRef = montarTermos(2);
const yVerdadeiro = (x) => prever(x, VERDADE, termosRef);

const spec = {
  experimento: { nome: 'Teste sintético', grupo: '7' },
  resposta: { nome: 'Rendimento', unidade: '%', objetivo: 'maximizar' },
  fatores: [
    { nome: 'Temperatura', unidade: 'C', min: 40, max: 60, casasDecimais: 4 },
    { nome: 'Concentracao', unidade: 'M', min: 0.1, max: 0.5, casasDecimais: 6 },
  ],
  config: { tipoAlpha: 'face', pontosCentrais: 3 },
};

console.log('\n— Planejamento —');
const { meta, ensaios, diagnostico } = criarPlanejamento(spec);
ok('total de ensaios = 4 fatoriais + 4 axiais + 3 centrais = 11', diagnostico.totalEnsaios === 11, `(${diagnostico.totalEnsaios})`);
ok('11 ensaios gerados', ensaios.length === 11);
ok('6 coeficientes no modelo quadrático de 2 fatores', diagnostico.numeroCoeficientes === 6);
ok('5 g.l. de resíduo', diagnostico.glResiduo === 5, `(${diagnostico.glResiduo})`);
ok('2 g.l. de erro puro', diagnostico.glErroPuro === 2);
ok('ordens de execução são uma permutação de 1..11',
  JSON.stringify(ensaios.map((e) => e.ordemExecucao).sort((a, b) => a - b)) === JSON.stringify([...Array(11)].map((_, i) => i + 1)));

// Modo 'absoluto' com α=1: os extremos caem exatamente nos limites informados.
const temps = ensaios.map((e) => e.reais[0]);
ok('temperatura respeita [40, 60]', Math.min(...temps) === 40 && Math.max(...temps) === 60,
  `(min ${Math.min(...temps)}, max ${Math.max(...temps)})`);
const centrais = ensaios.filter((e) => e.tipo === 'central');
ok('pontos centrais em (50; 0,3)', centrais.every((e) => perto(e.reais[0], 50) && perto(e.reais[1], 0.3)));

console.log('\n— Ajuste sem ruído —');
const comResposta = ensaios.map((e) => ({
  ...e,
  resposta: yVerdadeiro(e.reais.map((r, j) => paraCodificado(r, meta.fatores[j]))),
}));
const r = analisarResultados(meta, comResposta);

VERDADE.forEach((v, i) => {
  ok(`coeficiente ${r.ajuste.coeficientes[i].rotulo} ≈ ${v}`, perto(r.ajuste.beta[i], v, 1e-9),
    `(obteve ${r.ajuste.beta[i]})`);
});
ok('R² = 1 em dados sem ruído', perto(r.anova.r2, 1, 1e-12), `(${r.anova.r2})`);
ok('resíduos nulos', r.ajuste.residuos.every((v) => Math.abs(v) < 1e-9));

console.log('\n— Ponto estacionário e classificação —');
const X1 = 17 / 79, X2 = 22 / 79;
ok('x1* = 17/79', perto(r.otimo.estacionario.codificados[0], X1, 1e-9), `(${r.otimo.estacionario.codificados[0]})`);
ok('x2* = 22/79', perto(r.otimo.estacionario.codificados[1], X2, 1e-9), `(${r.otimo.estacionario.codificados[1]})`);
ok('ŷ no ponto estacionário', perto(r.otimo.estacionario.previsto, yVerdadeiro([X1, X2]), 1e-9));
ok('classificada como máximo', r.otimo.canonica.tipo === 'maximo', `(${r.otimo.canonica.tipo})`);
ok('autovalores −3,7929 e −5,2071',
  perto(r.otimo.canonica.autovalores[0], -4.5 + Math.SQRT1_2, 1e-9) &&
  perto(r.otimo.canonica.autovalores[1], -4.5 - Math.SQRT1_2, 1e-9),
  `(${r.otimo.canonica.autovalores})`);
ok('estacionário dentro da região', r.otimo.estacionario.dentroDaRegiao);
ok('ótimo restrito coincide com o estacionário (pico interno)',
  perto(r.otimo.recomendado.codificados[0], X1, 1e-3) && perto(r.otimo.recomendado.codificados[1], X2, 1e-3),
  `(${r.otimo.recomendado.codificados})`);
ok('ótimo não está na borda', r.otimo.recomendado.naBorda === false);

console.log('\n— Caso sela: o ótimo deve ir para a borda —');
const SELA = [50, 1, 1, 3, -3, 0]; // curvaturas de sinais opostos
const ensaiosSela = ensaios.map((e) => ({
  ...e,
  resposta: prever(e.reais.map((rr, j) => paraCodificado(rr, meta.fatores[j])), SELA, termosRef),
}));
const rs = analisarResultados(meta, ensaiosSela);
ok('classificada como sela', rs.otimo.canonica.tipo === 'sela', `(${rs.otimo.canonica.tipo})`);
ok('ótimo restrito na borda', rs.otimo.recomendado.naBorda === true);
// Máximo de 50 + x1 + x2 + 3x1² − 3x2² em [−1,1]²: x1=±1 favorece x1=1, x2 pequeno.
ok('x1 vai para o limite superior', perto(rs.otimo.recomendado.codificados[0], 1, 1e-6), `(${rs.otimo.recomendado.codificados[0]})`);
ok('emite aviso de borda', rs.otimo.avisos.some((a) => a.texto.includes('borda')));
ok('sugere caminho para nova rodada', rs.otimo.caminho !== null);

console.log('\n— Minimização —');
const metaMin = { ...meta, resposta: { ...meta.resposta, objetivo: 'minimizar' } };
const rmin = analisarResultados(metaMin, comResposta);
const yOtimoMin = rmin.otimo.recomendado.previsto;
const cantos = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map((c) => yVerdadeiro(c));
ok('mínimo encontrado ≤ todos os vértices', cantos.every((v) => yOtimoMin <= v + 1e-6),
  `(ótimo ${yOtimoMin}, vértices ${cantos})`);

console.log('\n— ANOVA com ruído e erro puro —');
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
const comRuido = ensaios.map((e) => ({
  ...e,
  resposta: yVerdadeiro(e.reais.map((rr, j) => paraCodificado(rr, meta.fatores[j]))) + rnd() * 0.4,
}));
const rn = analisarResultados(meta, comRuido);
ok('erro puro detectado a partir dos pontos centrais', rn.anova.temErroPuro);
ok('2 g.l. de erro puro', rn.anova.glErroPuro === 2, `(${rn.anova.glErroPuro})`);
ok('g.l. de falta de ajuste = 3', rn.anova.glFaltaAjuste === 3, `(${rn.anova.glFaltaAjuste})`);
ok('SQ resíduo = SQ erro puro + SQ falta de ajuste',
  perto(rn.anova.sqResiduo, rn.anova.sqErroPuro + rn.anova.sqFaltaAjuste, 1e-9));
ok('SQ total = SQ regressão + SQ resíduo',
  perto(rn.anova.sqTotal, rn.anova.sqRegressao + rn.anova.sqResiduo, 1e-9));
ok('R² alto com ruído pequeno', rn.anova.r2 > 0.99, `(${rn.anova.r2})`);
ok('regressão significativa', rn.anova.pRegressao < 0.01, `(p=${rn.anova.pRegressao})`);
ok('p-valores em [0,1]', rn.ajuste.coeficientes.every((c) => c.pValor >= 0 && c.pValor <= 1));

console.log('\n— α rotacionável mantém os ensaios dentro dos limites (modo absoluto) —');
const specRot = { ...spec, config: { tipoAlpha: 'rotacionavel', pontosCentrais: 3 } };
const rot = criarPlanejamento(specRot);
ok('α = 2^(1/2) para k=2', perto(rot.meta.config.alpha, Math.SQRT2, 1e-12), `(${rot.meta.config.alpha})`);
const tempsRot = rot.ensaios.map((e) => e.reais[0]);
ok('nenhum ensaio fora de [40, 60]', Math.min(...tempsRot) >= 40 - 1e-9 && Math.max(...tempsRot) <= 60 + 1e-9,
  `(min ${Math.min(...tempsRot)}, max ${Math.max(...tempsRot)})`);
ok('os pontos axiais tocam exatamente os limites',
  perto(Math.min(...tempsRot), 40, 1e-6) && perto(Math.max(...tempsRot), 60, 1e-6));

console.log('\n— 3 fatores —');
const spec3 = {
  ...spec,
  fatores: [...spec.fatores, { nome: 'Tempo', unidade: 'min', min: 10, max: 30, casasDecimais: 4 }],
  config: { tipoAlpha: 'face', pontosCentrais: 4 },
};
const p3 = criarPlanejamento(spec3);
ok('8 + 6 + 4 = 18 ensaios', p3.diagnostico.totalEnsaios === 18, `(${p3.diagnostico.totalEnsaios})`);
ok('10 coeficientes', p3.diagnostico.numeroCoeficientes === 10);
const termos3 = montarTermos(3);
const VERDADE3 = [100, 1, -2, 3, -5, -4, -6, 0.5, -1, 2];
const ens3 = p3.ensaios.map((e) => ({
  ...e,
  resposta: prever(e.reais.map((rr, j) => paraCodificado(rr, p3.meta.fatores[j])), VERDADE3, termos3),
}));
const r3 = analisarResultados(p3.meta, ens3);
ok('recupera os 10 coeficientes com 3 fatores', VERDADE3.every((v, i) => perto(r3.ajuste.beta[i], v, 1e-8)));
ok('classificada como máximo (todas as curvaturas negativas)', r3.otimo.canonica.tipo === 'maximo', `(${r3.otimo.canonica.tipo})`);

console.log('\n— Validação de entrada —');
const tentar = (s) => { try { criarPlanejamento(s); return null; } catch (e) { return e.erros || [e.message]; } };
ok('rejeita um único fator', tentar({ ...spec, fatores: [spec.fatores[0]] }) !== null);
ok('rejeita min ≥ max', tentar({ ...spec, fatores: [{ ...spec.fatores[0], min: 60, max: 40 }, spec.fatores[1]] }) !== null);
ok('rejeita nomes duplicados', tentar({ ...spec, fatores: [spec.fatores[0], { ...spec.fatores[1], nome: 'Temperatura' }] }) !== null);
ok('rejeita experimento sem nome', tentar({ ...spec, experimento: {} }) !== null);
ok('rejeita alvo ausente quando objetivo é alvo',
  tentar({ ...spec, resposta: { ...spec.resposta, objetivo: 'alvo' } }) !== null);

console.log(falhas === 0 ? '\n✅ Todos os testes passaram.\n' : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
