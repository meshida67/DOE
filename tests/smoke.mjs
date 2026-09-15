/**
 * Teste de fumaça do núcleo: gera dados de um quadrático conhecido e verifica
 * se o pipeline recupera coeficientes, ponto estacionário e classificação.
 */
import { criarPlanejamento, analisarResultados } from '../app/js/core/pipeline.js';
import { prever, montarTermos, matrizB, hessiana } from '../app/js/core/model.js';
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

console.log('\n— Modelo cúbico —');

// hessiana deve ser BIT-IDÊNTICA a 2·matrizB para qualquer modelo quadrático:
// é essa igualdade que garante que trocar matrizB por hessiana em optimize.js
// não move os casos de referência nem um último bit.
{
  let bitExato = true;
  for (const k of [2, 3, 4]) {
    const termos = montarTermos(k);
    for (let t = 0; t < 30 && bitExato; t++) {
      const beta = termos.map(() => (Math.random() - 0.5) * 20);
      const x = Array.from({ length: k }, () => (Math.random() - 0.5) * 4);
      const B = matrizB(beta, termos, k);
      const H = hessiana(x, beta, termos, k);
      for (let i = 0; i < k && bitExato; i++) {
        for (let j = 0; j < k && bitExato; j++) if (H[i][j] !== 2 * B[i][j]) bitExato = false;
      }
    }
  }
  ok('hessiana(x, ...) === 2·matrizB(...) bit a bit, para qualquer x (quadrático)', bitExato);
}

// Prefixos encaixados: quadratico ⊂ cubicoReduzido ⊂ cubicoCompleto.
{
  const q = montarTermos(2, null, 'quadratico');
  const r = montarTermos(2, null, 'cubicoReduzido');
  const c = montarTermos(2, null, 'cubicoCompleto');
  ok('quadratico(k=2) tem 6 termos', q.length === 6);
  ok('cubicoReduzido(k=2) tem 8 termos', r.length === 8, `(${r.length})`);
  ok('cubicoCompleto(k=2) tem 10 termos', c.length === 10, `(${c.length})`);
  ok('cubicoReduzido(3) tem 14 termos', montarTermos(3, null, 'cubicoReduzido').length === 14);
  ok('cubicoReduzido(4) tem 23 termos', montarTermos(4, null, 'cubicoReduzido').length === 23);
  ok('cubicoCompleto(3) tem 20 termos', montarTermos(3, null, 'cubicoCompleto').length === 20);
  ok('quadratico é prefixo de cubicoReduzido', r.slice(0, 6).every((t, i) => t.rotulo === q[i].rotulo));
  ok('cubicoReduzido é prefixo de cubicoCompleto', c.slice(0, 8).every((t, i) => t.rotulo === r[i].rotulo));
}

// Recuperação exata de um cúbico reduzido sintético (8 coeficientes), CCD
// rotacionável k=2 — sem nenhum ensaio além do CCD de sempre.
{
  const specCubico = {
    experimento: { nome: 'Cúbico sintético' },
    resposta: { nome: 'Rendimento', unidade: '%', objetivo: 'maximizar' },
    fatores: [
      { nome: 'Temperatura', unidade: 'C', min: 40, max: 60, casasDecimais: 8 },
      { nome: 'Concentracao', unidade: 'M', min: 0.1, max: 0.5, casasDecimais: 8 },
    ],
    config: { tipoAlpha: 'rotacionavel', pontosCentrais: 3, modelo: 'cubicoReduzido' },
  };
  const { meta, ensaios } = criarPlanejamento(specCubico);
  ok('CCD cúbico reduzido k=2 continua com 11 ensaios (nenhum extra)', ensaios.length === 11, `(${ensaios.length})`);
  const VERDADE_CUBICA = [80, 2, 3, -4, -5, -1, 0.8, -0.6];
  const termosCubicos = montarTermos(2, null, 'cubicoReduzido');
  const ensCubicos = ensaios.map((e) => ({ ...e, resposta: prever(e.codificadosPlanejados, VERDADE_CUBICA, termosCubicos) }));
  const anCubico = analisarResultados(meta, ensCubicos);
  ok('recupera os 8 coeficientes do cúbico reduzido',
    VERDADE_CUBICA.every((v, i) => perto(anCubico.ajuste.beta[i], v, 1e-6)), `(${anCubico.ajuste.beta})`);

  // O MESMO conjunto de ensaios, reanalisado como quadrático, não deve
  // recuperar o modelo (é o cenário do usuário: quadrático descreve mal).
  const anQuad = analisarResultados(meta, ensCubicos, { modelo: 'quadratico' });
  ok('reanalisar como quadrático (mesmos ensaios) tem resíduo bem maior que o cúbico',
    anQuad.ajuste.sqResiduo > 1e6 * Math.max(anCubico.ajuste.sqResiduo, 1e-300));
}

// α = 1 ("face") torna qualquer termo cúbico indistinguível do linear —
// tem que ser bloqueado na validação, e não só falhar depois com "singular".
{
  const base = {
    experimento: { nome: 'Bloqueio de α' },
    resposta: { nome: 'R' },
    fatores: [{ nome: 'A', min: 0, max: 10 }, { nome: 'B', min: 0, max: 10 }],
  };
  const tentarCubico = (config) => { try { criarPlanejamento({ ...base, config }); return null; } catch (e) { return e.erros || [e.message]; } };
  ok('rejeita cúbico + "face" (α=1 exato)',
    tentarCubico({ tipoAlpha: 'face', modelo: 'cubicoReduzido' }) !== null);
  ok('rejeita cúbico + "ortogonal" com k=2/nc=1 (α=1 exato por coincidência)',
    tentarCubico({ tipoAlpha: 'ortogonal', pontosCentrais: 1, modelo: 'cubicoReduzido' }) !== null);
  ok('rejeita cúbico completo + "ortogonal" (perde sentido com o bloco extra)',
    tentarCubico({ tipoAlpha: 'ortogonal', pontosCentrais: 3, modelo: 'cubicoCompleto' }) !== null);
  const tentarK4 = () => { try { criarPlanejamento({ ...base, fatores: [...base.fatores, { nome: 'C', min: 0, max: 10 }, { nome: 'D', min: 0, max: 10 }], config: { tipoAlpha: 'rotacionavel', modelo: 'cubicoCompleto' } }); return null; } catch (e) { return e.erros || [e.message]; } };
  ok('rejeita cúbico completo com k=4 (91 ensaios seria inviável)', tentarK4() !== null);
  ok('aceita cúbico reduzido + "rotacionavel"', tentarCubico({ tipoAlpha: 'rotacionavel', modelo: 'cubicoReduzido' }) === null);
}

// Cúbico completo k=2: acrescenta exatamente o bloco complementar (3^k−2^k−1
// pontos), depois do central, sem mexer na ordem nem no sorteio dos blocos
// que já existiam.
{
  const specCompleto = {
    experimento: { nome: 'Completo' }, resposta: { nome: 'R' },
    fatores: [{ nome: 'A', min: 0, max: 10 }, { nome: 'B', min: 0, max: 10 }],
    config: { tipoAlpha: 'rotacionavel', pontosCentrais: 3, modelo: 'cubicoCompleto' },
  };
  const { ensaios: ensCompleto } = criarPlanejamento(specCompleto);
  ok('cúbico completo k=2 gera 15 ensaios (11 do CCD + 4 complementares)', ensCompleto.length === 15, `(${ensCompleto.length})`);
  const complementares = ensCompleto.filter((e) => e.tipo === 'complementar');
  ok('4 ensaios do tipo "complementar"', complementares.length === 4, `(${complementares.length})`);
  ok('complementares ocupam ordemPadrao 12..15', complementares.every((e) => e.ordemPadrao >= 12 && e.ordemPadrao <= 15));
  ok('complementares têm coordenadas em {-1,0,1}', complementares.every((e) => e.codificadosPlanejados.every((v) => v === -1 || v === 0 || v === 1)));

  // A garantia não é "os 11 primeiros do cúbico completo shufflam igual ao
  // quadrático" (Fisher-Yates sobre arrays de tamanhos diferentes consome a
  // mesma semente de forma diferente) — é que MODELOS QUE NÃO ACRESCENTAM
  // bloco nenhum (quadrático e cúbico reduzido, ambos com 11 ensaios)
  // embaralham EXATAMENTE igual, porque a única ramificação em
  // gerarMatrizCCD é `modelo === 'cubicoCompleto'`.
  const { ensaios: ensQuad } = criarPlanejamento({ ...specCompleto, config: { ...specCompleto.config, modelo: 'quadratico' } });
  const { ensaios: ensReduzido } = criarPlanejamento({ ...specCompleto, config: { ...specCompleto.config, modelo: 'cubicoReduzido' } });
  ok('quadrático e cúbico reduzido (nenhum acrescenta bloco) embaralham identicamente',
    JSON.stringify(ensQuad.map((e) => e.ordemExecucao)) === JSON.stringify(ensReduzido.map((e) => e.ordemExecucao)));
}

// Dados sem ruído (simulador determinístico): a ferramenta não pode afirmar
// coisas falsas — nem "sem repetições" havendo réplicas, nem F/coeficientes
// astronômicos como se fossem confiáveis.
{
  const spec2 = {
    experimento: { nome: 'Determinístico' }, resposta: { nome: 'R', objetivo: 'maximizar' },
    fatores: [{ nome: 'T', min: 40, max: 60, casasDecimais: 6 }, { nome: 'C', min: 0.1, max: 0.5, casasDecimais: 6 }],
    config: { tipoAlpha: 'rotacionavel', pontosCentrais: 3 },
  };
  const { meta: metaDet, ensaios: ensDet } = criarPlanejamento(spec2);
  const termosDet = montarTermos(2);
  const cheiosDet = ensDet.map((e) => ({ ...e, resposta: prever(e.codificadosPlanejados, [80, 2, 3, -4, -5, -1], termosDet) }));
  const anDet = analisarResultados(metaDet, cheiosDet);
  ok('detecta ajuste exato', anDet.ajuste.ajusteExato === true);
  ok('detecta ausência de ruído nas réplicas', anDet.anova.semRuido === true);
  ok('pFaltaAjuste fica NaN (não inventa um p-valor)', Number.isNaN(anDet.anova.pFaltaAjuste));
  ok('coeficientes não são marcados como significativos por engano (null, não true)',
    anDet.ajuste.coeficientes.every((c) => c.significativo === null));
  ok('a mensagem NÃO diz "Sem repetições" (há 3)',
    !anDet.leitura.mensagens.some((m) => m.texto.includes('Sem repetições')));
}

// PRESS discrimina overfitting mesmo quando o R² não discrimina nada (ambos
// próximos de 1 com dados sem ruído) — é a métrica que decide entre modelos.
{
  const specPress = {
    experimento: { nome: 'PRESS' }, resposta: { nome: 'R', objetivo: 'maximizar' },
    fatores: [{ nome: 'T', min: 40, max: 60, casasDecimais: 8 }, { nome: 'C', min: 0.1, max: 0.5, casasDecimais: 8 }],
    config: { tipoAlpha: 'rotacionavel', pontosCentrais: 3 },
  };
  const { meta: metaPress, ensaios: ensPress } = criarPlanejamento(specPress);
  const termosCubPress = montarTermos(2, null, 'cubicoReduzido');
  const betaCub = [80, 2, 3, -4, -5, -1, 3, -2]; // cúbico de verdade, com termos cúbicos grandes
  const cheiosPress = ensPress.map((e) => ({ ...e, resposta: prever(e.codificadosPlanejados, betaCub, termosCubPress) }));
  const anQuadPress = analisarResultados(metaPress, cheiosPress, { modelo: 'quadratico' });
  const anCubPress = analisarResultados(metaPress, cheiosPress, { modelo: 'cubicoReduzido' });
  ok('PRESS do quadrático (mal ajustado) é MUITO maior que o do cúbico (exato)',
    anQuadPress.ajuste.press > 1e6 * Math.max(anCubPress.ajuste.press, 1e-300),
    `(quad=${anQuadPress.ajuste.press}, cub=${anCubPress.ajuste.press})`);
}

// Multistart: um cúbico separável com 4 estacionários conhecidos (máximo,
// mínimo, 2 selas) — todos devem ser encontrados e classificados localmente.
{
  const k = 2;
  const termosMulti = montarTermos(k, null, 'cubicoReduzido');
  const betaMulti = [0, 3, 3, 0, 0, 0, -1, -1]; // y = 3x1 - x1³ + 3x2 - x2³
  const specMulti = {
    experimento: { nome: 'Multiestacionário' }, resposta: { nome: 'R', objetivo: 'maximizar' },
    fatores: [{ nome: 'A', min: -10, max: 10, casasDecimais: 6 }, { nome: 'B', min: -10, max: 10, casasDecimais: 6 }],
    config: { tipoAlpha: 'rotacionavel', pontosCentrais: 3, modelo: 'cubicoReduzido' },
  };
  const { meta: metaMulti, ensaios: ensMulti } = criarPlanejamento(specMulti);
  const cheiosMulti = ensMulti.map((e) => ({ ...e, resposta: prever(e.codificadosPlanejados, betaMulti, termosMulti) }));
  const anMulti = analisarResultados(metaMulti, cheiosMulti);
  ok('encontra os 4 estacionários (máximo, mínimo, 2 selas)', anMulti.otimo.estacionarios.length === 4, `(${anMulti.otimo.estacionarios.length})`);
  ok('o principal é o máximo (1,1), que é o de melhor score', anMulti.otimo.estacionario?.canonica.tipo === 'maximo');
  ok('a análise canônica no estacionário é marcada como local (grau 3)', anMulti.otimo.canonica.local === true);
  ok('avisa sobre múltiplos estacionários', anMulti.otimo.avisos.some((a) => a.texto.includes('pontos de inclinação nula')));
}

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
