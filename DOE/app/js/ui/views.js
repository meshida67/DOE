/**
 * views.js — geração do HTML de cada tela.
 *
 * Funções puras: recebem estado, devolvem string. Todo o comportamento fica em
 * main.js. A separação mantém as telas fáceis de ler e garante que qualquer
 * texto vindo do usuário passe por `esc` antes de virar HTML.
 *
 * Regra de linguagem: nada de "matriz de planejamento", "codificado", "alfa",
 * "Hessiana" ou "mínimos quadrados" nas telas do fluxo principal. Esses termos
 * só aparecem na aba "Detalhes técnicos", que é opcional e existe para quem
 * precisa escrever o relatório.
 */

import { formatarP } from '../core/anova.js';

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const numBR = (v, casas = 3) => {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const a = Math.abs(v);
  const c = a >= 1000 ? 1 : a >= 100 ? 2 : casas;
  return Number(v.toFixed(c)).toLocaleString('pt-BR');
};

const unidade = (u) => (u ? ` <span class="un">${esc(u)}</span>` : '');

/**
 * Casas decimais coerentes com a incerteza da estimativa: anunciar
 * "79,395 %" quando a margem é ±0,5 promete uma precisão que não existe.
 */
const casasPorIncerteza = (erroPadrao) => {
  if (!isFinite(erroPadrao) || erroPadrao <= 0) return 2;
  return Math.max(0, Math.min(4, Math.ceil(-Math.log10(erroPadrao)) + 1));
};

const ICONES = { erro: '✕', atencao: '!', aviso: '!', bom: '✓', info: 'i', neutro: 'i', ruim: '✕' };
const CLASSES = { erro: 'erro', atencao: 'atencao', aviso: 'atencao', bom: 'bom', info: 'info', neutro: 'info', ruim: 'erro' };

export function caixaAviso(nivel, texto, titulo = '') {
  return `<div class="aviso aviso-${CLASSES[nivel] || 'info'}">
    <span class="ico" aria-hidden="true">${ICONES[nivel] || 'i'}</span>
    <div>${titulo ? `<strong>${esc(titulo)}</strong><br>` : ''}${esc(texto)}</div>
  </div>`;
}

export function listaErros(erros, titulo = 'Corrija os pontos abaixo:') {
  if (!erros?.length) return '';
  return `<div class="aviso aviso-erro">
    <span class="ico" aria-hidden="true">✕</span>
    <div><strong>${esc(titulo)}</strong>
      <ul>${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
    </div>
  </div>`;
}

export function passos(atual) {
  const lista = [
    ['definir', 'Descrever o experimento'],
    ['plano', 'Receber os ensaios'],
    ['analise', 'Ver o resultado'],
  ];
  const ordem = lista.map((p) => p[0]);
  const i = ordem.indexOf(atual);
  return `<nav class="passos" aria-label="Etapas">${lista.map(([id, rotulo], j) => {
    const cls = j === i ? 'ativo' : j < i ? 'feito' : '';
    return `<span class="passo ${cls}"><span class="n">${j < i ? '✓' : j + 1}</span>${esc(rotulo)}</span>`;
  }).join('')}</nav>`;
}

// ── tela inicial ─────────────────────────────────────────────────────────

export function telaInicio() {
  return `
  <div class="cartao" style="text-align:center;padding:2.5rem 1.5rem">
    <h1>Planejamento e otimização de experimentos</h1>
    <p class="secundario" style="max-width:62ch;margin:0 auto 0">
      Diga quais condições você consegue controlar e o que quer medir. A ferramenta monta a
      lista de ensaios, e depois dos experimentos encontra a melhor condição para você.
      Não é preciso saber estatística.
    </p>
  </div>

  <div class="escolhas">
    <button class="escolha" data-ir="definir">
      <span class="ico" aria-hidden="true">🧪</span>
      <h3>Começar um experimento novo</h3>
      <p>Você informa o que quer estudar e recebe uma planilha com os ensaios a realizar.</p>
    </button>
    <button class="escolha" data-abrir-arquivo="analise">
      <span class="ico" aria-hidden="true">📊</span>
      <h3>Já fiz os ensaios</h3>
      <p>Envie a planilha preenchida com os resultados e receba a condição ótima e os gráficos.</p>
    </button>
  </div>

  <div class="cartao" style="margin-top:1.25rem">
    <h3>Prefere trabalhar pelo Excel?</h3>
    <p class="secundario pequeno" style="margin-bottom:1rem">
      Baixe o modelo, preencha com calma no seu computador e envie de volta aqui.
      É o mesmo fluxo — só muda onde você digita.
    </p>
    <div class="acoes" style="margin-top:0">
      <button class="btn" data-baixar-modelo>⬇ Baixar modelo de Excel</button>
      <button class="btn btn-fantasma" data-abrir-arquivo="qualquer">Enviar uma planilha</button>
    </div>
  </div>`;
}

// ── tela de definição ────────────────────────────────────────────────────

const linhaFator = (f = {}, i = 0, removivel = true) => `
  <tr data-linha-fator="${i}">
    <td><input type="text" data-campo="nome" value="${esc(f.nome || '')}" placeholder="Ex.: Temperatura" aria-label="Nome do fator ${i + 1}"></td>
    <td><input type="text" data-campo="unidade" value="${esc(f.unidade || '')}" placeholder="°C" aria-label="Unidade do fator ${i + 1}"></td>
    <td><input type="number" step="any" data-campo="min" value="${f.min ?? ''}" placeholder="40" aria-label="Menor valor do fator ${i + 1}"></td>
    <td><input type="number" step="any" data-campo="max" value="${f.max ?? ''}" placeholder="60" aria-label="Maior valor do fator ${i + 1}"></td>
    <td>${removivel ? `<button class="btn btn-fantasma btn-pequeno" data-remover-fator="${i}" aria-label="Remover fator ${i + 1}">✕</button>` : ''}</td>
  </tr>`;

export function telaDefinir(estado) {
  const s = estado.spec || {};
  const exp = s.experimento || {};
  const resp = s.resposta || {};
  const cfg = s.config || {};
  const fatores = s.fatores?.length ? s.fatores : [{}, {}];

  return `
  ${passos('definir')}
  ${listaErros(estado.erros)}
  ${(estado.avisos || []).map((a) => caixaAviso('atencao', a)).join('')}

  <div class="cartao">
    <div class="cartao-titulo"><h2>1. O que você quer descobrir?</h2></div>
    <div class="grade-2">
      <div class="campo">
        <label for="exp-nome">Nome do experimento</label>
        <input type="text" id="exp-nome" value="${esc(exp.nome || '')}" placeholder="Ex.: Otimização da síntese do éster">
      </div>
      <div class="campo">
        <label for="exp-grupo">Grupo</label>
        <input type="text" id="exp-grupo" value="${esc(exp.grupo || '')}" placeholder="Ex.: 3">
      </div>
    </div>
    <div class="grade-2">
      <div class="campo">
        <label for="resp-nome">O que você vai medir?</label>
        <input type="text" id="resp-nome" value="${esc(resp.nome || '')}" placeholder="Ex.: Rendimento">
        <div class="ajuda">A grandeza que você quer melhorar.</div>
      </div>
      <div class="campo">
        <label for="resp-unidade">Unidade</label>
        <input type="text" id="resp-unidade" value="${esc(resp.unidade || '')}" placeholder="Ex.: %">
      </div>
    </div>
    <div class="grade-2">
      <div class="campo">
        <label for="resp-objetivo">Você quer que esse valor seja…</label>
        <select id="resp-objetivo">
          <option value="maximizar" ${resp.objetivo !== 'minimizar' && resp.objetivo !== 'alvo' ? 'selected' : ''}>o maior possível</option>
          <option value="minimizar" ${resp.objetivo === 'minimizar' ? 'selected' : ''}>o menor possível</option>
          <option value="alvo" ${resp.objetivo === 'alvo' ? 'selected' : ''}>o mais perto de um valor específico</option>
        </select>
      </div>
      <div class="campo ${resp.objetivo === 'alvo' ? '' : 'oculto'}" id="campo-alvo">
        <label for="resp-alvo">Valor desejado</label>
        <input type="number" step="any" id="resp-alvo" value="${resp.alvo ?? ''}">
      </div>
    </div>
  </div>

  <div class="cartao">
    <div class="cartao-titulo"><h2>2. O que você consegue controlar?</h2></div>
    <p class="secundario pequeno">
      Liste de 2 a 4 condições que você ajusta no laboratório e, para cada uma, a menor e a maior
      que consegue usar na prática. <strong>Os ensaios vão cobrir toda essa faixa</strong>, então
      informe limites que sejam seguros e executáveis.
    </p>
    <table class="tabela-fatores">
      <thead><tr><th>O que você controla</th><th>Unidade</th><th>Menor valor</th><th>Maior valor</th><th></th></tr></thead>
      <tbody id="corpo-fatores">
        ${fatores.map((f, i) => linhaFator(f, i, fatores.length > 2)).join('')}
      </tbody>
    </table>
    <div class="acoes" style="margin-top:.9rem">
      <button class="btn btn-pequeno" id="add-fator">+ Adicionar outra condição</button>
    </div>

    <details class="avancado" ${estado.avancadoAberto ? 'open' : ''}>
      <summary>Opções avançadas — já estão nos valores recomendados</summary>
      <div class="avancado-corpo grade-2">
        <div class="campo">
          <label for="cfg-centrais">Repetições do ensaio central</label>
          <input type="number" min="1" max="10" id="cfg-centrais" value="${cfg.pontosCentrais ?? 3}">
          <div class="ajuda">Repetir o ensaio do meio da faixa é o que permite medir o erro do próprio experimento. Recomendado: 3.</div>
        </div>
        <div class="campo">
          <label for="cfg-alpha">Como distribuir os ensaios</label>
          <select id="cfg-alpha">
            <option value="face" ${(cfg.tipoAlpha ?? 'face') === 'face' ? 'selected' : ''}>Dentro dos meus limites (recomendado)</option>
            <option value="rotacionavel" ${cfg.tipoAlpha === 'rotacionavel' ? 'selected' : ''}>Distribuição mais uniforme</option>
            <option value="ortogonal" ${cfg.tipoAlpha === 'ortogonal' ? 'selected' : ''}>Efeitos mais independentes</option>
          </select>
          <div class="ajuda">Todas as opções respeitam os limites informados. Na dúvida, deixe a primeira.</div>
        </div>
      </div>
    </details>
  </div>

  <div class="acoes">
    <button class="btn btn-fantasma" data-ir="inicio">← Voltar</button>
    <button class="btn btn-primario acoes-fim" id="gerar-plano">Gerar meus ensaios →</button>
  </div>`;
}

// ── tela do planejamento ─────────────────────────────────────────────────

export function telaPlano(estado) {
  const { meta, ensaios, diagnostico } = estado;
  const f = meta.fatores;
  const emOrdem = [...ensaios].sort((a, b) => a.ordemExecucao - b.ordemExecucao);
  const nomeTipo = { fatorial: 'Vértice', axial: 'Eixo', central: 'Centro (repetição)' };

  return `
  ${passos('plano')}

  <div class="destaque">
    <div class="destaque-rotulo">Seu planejamento está pronto</div>
    <div class="heroi">${diagnostico.totalEnsaios}<span class="un">ensaios</span></div>
    <div class="heroi-nota">
      Para estudar ${f.length} condições e encontrar a melhor combinação de
      <strong>${esc(meta.resposta.nome)}</strong>, realize os ensaios abaixo
      <strong>na ordem indicada</strong>.
    </div>
    <div class="acoes">
      <button class="btn btn-primario" data-baixar-ensaios>⬇ Baixar planilha dos ensaios</button>
      <button class="btn btn-fantasma" data-ir="definir">← Ajustar o experimento</button>
    </div>
  </div>

  ${(diagnostico.avisos || []).map((a) => caixaAviso(a.nivel, a.texto)).join('')}

  ${caixaAviso('info', 'A ordem está embaralhada de propósito: executar em ordem sorteada evita que variações ao longo do dia (temperatura da sala, reagente envelhecendo) sejam confundidas com o efeito das condições estudadas.')}

  <div class="cartao">
    <div class="cartao-titulo"><h2>Ensaios a realizar</h2></div>
    <div class="tabela-envolve">
      <table class="dados">
        <thead><tr>
          <th>Ordem</th><th>Ensaio</th>
          ${f.map((x) => `<th>${esc(x.nome)}${x.unidade ? ` (${esc(x.unidade)})` : ''}</th>`).join('')}
          <th>Tipo</th>
        </tr></thead>
        <tbody>
          ${emOrdem.map((e) => `<tr>
            <td class="texto"><strong>${e.ordemExecucao}</strong></td>
            <td class="texto">${esc(e.id)}</td>
            ${e.reais.map((v, j) => `<td>${numBR(v, f[j].casasDecimais ?? 2)}</td>`).join('')}
            <td class="texto"><span class="marcador">${nomeTipo[e.tipo] || e.tipo}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="legenda-grafico">
      Os ensaios marcados como <strong>Centro (repetição)</strong> usam os mesmos valores de propósito.
      Faça todos — são eles que medem a precisão do seu experimento.
    </p>
  </div>

  <div class="cartao">
    <h3>E depois?</h3>
    <ol class="secundario" style="margin:0;padding-left:1.2rem">
      <li>Baixe a planilha e realize os ensaios na ordem indicada.</li>
      <li>Anote cada resultado na coluna <strong>${esc(meta.resposta.nome)}</strong> da planilha.</li>
      <li>Volte aqui e envie a planilha preenchida — a análise é automática.</li>
    </ol>
    <div class="acoes">
      <button class="btn" data-abrir-arquivo="analise">Já tenho os resultados — enviar planilha</button>
    </div>
  </div>`;
}

// ── tela de resultados ───────────────────────────────────────────────────

function tabelaAnovaHTML(a) {
  const linha = (nome, sq, gl, qm, f, p, classe = '') => `<tr class="${classe}">
    <td class="texto">${nome}</td><td>${numBR(sq)}</td><td>${gl}</td>
    <td>${numBR(qm)}</td><td>${f !== null ? numBR(f, 2) : ''}</td><td>${p !== null ? esc(formatarP(p)) : ''}</td></tr>`;

  return `<div class="tabela-envolve"><table class="dados">
    <thead><tr><th>Fonte de variação</th><th>Soma quadrática</th><th>G.L.</th><th>Média quadrática</th><th>F</th><th>p</th></tr></thead>
    <tbody>
      ${linha('Regressão', a.sqRegressao, a.glRegressao, a.qmRegressao, a.fRegressao, a.pRegressao)}
      ${linha('Resíduos', a.sqResiduo, a.glResiduo, a.qmResiduo, null, null)}
      ${a.temErroPuro ? linha('&nbsp;&nbsp;Falta de ajuste', a.sqFaltaAjuste, a.glFaltaAjuste, a.qmFaltaAjuste, a.fFaltaAjuste, a.pFaltaAjuste) : ''}
      ${a.temErroPuro ? linha('&nbsp;&nbsp;Erro puro', a.sqErroPuro, a.glErroPuro, a.qmErroPuro, null, null) : ''}
      ${linha('Total', a.sqTotal, a.glTotal, a.qmTotal, null, null)}
    </tbody>
  </table></div>`;
}

export function telaAnalise(estado) {
  const an = estado.analise;
  const { meta, anova: a, leitura, otimo, ensaios, ajuste } = an;
  const f = meta.fatores;
  const r = meta.resposta;
  const objetivo = r.objetivo === 'minimizar' ? 'o menor valor'
    : r.objetivo === 'alvo' ? `o valor mais próximo de ${numBR(r.alvo)}` : 'o maior valor';

  const melhorFeito = [...ensaios].sort((x, y) =>
    r.objetivo === 'minimizar' ? x.resposta - y.resposta
      : r.objetivo === 'alvo' ? Math.abs(x.resposta - r.alvo) - Math.abs(y.resposta - r.alvo)
      : y.resposta - x.resposta)[0];
  const ganho = otimo.recomendado.previsto - melhorFeito.resposta;
  const casasResposta = casasPorIncerteza(otimo.recomendado.erroPadrao);

  const nomeTipo = { fatorial: 'Vértice', axial: 'Eixo', central: 'Centro', desconhecido: '—' };
  const tipoSuperficie = { maximo: 'Pico bem definido', minimo: 'Vale bem definido', sela: 'Ponto de sela', cume: 'Cume alongado' };

  return `
  ${passos('analise')}

  <div class="destaque">
    <div class="destaque-rotulo">Condição recomendada — para obter ${esc(objetivo)} de ${esc(r.nome)}</div>
    <div class="heroi">${numBR(otimo.recomendado.previsto, casasResposta)}${unidade(r.unidade)}</div>
    <div class="heroi-nota">
      ${esc(r.nome)} previsto nessa condição${isFinite(otimo.recomendado.erroPadrao)
        ? `, com margem aproximada de <strong>± ${numBR(2 * otimo.recomendado.erroPadrao, casasResposta)}</strong>`
        : ''}.
      ${isFinite(ganho) && ganho > 0 ? `São <strong>${numBR(ganho, casasResposta)}${r.unidade ? ` ${esc(r.unidade)}` : ''}</strong> a mais que o melhor ensaio já realizado.` : ''}
    </div>
    <div class="receita">
      ${f.map((x, j) => `<div class="receita-item">
        <div class="nome">${esc(x.nome)}</div>
        <div class="valor">${numBR(otimo.recomendado.reais[j], x.casasDecimais ?? 2)}${unidade(x.unidade)}</div>
      </div>`).join('')}
    </div>
    <div class="acoes">
      <button class="btn btn-primario" data-baixar-resultados>⬇ Baixar planilha de resultados</button>
      <button class="btn" data-baixar-latex>⬇ Tabelas em LaTeX</button>
      <button class="btn btn-fantasma" data-ir="inicio">Novo experimento</button>
    </div>
  </div>

  ${leitura.mensagens.map((m) => caixaAviso(m.nivel, m.texto)).join('')}
  ${otimo.avisos.map((x) => caixaAviso(x.nivel, x.texto)).join('')}
  ${an.ignorados > 0 ? caixaAviso('info', `${an.ignorados} ensaio(s) sem resultado foram desconsiderados.`) : ''}

  <div class="abas" role="tablist">
    <button class="aba ativa" data-aba="superficie" role="tab">Mapa do experimento</button>
    <button class="aba" data-aba="efeitos" role="tab">O que mais influencia</button>
    <button class="aba" data-aba="qualidade" role="tab">Confiabilidade</button>
    <button class="aba" data-aba="ensaios" role="tab">Seus ensaios</button>
    <button class="aba" data-aba="tecnico" role="tab">Detalhes técnicos</button>
  </div>

  <section data-painel="superficie">
    <div class="cartao">
      <div class="cartao-titulo"><h2>Mapa do experimento</h2></div>
      <p class="secundario pequeno">
        As cores mostram o valor previsto de ${esc(r.nome)} em cada combinação. Os círculos são os
        ensaios que você fez; o círculo laranja marca a condição recomendada.
        Passe o cursor sobre o mapa para ler qualquer ponto.
      </p>
      ${f.length > 2 ? `<div class="viz-controles">
        <div class="campo"><label for="eixo-x">Eixo horizontal</label>
          <select id="eixo-x">${f.map((x, j) => `<option value="${j}" ${j === 0 ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label for="eixo-y">Eixo vertical</label>
          <select id="eixo-y">${f.map((x, j) => `<option value="${j}" ${j === 1 ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="campo" style="flex:1"><div class="ajuda" id="nota-fixos"></div></div>
      </div>` : ''}
      <div class="grafico-rolagem"><div id="graf-superficie"></div></div>
    </div>
  </section>

  <section data-painel="efeitos" class="oculto">
    <div class="cartao">
      <div class="cartao-titulo"><h2>O que mais influencia o resultado</h2></div>
      <p class="secundario pequeno">
        Barras para a direita aumentam ${esc(r.nome)}; para a esquerda, diminuem. A linha fina sobre
        cada barra é a faixa de incerteza: <strong>quando ela cruza o zero, o efeito pode ser apenas
        ruído do experimento</strong> e não deve orientar decisões.
      </p>
      <div class="grafico-rolagem"><div id="graf-efeitos"></div></div>
    </div>
  </section>

  <section data-painel="qualidade" class="oculto">
    <div class="grade-2">
      <div class="cartao">
        <div class="cartao-titulo"><h3>O modelo acerta seus ensaios?</h3></div>
        <p class="secundario pequeno">Cada ponto é um ensaio. Quanto mais perto da linha diagonal, melhor o modelo reproduz o que você mediu.</p>
        <div class="grafico-rolagem"><div id="graf-obsprev"></div></div>
      </div>
      <div class="cartao">
        <div class="cartao-titulo"><h3>Houve deriva ao longo do dia?</h3></div>
        <p class="secundario pequeno">Diferenças espalhadas sem padrão são boas. Uma tendência clara sugere que algo mudou durante a execução.</p>
        <div class="grafico-rolagem"><div id="graf-residuos"></div></div>
      </div>
    </div>
    <div class="cartao">
      <div class="cartao-titulo"><h3>Análise de variância</h3></div>
      ${tabelaAnovaHTML(a)}
      <p class="legenda-grafico">
        O modelo explica <strong>${numBR(a.r2 * 100, 1)}%</strong> da variação observada${a.temErroPuro
          ? `, de um máximo possível de <strong>${numBR(a.r2Maximo * 100, 1)}%</strong> — o restante é o ruído do próprio experimento`
          : ''}.
      </p>
    </div>
  </section>

  <section data-painel="ensaios" class="oculto">
    <div class="cartao">
      <div class="cartao-titulo"><h2>Seus ensaios</h2></div>
      <div class="tabela-envolve">
        <table class="dados">
          <thead><tr>
            <th>Ordem</th><th>Ensaio</th><th>Tipo</th>
            ${f.map((x) => `<th>${esc(x.nome)}${x.unidade ? ` (${esc(x.unidade)})` : ''}</th>`).join('')}
            <th>Medido</th><th>Previsto</th><th>Diferença</th>
          </tr></thead>
          <tbody>
            ${[...ensaios].sort((x, y) => x.ordemExecucao - y.ordemExecucao).map((e) => `<tr>
              <td class="texto">${e.ordemExecucao}</td>
              <td class="texto">${esc(e.id)}</td>
              <td class="texto"><span class="marcador">${nomeTipo[e.tipo] || esc(e.tipo)}</span></td>
              ${e.reais.map((v, j) => `<td>${numBR(v, f[j].casasDecimais ?? 2)}</td>`).join('')}
              <td><strong>${numBR(e.resposta)}</strong></td>
              <td>${numBR(e.previsto)}</td>
              <td>${numBR(e.residuo)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section data-painel="tecnico" class="oculto">
    <div class="cartao">
      <div class="cartao-titulo"><h2>Detalhes técnicos</h2></div>
      <p class="secundario pequeno">Esta aba existe para o relatório. Nada aqui é necessário para usar a ferramenta.</p>

      <h3 style="margin-top:1.25rem">Coeficientes do modelo quadrático</h3>
      <p class="secundario pequeno">Em variáveis codificadas, com a região experimental mapeada em [−1, +1].</p>
      <div class="tabela-envolve"><table class="dados">
        <thead><tr><th>Termo</th><th>Significado</th><th>Coeficiente</th><th>Erro padrão</th><th>t</th><th>p</th></tr></thead>
        <tbody>${ajuste.coeficientes.map((c) => `<tr>
          <td class="texto mono">${esc(c.rotulo)}</td>
          <td class="texto">${esc(c.descricao)}</td>
          <td>${numBR(c.valor, 4)}</td>
          <td>${numBR(c.erroPadrao, 4)}</td>
          <td>${numBR(c.t, 2)}</td>
          <td>${esc(formatarP(c.pValor))}</td>
        </tr>`).join('')}</tbody>
      </table></div>

      <h3 style="margin-top:1.5rem">Análise canônica</h3>
      <div class="tabela-envolve"><table class="dados">
        <thead><tr><th>Item</th><th>Valor</th></tr></thead>
        <tbody>
          <tr><td class="texto">Classificação da superfície</td><td class="texto">${esc(tipoSuperficie[otimo.canonica.tipo] || otimo.canonica.tipo)}</td></tr>
          <tr><td class="texto">Autovalores de B</td><td class="texto mono">${otimo.canonica.autovalores.map((v) => numBR(v, 4)).join(' ; ')}</td></tr>
          ${otimo.estacionario ? `
          <tr><td class="texto">Ponto estacionário (codificado)</td><td class="texto mono">${otimo.estacionario.codificados.map((v) => numBR(v, 4)).join(' ; ')}</td></tr>
          <tr><td class="texto">Ponto estacionário (real)</td><td class="texto mono">${otimo.estacionario.reais.map((v, j) => `${numBR(v, f[j].casasDecimais ?? 2)} ${esc(f[j].unidade || '')}`).join(' ; ')}</td></tr>
          <tr><td class="texto">Dentro da região experimental</td><td class="texto">${otimo.estacionario.dentroDaRegiao ? 'sim' : 'não'}</td></tr>` : ''}
        </tbody>
      </table></div>

      <h3 style="margin-top:1.5rem">Planejamento</h3>
      <div class="tabela-envolve"><table class="dados">
        <thead><tr><th>Item</th><th>Valor</th></tr></thead>
        <tbody>
          <tr><td class="texto">Tipo</td><td class="texto">Composto central (CCD)</td></tr>
          <tr><td class="texto">Número de fatores (k)</td><td>${f.length}</td></tr>
          <tr><td class="texto">Distância axial α</td><td>${numBR(meta.config.alpha, 4)}</td></tr>
          <tr><td class="texto">Interpretação dos limites</td><td class="texto">${meta.config.limitMode === 'fatorial' ? 'níveis ±1 (axiais extrapolam)' : 'limites absolutos (nada fora da faixa)'}</td></tr>
          <tr><td class="texto">Ensaios analisados</td><td>${ensaios.length}</td></tr>
          <tr><td class="texto">Coeficientes estimados</td><td>${ajuste.coeficientes.length}</td></tr>
          <tr><td class="texto">Graus de liberdade do resíduo</td><td>${a.glResiduo}</td></tr>
          ${a.temErroPuro ? `<tr><td class="texto">Desvio padrão experimental</td><td>${numBR(a.desvioPadraoExperimental, 4)}</td></tr>` : ''}
        </tbody>
      </table></div>

      ${otimo.caminho ? `
      <h3 style="margin-top:1.5rem">Caminho de máxima inclinação</h3>
      <p class="secundario pequeno">Direção sugerida para centrar um próximo planejamento. Extrapola o modelo — use apenas para escolher onde explorar em seguida.</p>
      <div class="tabela-envolve"><table class="dados">
        <thead><tr><th>Passo</th>${f.map((x) => `<th>${esc(x.nome)}</th>`).join('')}<th>${esc(r.nome)} previsto</th></tr></thead>
        <tbody>${otimo.caminho.pontos.map((p) => `<tr>
          <td class="texto">${p.passo}</td>
          ${p.reais.map((v, j) => `<td>${numBR(v, f[j].casasDecimais ?? 2)}</td>`).join('')}
          <td>${numBR(p.previsto, 2)}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : ''}
    </div>
  </section>`;
}
