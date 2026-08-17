/**
 * latex.js — tabelas prontas para o relatório da disciplina.
 *
 * Reproduz o formato que o grupo já usava em latextab.m e anovatab.m
 * (booktabs, float [H], caption e label), para que o texto gerado possa ser
 * colado direto no .tex sem retrabalho. Pacotes necessários no preâmbulo:
 * booktabs, float, array, siunitx (opcional).
 */

import { formatarP } from '../core/anova.js';

/** Escapa os caracteres que quebram compilação em LaTeX. */
export function escaparLatex(texto) {
  return String(texto ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

const n = (v, casas = 3) => (isFinite(v) ? v.toFixed(casas).replace('.', ',') : '---');

function tabela({ colunas, cabecalho, linhas, caption, label, notas = [] }) {
  const l = [];
  l.push('\\begin{table}[H]');
  l.push('\t\\centering');
  l.push(`\t\\caption{${caption}}`);
  l.push(`\t\\label{${label}}`);
  l.push('\t\\renewcommand{\\arraystretch}{1.25}');
  l.push(`\t\\begin{tabular}{${colunas}}`);
  l.push('\t\t\\toprule');
  l.push(`\t\t${cabecalho.map((c) => `\\textbf{${c}}`).join(' & ')} \\\\`);
  l.push('\t\t\\midrule');
  for (const linha of linhas) {
    if (linha === '\\midrule') { l.push('\t\t\\midrule'); continue; }
    l.push(`\t\t${linha.join(' & ')} \\\\`);
  }
  l.push('\t\t\\bottomrule');
  l.push('\t\\end{tabular}');
  for (const nota of notas) l.push(`\t\\\\[2pt] \\footnotesize ${nota}`);
  l.push('\\end{table}');
  return l.join('\n');
}

/** Matriz de ensaios com valores reais e resultados. */
export function tabelaEnsaios(analise) {
  const { meta, ensaios } = analise;
  const f = meta.fatores;
  const un = (x) => (x.unidade ? ` (${escaparLatex(x.unidade)})` : '');
  return tabela({
    colunas: `c c ${f.map(() => 'c').join(' ')} c`,
    cabecalho: ['Ordem', 'Ensaio', ...f.map((x) => `${escaparLatex(x.nome)}${un(x)}`),
      `${escaparLatex(meta.resposta.nome)}${un(meta.resposta)}`],
    linhas: [...ensaios].sort((a, b) => a.ordemPadrao - b.ordemPadrao).map((e) => [
      e.ordemExecucao, escaparLatex(e.id),
      ...e.reais.map((v, j) => n(v, f[j].casasDecimais ?? 2)),
      n(e.resposta, 3),
    ]),
    caption: `Matriz de ensaios do planejamento composto central e resultados experimentais para ${escaparLatex(meta.experimento.nome)}.`,
    label: 'tab:ensaios',
  });
}

/** ANOVA, com falta de ajuste quando há repetições. */
export function tabelaAnova(analise) {
  const a = analise.anova;
  const linhas = [
    ['Regressão', n(a.sqRegressao), a.glRegressao, n(a.qmRegressao), n(a.fRegressao, 2)],
    ['Resíduos', n(a.sqResiduo), a.glResiduo, n(a.qmResiduo), ''],
  ];
  if (a.temErroPuro) {
    linhas.push(
      ['\\quad Falta de ajuste', n(a.sqFaltaAjuste), a.glFaltaAjuste, n(a.qmFaltaAjuste), n(a.fFaltaAjuste, 2)],
      ['\\quad Erro puro', n(a.sqErroPuro), a.glErroPuro, n(a.qmErroPuro), '']
    );
  }
  linhas.push('\\midrule', ['Total', n(a.sqTotal), a.glTotal, n(a.qmTotal), '']);
  linhas.push('\\midrule', ['\\% de variação explicada', `${n(a.r2 * 100, 2)}\\%`, '', '', '']);
  if (a.temErroPuro) {
    linhas.push(['\\% máxima explicável', `${n(a.r2Maximo * 100, 2)}\\%`, '', '', '']);
  }

  const notas = [];
  if (isFinite(a.pRegressao)) notas.push(`Regressão significativa a $p = ${n(a.pRegressao, 4)}$.`);
  if (a.temErroPuro && isFinite(a.pFaltaAjuste)) {
    notas.push(a.pFaltaAjuste < 0.05
      ? `Falta de ajuste significativa ($p = ${n(a.pFaltaAjuste, 4)}$).`
      : `Sem evidência de falta de ajuste ($p = ${n(a.pFaltaAjuste, 4)}$).`);
  }

  return tabela({
    colunas: 'l c c c c',
    cabecalho: ['Fonte de variação', 'Soma quadrática', 'N\\textsuperscript{o} de g.l.', 'Média quadrática', '$F$'],
    linhas,
    caption: `Análise de variância para o ajuste do modelo quadrático aos dados da Tabela~\\ref{tab:ensaios}.`,
    label: 'tab:anova',
    notas,
  });
}

/** Coeficientes do modelo, em variáveis codificadas. */
export function tabelaCoeficientes(analise) {
  const c = analise.ajuste.coeficientes;
  return tabela({
    colunas: 'l c c c',
    cabecalho: ['Termo', 'Coeficiente', 'Erro padrão', '$p$'],
    linhas: c.map((x) => [
      `$${x.rotulo.replace(/^b(\d*)$/, 'b_{$1}')}$`,
      n(x.valor, 4),
      isFinite(x.erroPadrao) ? n(x.erroPadrao, 4) : '---',
      isFinite(x.pValor) ? n(x.pValor, 4) : '---',
    ]),
    caption: 'Coeficientes do modelo quadrático ajustado, em variáveis codificadas.',
    label: 'tab:coeficientes',
    notas: ['Variáveis codificadas no intervalo $[-1,1]$ sobre a região experimental.'],
  });
}

/** Equação do modelo ajustado, em ambiente equation. */
export function equacaoModelo(analise) {
  const { ajuste, meta } = analise;
  const k = meta.fatores.length;
  const termos = [];
  ajuste.coeficientes.forEach((c) => {
    const v = c.valor;
    if (Math.abs(v) < 1e-12) return;
    const sinal = v >= 0 ? '+' : '-';
    const mag = n(Math.abs(v), 3);
    let simbolo = '';
    if (c.tipo === 'linear') simbolo = `x_{${c.i + 1}}`;
    else if (c.tipo === 'quadratico') simbolo = `x_{${c.i + 1}}^{2}`;
    else if (c.tipo === 'interacao') simbolo = `x_{${c.i + 1}}x_{${c.j + 1}}`;
    termos.push(termos.length === 0 && c.tipo === 'intercepto'
      ? mag
      : `${sinal} ${mag}${simbolo ? `\\,${simbolo}` : ''}`);
  });

  const legenda = meta.fatores.map((f, i) =>
    `$x_{${i + 1}}$: ${escaparLatex(f.nome)}${f.unidade ? ` (${escaparLatex(f.unidade)})` : ''}, ` +
    `codificada de $-1$ (${n(f.min, f.casasDecimais ?? 2)}) a $+1$ (${n(f.max, f.casasDecimais ?? 2)})`
  ).join('; ');

  return [
    '\\begin{equation}',
    `\t\\hat{y} = ${termos.join(' ')}`,
    '\t\\label{eq:modelo}',
    '\\end{equation}',
    '',
    `\\noindent onde $\\hat{y}$ é ${escaparLatex(meta.resposta.nome)}` +
    `${meta.resposta.unidade ? ` em ${escaparLatex(meta.resposta.unidade)}` : ''}, e ${legenda}.`,
    k > 2 ? '' : '',
  ].filter(Boolean).join('\n');
}

/** Parágrafo com a conclusão, pronto para adaptar no relatório. */
export function paragrafoConclusao(analise) {
  const { meta, otimo, anova: a } = analise;
  const f = meta.fatores;
  const cond = f.map((x, j) =>
    `${escaparLatex(x.nome)} de ${n(otimo.recomendado.reais[j], x.casasDecimais ?? 2)}${x.unidade ? `\\,${escaparLatex(x.unidade)}` : ''}`
  ).join(', ');

  const partes = [
    `O ajuste do modelo quadrático explicou ${n(a.r2 * 100, 2)}\\% da variação observada` +
    (a.temErroPuro ? `, de um máximo explicável de ${n(a.r2Maximo * 100, 2)}\\%` : '') + '.',
  ];
  if (a.temErroPuro && isFinite(a.pFaltaAjuste)) {
    partes.push(a.pFaltaAjuste < 0.05
      ? `O teste de falta de ajuste foi significativo ($p = ${n(a.pFaltaAjuste, 4)}$), indicando que o modelo quadrático não descreve integralmente a superfície na região estudada.`
      : `O teste de falta de ajuste não foi significativo ($p = ${n(a.pFaltaAjuste, 4)}$), de modo que o modelo é adequado dentro da precisão experimental.`);
  }
  partes.push(
    `A análise canônica classificou o ponto estacionário como ${{
      maximo: 'um ponto de máximo', minimo: 'um ponto de mínimo',
      sela: 'um ponto de sela', cume: 'um cume alongado',
    }[otimo.canonica.tipo]}.`
  );
  partes.push(
    `A condição ótima dentro da região experimental corresponde a ${cond}, ` +
    `com ${escaparLatex(meta.resposta.nome)} previsto de ${n(otimo.recomendado.previsto, 3)}` +
    `${meta.resposta.unidade ? `\\,${escaparLatex(meta.resposta.unidade)}` : ''}.`
  );
  if (otimo.recomendado.naBorda) {
    partes.push('O ótimo situa-se na fronteira da região experimental, o que sugere que um novo planejamento deslocado nessa direção poderia alcançar valores superiores.');
  }
  return partes.join(' ');
}

/** Documento completo com todas as peças. */
export function gerarLatex(analise) {
  return [
    '% ================================================================',
    `% Análise de superfície de resposta — ${escaparLatex(analise.meta.experimento.nome)}`,
    `% Gerado automaticamente em ${new Date().toLocaleString('pt-BR')}`,
    '% Pacotes necessários: booktabs, float, array',
    '% ================================================================',
    '',
    '% ---- Matriz de ensaios ----',
    tabelaEnsaios(analise),
    '',
    '% ---- Modelo ajustado ----',
    equacaoModelo(analise),
    '',
    '% ---- Coeficientes ----',
    tabelaCoeficientes(analise),
    '',
    '% ---- ANOVA ----',
    tabelaAnova(analise),
    '',
    '% ---- Parágrafo de conclusão (adapte ao seu texto) ----',
    paragrafoConclusao(analise),
    '',
  ].join('\n');
}

/** Dispara o download do .tex. */
export function baixarLatex(analise, nomeArquivo) {
  const blob = new Blob([gerarLatex(analise)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { formatarP };
