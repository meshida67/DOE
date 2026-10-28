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
import { resolverAlpha, numeroParametros, MIN_FATORES, MAX_FATORES } from '../core/design.js';

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

/** Ícones de traço (24×24), herdam a cor do texto via `currentColor`. */
const TRACOS = {
  frasco: 'M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9',
  enviar: 'M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  baixar: 'M12 4v12M7 11l5 5 5-5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  seta: 'M5 12h14M13 6l6 6-6 6',
  lista: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  grafico: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  alvo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  estrela: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  pulso: 'M3 12h4l3-8 4 16 3-8h4',
  mapa: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  camadas: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  escudo: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  relogio: 'M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9',
  barras: 'M4 6h10M4 12h16M4 18h7',
  dispersao: 'M3 3v18h18M8 15h.01M12 10h.01M16 13h.01M18 7h.01',
};

export const icone = (nome) =>
  `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${TRACOS[nome] || ''}"/></svg>`;

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

/**
 * @param {object|null} rascunho  o que `main.js` guardou no navegador
 *   ({ salvoEm, meta, ensaios, temAnalise }), ou null se não houver nada.
 */
export function telaInicio(rascunho = null) {
  const etapas = [
    ['Descrever', 'O que você controla e o que vai medir.'],
    ['Receber os ensaios', 'Uma planilha com a ordem de execução.'],
    ['Medir', 'Realize os ensaios e anote cada resultado.'],
    ['Ver o resultado', 'A melhor condição e os gráficos.'],
  ];

  const painelRascunho = rascunho
    ? (() => {
      const m = rascunho.meta;
      const total = rascunho.ensaios.length;
      const medidos = rascunho.ensaios.filter((e) => e.resposta !== null && e.resposta !== undefined && e.resposta !== '').length;
      return `
      <section class="painel">
        <div class="painel-cab"><span class="painel-rotulo">${icone('relogio')}Experimento em andamento</span></div>
        <h2 style="margin-bottom:.8rem">${esc(m.experimento?.nome || 'Sem nome')}</h2>
        <ul class="lista-info">
          <li><span>Mede</span><span>${esc(m.resposta?.nome || '—')}</span></li>
          <li><span>Condições</span><span>${esc(m.fatores.map((x) => x.nome).join(', '))}</span></li>
          <li><span>Ensaios com resultado</span><span>${medidos} de ${total}</span></li>
          <li><span>Salvo em</span><span>${esc(new Date(rascunho.salvoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}</span></li>
        </ul>
        <div class="acoes"><button class="btn btn-primario btn-bloco" data-retomar>Continuar de onde parei ${icone('seta')}</button></div>
      </section>`;
    })()
    : `
      <section class="painel">
        <div class="painel-cab"><span class="painel-rotulo">${icone('relogio')}Experimento em andamento</span></div>
        <p class="secundario pequeno" style="margin:0">
          Nenhum por enquanto. Quando você gerar um planejamento, ele fica guardado neste navegador
          e aparece aqui para continuar depois.
        </p>
      </section>`;

  return `
  <header class="cabecalho-pagina">
    <div>
      <h1>Planejamento de experimentos</h1>
      <p>Me diga o que você controla no laboratório e o que quer medir. Eu monto os ensaios e, quando você trouxer os resultados, encontro a melhor combinação. Não precisa saber estatística.</p>
    </div>
    <div class="cabecalho-acoes">
      <button class="btn" data-baixar-modelo>${icone('baixar')}Modelo de Excel</button>
      <button class="btn btn-primario" data-ir="definir">Novo experimento</button>
    </div>
  </header>

  <div class="kpis" aria-label="Como funciona">
    ${etapas.map(([titulo, texto], i) => `
    <div class="kpi">
      <div class="kpi-rotulo"><span class="etapa-num">${i + 1}</span>Etapa ${i + 1}</div>
      <div class="etapa-titulo">${titulo}</div>
      <div class="kpi-nota">${texto}</div>
    </div>`).join('')}
  </div>

  <div class="dash-grade">
    <section class="painel">
      <div class="painel-cab">
        <h2>Por onde começar</h2>
      </div>
      <div class="acoes-inicio">
        <button class="acao" data-ir="definir">
          <span class="acao-ico">${icone('frasco')}</span>
          <h3>Começar um experimento novo</h3>
          <p>Você me manda as variáveis e os limites de cada uma, e eu devolvo a lista de ensaios na ordem de fazer.</p>
          <span class="acao-link">Descrever experimento ${icone('seta')}</span>
        </button>
        <button class="acao acao-solta" data-abrir-arquivo="analise">
          <span class="acao-ico">${icone('enviar')}</span>
          <h3>Já fiz os ensaios</h3>
          <p>Você me manda a planilha com os resultados anotados, e eu devolvo a melhor combinação e os gráficos. Também vale arrastar o arquivo para a página.</p>
          <span class="acao-link">Escolher planilha ${icone('seta')}</span>
        </button>
      </div>
    </section>

    <div class="coluna">
      ${painelRascunho}
      <section class="painel">
        <div class="painel-cab"><span class="painel-rotulo">${icone('lista')}Prefere o Excel?</span></div>
        <p class="secundario pequeno">Baixe o modelo, preencha com calma e envie de volta. É o mesmo caminho — só muda onde você digita.</p>
        <div class="acoes" style="margin-top:.4rem">
          <button class="btn btn-pequeno" data-baixar-modelo>${icone('baixar')}Baixar modelo</button>
          <button class="btn btn-fantasma btn-pequeno" data-abrir-arquivo="qualquer">Enviar planilha</button>
        </div>
      </section>
      <section class="painel">
        <div class="painel-cab"><span class="painel-rotulo">${icone('escudo')}Seus dados ficam com você</span></div>
        <p class="secundario pequeno" style="margin:0">Todos os cálculos rodam neste navegador. Nenhuma planilha é enviada para servidor algum.</p>
      </section>
    </div>
  </div>`;
}

// ── tela de definição ────────────────────────────────────────────────────

const OPCOES_DISTRIBUICAO = [
  ['face', 'Dentro dos meus limites', 'Ensaios nos cantos, no meio de cada lado e no centro. A mais simples de executar.'],
  ['rotacionavel', 'Distribuição mais uniforme', 'Todos os ensaios à mesma distância do centro: a previsão é igualmente confiável em qualquer direção.'],
  ['ortogonal', 'Efeitos mais independentes', 'Posiciona os ensaios dos eixos para que o efeito de uma variável não se misture com o das outras.'],
];

/**
 * Desenho ilustrativo (2 variáveis) de onde caem os ensaios de cada
 * distribuição. Os limites informados são a caixa clara; como o ensaio mais
 * extremo sempre cai sobre o limite, com distribuições além da "face" os
 * cantos recuam para dentro e surge o quadrado girado dos eixos.
 */
export function desenhoDistribuicao(tipo, pontosCentrais = 3) {
  let alpha = 1;
  try { alpha = resolverAlpha(tipo, 2, Math.max(1, Number(pontosCentrais) || 1)); } catch { /* mantém 1 */ }
  const T = 132, m = 16, meio = T / 2, raio = meio - m;
  const u = raio / Math.max(alpha, 1);
  const c = u;             // canto (±1)
  const e = alpha * u;     // eixo (±α), no limite
  const girado = alpha > 1 + 1e-9;
  const p = (x, y, cls) => `<circle cx="${meio + x}" cy="${meio - y}" r="4.5" class="${cls}"/>`;
  return `<svg viewBox="0 0 ${T} ${T}" role="img" aria-label="Posição ilustrativa dos ensaios">
    <rect x="${m}" y="${m}" width="${2 * raio}" height="${2 * raio}" rx="3" class="dist-limite"/>
    ${tipo === 'rotacionavel' ? `<circle cx="${meio}" cy="${meio}" r="${e}" class="dist-circulo"/>` : ''}
    <rect x="${meio - c}" y="${meio - c}" width="${2 * c}" height="${2 * c}" class="dist-quadrado"/>
    ${girado ? `<polygon points="${meio},${meio - e} ${meio + e},${meio} ${meio},${meio + e} ${meio - e},${meio}" class="dist-girado"/>` : ''}
    ${[[-c, -c], [c, -c], [-c, c], [c, c]].map(([x, y]) => p(x, y, 'dist-p-canto')).join('')}
    ${[[-e, 0], [e, 0], [0, -e], [0, e]].map(([x, y]) => p(x, y, 'dist-p-eixo')).join('')}
    ${p(0, 0, 'dist-p-centro')}
  </svg>`;
}

const linhaFator = (f = {}, i = 0, removivel = true) => `
  <tr data-linha-fator="${i}">
    <td><input type="text" data-campo="nome" value="${esc(f.nome || '')}" placeholder="Ex.: Temperatura" aria-label="Nome da variável ${i + 1}"></td>
    <td><input type="text" data-campo="unidade" value="${esc(f.unidade || '')}" placeholder="°C" aria-label="Unidade da variável ${i + 1}"></td>
    <td><input type="number" step="any" data-campo="min" value="${f.min ?? ''}" placeholder="40" aria-label="Menor valor da variável ${i + 1}"></td>
    <td><input type="number" step="any" data-campo="max" value="${f.max ?? ''}" placeholder="60" aria-label="Maior valor da variável ${i + 1}"></td>
    <td>${removivel ? `<button class="btn btn-fantasma btn-pequeno" data-remover-fator="${i}" aria-label="Remover variável ${i + 1}">✕</button>` : ''}</td>
  </tr>`;

const OPCOES_MODELO = [
  ['quadratico', 'Curvatura simples', 'Cada variável tem uma subida e uma descida, com um único pico. Serve para quase todo experimento.',
    'M14,64 Q75,6 136,64'],
  ['cubicoReduzido', 'Curvatura em S', 'A resposta pode subir e depois estabilizar, ou mudar de sentido dentro da faixa. Não pede nenhum ensaio a mais.',
    'M14,66 C44,66 46,20 75,20 C104,20 106,46 136,10'],
  ['cubicoCompleto', 'Curvatura em S completa', 'Além do S, o formato da curva de uma variável pode mudar conforme o valor da outra.',
    'M14,66 C44,66 46,20 75,20 C104,20 106,46 136,10'],
];

/**
 * Cartões do formato da curva, com o desenho da forma que cada um consegue
 * descrever e a conta de ensaios/coeficientes para o planejamento atual.
 * Recalculado fora do `telaDefinir` porque o número de variáveis e as
 * repetições do centro mudam esses números enquanto a pessoa digita.
 */
export function cartoesModelo({ k = 2, pontosCentrais = 3, tipoAlpha = 'face', modelo = 'quadratico' } = {}) {
  const kk = Math.min(MAX_FATORES, Math.max(MIN_FATORES, Number(k) || 2));
  const nc = Math.max(1, Number(pontosCentrais) || 1);
  let alpha = 1;
  try { alpha = resolverAlpha(tipoAlpha, kk, nc); } catch { /* mantém 1 */ }

  return OPCOES_MODELO.map(([valor, titulo, texto, curva]) => {
    const extras = valor === 'cubicoCompleto' ? Math.pow(3, kk) - Math.pow(2, kk) - 1 : 0;
    const N = Math.pow(2, kk) + 2 * kk + nc + extras;
    const p = numeroParametros(kk, valor);
    const folga = N - p;

    let impedimento = '';
    if (valor !== 'quadratico' && alpha <= 1 + 1e-9) {
      impedimento = 'Precisa de outra distribuição acima — com os ensaios só nas faces, o S não pode ser calculado.';
    } else if (valor === 'cubicoCompleto' && tipoAlpha === 'ortogonal') {
      impedimento = 'Não funciona com "Efeitos mais independentes".';
    } else if (valor === 'cubicoCompleto' && kk > 3) {
      impedimento = `Com ${kk} variáveis seriam ${extras} ensaios extras — inviável.`;
    } else if (folga < 0) {
      impedimento = 'Ensaios de menos para esse tanto de coeficiente.';
    } else if (folga === 0) {
      impedimento = 'Nenhum ensaio livre: o modelo acerta tudo por construção, mesmo estando errado.';
    }

    return `
    <label class="dist-opcao${impedimento ? ' dist-impedida' : ''}">
      <input type="radio" name="cfg-modelo" value="${valor}" ${modelo === valor ? 'checked' : ''}>
      <span class="dist-desenho">
        <svg viewBox="0 0 150 80" role="img" aria-label="Formato de curva que este modelo descreve">
          <line x1="14" y1="70" x2="136" y2="70" class="curva-eixo"/>
          <line x1="14" y1="70" x2="14" y2="8" class="curva-eixo"/>
          ${valor === 'cubicoCompleto' ? '<path d="M14,52 C44,52 46,68 75,68 C104,68 106,40 136,44" class="curva-2"/>' : ''}
          <path d="${curva}" class="curva-1"/>
        </svg>
      </span>
      <span class="dist-titulo">${titulo}</span>
      <span class="dist-texto">${texto}</span>
      <span class="dist-numeros">
        <span class="pilula">${N} ensaios</span>
        <span class="pilula">${p} coeficientes</span>
        <span class="pilula${folga < 2 ? ' pilula-atencao' : ''}">${folga === 1 ? '1 livre' : `${folga} livres`}</span>
      </span>
      ${extras ? `<span class="dist-extra">${extras} ensaios a mais que os outros dois formatos.</span>` : ''}
      ${impedimento ? `<span class="dist-aviso">${impedimento}</span>` : ''}
    </label>`;
  }).join('');
}

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
      Liste de 2 a 4 variáveis que você ajusta no laboratório e, para cada uma, a menor e a maior
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
      <button class="btn btn-pequeno" id="add-fator">+ Adicionar outra variável</button>
    </div>

    <details class="avancado" ${estado.avancadoAberto ? 'open' : ''}>
      <summary>Opções avançadas — já estão nos valores recomendados</summary>
      <div class="avancado-corpo grade-2">
        <div class="campo">
          <label for="cfg-centrais">Repetições do ensaio central</label>
          <input type="number" min="1" max="10" id="cfg-centrais" value="${cfg.pontosCentrais ?? 3}">
          <div class="ajuda">Repetir o ensaio do meio da faixa é o que permite medir o erro do próprio experimento. Recomendado: 3.</div>
        </div>
        <fieldset class="campo campo-largo distribuicao">
          <legend>Como distribuir os ensaios</legend>
          <div class="dist-opcoes">
            ${OPCOES_DISTRIBUICAO.map(([valor, titulo, texto]) => `
            <label class="dist-opcao">
              <input type="radio" name="cfg-alpha" value="${valor}" ${(cfg.tipoAlpha ?? 'face') === valor ? 'checked' : ''}>
              <span class="dist-desenho" data-desenho="${valor}">${desenhoDistribuicao(valor, cfg.pontosCentrais ?? 3)}</span>
              <span class="dist-titulo">${titulo}</span>
              <span class="dist-texto">${texto}</span>
            </label>`).join('')}
          </div>
          <div class="dist-legenda" aria-hidden="true">
            <span><i class="dist-l-limite"></i>Seus limites</span>
            <span><i class="dist-l-canto"></i>Cantos</span>
            <span><i class="dist-l-eixo"></i>Eixos</span>
            <span><i class="dist-l-centro"></i>Centro</span>
          </div>
          <div class="ajuda">Desenho ilustrativo com 2 variáveis. Todas as opções respeitam os limites informados. Na dúvida, deixe a primeira.</div>
        </fieldset>
        <fieldset class="campo campo-largo distribuicao">
          <legend>Formato da curva</legend>
          <div class="dist-opcoes" id="cartoes-modelo">${cartoesModelo({
            k: fatores.length, pontosCentrais: cfg.pontosCentrais ?? 3,
            tipoAlpha: cfg.tipoAlpha ?? 'face', modelo: cfg.modelo ?? 'quadratico',
          })}</div>
          <div class="ajuda">Cada coeficiente compromete um ensaio para ser calculado. Os <strong>ensaios livres</strong> são os que sobram, e é neles que se vê se o modelo está errado: com zero livre, a curva passa por cima de todos os pontos e acerta 100% até com dados sem sentido. Na dúvida, deixe a primeira opção.</div>
        </fieldset>
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
  const nomeTipo = { fatorial: 'Vértice', axial: 'Eixo', central: 'Centro (repetição)', complementar: 'Face/aresta' };

  return `
  ${passos('plano')}

  <div class="destaque">
    <div class="destaque-rotulo">Seu planejamento está pronto</div>
    <div class="heroi">${diagnostico.totalEnsaios}<span class="un">ensaios</span></div>
    <div class="heroi-nota">
      Para estudar ${f.length} variáveis e encontrar a melhor combinação de
      <strong>${esc(meta.resposta.nome)}</strong>, realize os ensaios abaixo
      <strong>na ordem indicada</strong>.
    </div>
    <div class="acoes">
      <button class="btn btn-primario" data-baixar-ensaios>⬇ Baixar planilha dos ensaios</button>
      <button class="btn btn-fantasma" data-ir="definir">← Voltar às configurações</button>
    </div>
  </div>

  ${(diagnostico.avisos || []).map((a) => caixaAviso(a.nivel, a.texto)).join('')}

  ${caixaAviso('info', 'A ordem está embaralhada de propósito: executar em ordem sorteada evita que variações ao longo do dia (temperatura da sala, reagente envelhecendo) sejam confundidas com o efeito das variáveis estudadas.')}

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

const NOME_MODELO = { quadratico: 'curvatura simples', cubicoReduzido: 'curvatura em S', cubicoCompleto: 'curvatura em S completa' };

/** Leitura da capacidade de previsão em palavras + classe de pílula. */
function leituraPrevisao(r2Predito) {
  if (!isFinite(r2Predito)) return { texto: 'não calculável', classe: '' };
  if (r2Predito >= 0.7) return { texto: 'boa', classe: 'pilula-bom' };
  if (r2Predito >= 0) return { texto: 'fraca', classe: 'pilula-atencao' };
  return { texto: 'pior que a média', classe: 'pilula-ruim' };
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
  const previsto = otimo.recomendado.previsto;
  // "Ganho" no sentido do objetivo: positivo sempre significa "melhor que o melhor ensaio".
  const ganho = r.objetivo === 'minimizar' ? melhorFeito.resposta - previsto
    : r.objetivo === 'alvo' ? Math.abs(melhorFeito.resposta - r.alvo) - Math.abs(previsto - r.alvo)
    : previsto - melhorFeito.resposta;
  const casasResposta = casasPorIncerteza(otimo.recomendado.erroPadrao);
  const un = r.unidade ? ` ${esc(r.unidade)}` : '';

  const nomeTipo = { fatorial: 'Vértice', axial: 'Eixo', central: 'Centro', complementar: 'Face/aresta', desconhecido: '—' };
  const tipoSuperficie = { maximo: 'Pico bem definido', minimo: 'Vale bem definido', sela: 'Ponto de sela', cume: 'Cume alongado' };
  const prev = leituraPrevisao(ajuste.r2Predito);
  const aba = ['ensaios', 'anova', 'tecnico'].includes(estado.abaAnalise) ? estado.abaAnalise : 'ensaios';

  const mensagens = [
    ...leitura.mensagens.map((m) => caixaAviso(m.nivel, m.texto)),
    ...otimo.avisos.map((x) => caixaAviso(x.nivel, x.texto)),
    ...(an.ignorados > 0 ? [caixaAviso('info', `${an.ignorados} ensaio(s) sem resultado foram desconsiderados.`)] : []),
  ];

  return `
  <header class="cabecalho-pagina">
    <div>
      <h1>Resultado</h1>
      <p>${esc(meta.experimento?.nome || 'Experimento')} · ${ensaios.length} ensaios analisados · objetivo: ${esc(objetivo)} de ${esc(r.nome)}</p>
    </div>
    <div class="cabecalho-acoes">
      <button class="btn btn-fantasma" data-ir="inicio">Novo experimento</button>
      <button class="btn" data-baixar-latex>${icone('baixar')}Tabelas em LaTeX</button>
      <button class="btn btn-primario" data-baixar-resultados>${icone('baixar')}Baixar resultados</button>
    </div>
  </header>

  <div class="kpis">
    <div class="kpi">
      <div class="kpi-rotulo">${icone('alvo')}${esc(r.nome)} previsto</div>
      <div class="kpi-linha">
        <span class="kpi-valor">${numBR(previsto, casasResposta)}${unidade(r.unidade)}</span>
        ${isFinite(otimo.recomendado.erroPadrao) ? `<span class="pilula">± ${numBR(2 * otimo.recomendado.erroPadrao, casasResposta)}</span>` : ''}
      </div>
      <div class="kpi-nota">na condição recomendada</div>
    </div>
    <div class="kpi">
      <div class="kpi-rotulo">${icone('estrela')}Melhor ensaio realizado</div>
      <div class="kpi-linha">
        <span class="kpi-valor">${numBR(melhorFeito.resposta)}${unidade(r.unidade)}</span>
        ${isFinite(ganho) && ganho > 0 ? `<span class="pilula pilula-bom">↗ ${numBR(ganho, casasResposta)}</span>` : ''}
      </div>
      <div class="kpi-nota">${esc(melhorFeito.id)}${isFinite(ganho) && ganho > 0 ? ` · a recomendação rende ${numBR(ganho, casasResposta)}${un} a mais` : ''}</div>
    </div>
    <div class="kpi">
      <div class="kpi-rotulo">${icone('pulso')}Variação explicada</div>
      <div class="kpi-linha">
        <span class="kpi-valor">${numBR(a.r2 * 100, 1)}<span class="un">%</span></span>
      </div>
      <div class="kpi-nota">${isFinite(a.r2Ajustado) ? `${numBR(a.r2Ajustado * 100, 1)}% descontando o nº de coeficientes` : 'dos resultados medidos'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-rotulo">${icone('camadas')}Capacidade de previsão</div>
      <div class="kpi-linha">
        <span class="kpi-valor">${isFinite(ajuste.r2Predito) ? `${numBR(ajuste.r2Predito * 100, 1)}<span class="un">%</span>` : '—'}</span>
        <span class="pilula ${prev.classe}">${prev.texto}</span>
      </div>
      <div class="kpi-nota">em ensaios que o modelo não viu</div>
    </div>
  </div>

  <div class="dash-grade">
    <section class="painel">
      <div class="painel-cab">
        <div>
          <span class="painel-rotulo">${icone('mapa')}Mapa do experimento</span>
          <h2 style="margin-top:.25rem">${esc(r.nome)} previsto em cada combinação</h2>
        </div>
        <div class="painel-extra legenda-marcas">
          <span><i class="marca-ponto"></i>Seus ensaios</span>
          <span><i class="marca-otimo"></i>Condição recomendada</span>
        </div>
      </div>
      ${f.length > 2 ? `<div class="viz-controles">
        <div class="campo"><label for="eixo-x">Eixo horizontal</label>
          <select id="eixo-x">${f.map((x, j) => `<option value="${j}" ${j === 0 ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label for="eixo-y">Eixo vertical</label>
          <select id="eixo-y">${f.map((x, j) => `<option value="${j}" ${j === 1 ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="campo" style="flex:1"><div class="ajuda" id="nota-fixos"></div></div>
      </div>` : ''}
      <div class="grafico-rolagem"><div id="graf-superficie"></div></div>
      <p class="legenda-grafico" style="margin-bottom:0">Passe o cursor sobre o mapa para ler o valor previsto em qualquer ponto.</p>
    </section>

    <div class="coluna">
      <section class="painel">
        <div class="painel-cab"><span class="painel-rotulo">${icone('alvo')}Condição recomendada</span></div>
        <ul class="lista-condicao">
          ${f.map((x, j) => `<li>
            <span class="nome">${esc(x.nome)}</span>
            <span class="valor">${numBR(otimo.recomendado.reais[j], x.casasDecimais ?? 2)}${unidade(x.unidade)}</span>
          </li>`).join('')}
        </ul>
        <p class="secundario pequeno" style="margin:0">Para obter ${esc(objetivo)} de ${esc(r.nome)} dentro da faixa que você testou.</p>
      </section>

      <section class="painel">
        <div class="painel-cab">
          <span class="painel-rotulo">${icone('camadas')}Formato da curva</span>
        </div>
        <select id="analise-modelo" aria-label="Formato da curva">
          <option value="quadratico" ${(an.modelo ?? 'quadratico') === 'quadratico' ? 'selected' : ''}>Curvatura simples</option>
          <option value="cubicoReduzido" ${an.modelo === 'cubicoReduzido' ? 'selected' : ''}>Curvatura em S — mesmos ensaios</option>
          <option value="cubicoCompleto" ${an.modelo === 'cubicoCompleto' ? 'selected' : ''}>Curvatura em S completa</option>
        </select>
        <p class="ajuda">Reanalisa os mesmos ensaios com outro formato. Compare pela capacidade de previsão, não pela variação explicada.</p>
        <div class="metricas">
          <div class="metrica"><span>Variação explicada</span><strong>${numBR(a.r2 * 100, 1)}%</strong></div>
          <div class="metrica"><span>Capacidade de previsão</span><strong>${isFinite(ajuste.r2Predito) ? `${numBR(ajuste.r2Predito * 100, 1)}%` : '—'}</strong></div>
        </div>
        ${isFinite(ajuste.r2Predito) && isFinite(a.r2) && (a.r2 - ajuste.r2Predito) > 0.15
          ? '<p class="legenda-grafico" style="margin-bottom:0">A previsão está bem abaixo da variação explicada: o modelo pode estar decorando os ensaios em vez de descrever a superfície.</p>'
          : ''}
        ${!isFinite(ajuste.r2Predito) && ajuste.pontosNaoDeletaveis > 0
          ? '<p class="legenda-grafico" style="margin-bottom:0">Previsão não calculável: este formato tem coeficientes demais para o número de ensaios distintos.</p>'
          : ''}
      </section>

    </div>
  </div>

  ${mensagens.length ? `<section class="painel">
    <div class="painel-cab"><span class="painel-rotulo">${icone('info')}O que os números dizem</span></div>
    <div class="avisos-grade">${mensagens.join('')}</div>
  </section>` : ''}

  <section class="painel">
    <div class="painel-cab">
      <div>
        <span class="painel-rotulo">${icone('barras')}O que mais influencia</span>
        <h2 style="margin-top:.25rem">Efeito de cada variável sobre ${esc(r.nome)}</h2>
      </div>
      <div class="painel-extra legenda-marcas">
        <span><i class="marca-ponto" style="background:var(--diverging-pos);border-radius:3px"></i>Aumenta</span>
        <span><i class="marca-ponto" style="background:var(--diverging-neg);border-radius:3px"></i>Diminui</span>
      </div>
    </div>
    <p class="secundario pequeno">A linha fina sobre cada barra é a faixa de incerteza: <strong>quando ela cruza o zero, o efeito pode ser apenas ruído</strong> e não deve orientar decisões.</p>
    <div class="grafico-rolagem"><div id="graf-efeitos"></div></div>
  </section>

  <div class="dash-2">
    <section class="painel">
      <div class="painel-cab">
        <div>
          <span class="painel-rotulo">${icone('dispersao')}Confiabilidade</span>
          <h2 style="margin-top:.25rem">O modelo acerta seus ensaios?</h2>
        </div>
      </div>
      <p class="secundario pequeno">Cada ponto é um ensaio. Quanto mais perto da diagonal, melhor o modelo reproduz o que você mediu.</p>
      <div class="grafico-rolagem"><div id="graf-obsprev"></div></div>
    </section>
    <section class="painel">
      <div class="painel-cab">
        <div>
          <span class="painel-rotulo">${icone('relogio')}Estabilidade</span>
          <h2 style="margin-top:.25rem">Houve deriva ao longo do dia?</h2>
        </div>
      </div>
      <p class="secundario pequeno">Diferenças espalhadas sem padrão são boas. Uma tendência clara sugere que algo mudou durante a execução.</p>
      <div class="grafico-rolagem"><div id="graf-residuos"></div></div>
    </section>
  </div>

  <section class="painel">
    <div class="abas" role="tablist">
      <button class="aba${aba === 'ensaios' ? ' ativa' : ''}" data-aba="ensaios" role="tab">Seus ensaios</button>
      <button class="aba${aba === 'anova' ? ' ativa' : ''}" data-aba="anova" role="tab">Análise de variância</button>
      <button class="aba${aba === 'tecnico' ? ' ativa' : ''}" data-aba="tecnico" role="tab">Detalhes técnicos</button>
    </div>

    <div data-painel="ensaios"${aba !== 'ensaios' ? ' class="oculto"' : ''}>
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

    <div data-painel="anova"${aba !== 'anova' ? ' class="oculto"' : ''}>
      ${tabelaAnovaHTML(a)}
      <p class="legenda-grafico" style="margin-bottom:0">
        O modelo explica <strong>${numBR(a.r2 * 100, 1)}%</strong> da variação observada${a.temErroPuro
          ? `, de um máximo possível de <strong>${numBR(a.r2Maximo * 100, 1)}%</strong> — o restante é o ruído do próprio experimento`
          : ''}${isFinite(a.r2Ajustado) ? `; ajustado ao número de coeficientes, <strong>${numBR(a.r2Ajustado * 100, 1)}%</strong>` : ''}.
      </p>
    </div>

    <div data-painel="tecnico"${aba !== 'tecnico' ? ' class="oculto"' : ''}>
      <p class="secundario pequeno">Esta aba existe para o relatório. Nada aqui é necessário para usar a ferramenta.</p>

      <h3 style="margin-top:1rem">Coeficientes do modelo ${{ quadratico: 'quadrático', cubicoReduzido: 'cúbico', cubicoCompleto: 'cúbico completo' }[an.modelo] || 'quadrático'}</h3>
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

      <h3 style="margin-top:1.5rem">Análise canônica${otimo.canonica.local ? ' (local, perto do ponto avaliado)' : ''}</h3>
      ${otimo.canonica.local ? '<p class="secundario pequeno">Num modelo cúbico a curvatura muda de ponto para ponto — esta classificação vale só nas vizinhanças do ponto abaixo, não na faixa inteira.</p>' : ''}
      <div class="tabela-envolve"><table class="dados">
        <thead><tr><th>Item</th><th>Valor</th></tr></thead>
        <tbody>
          <tr><td class="texto">Classificação da superfície</td><td class="texto">${esc(tipoSuperficie[otimo.canonica.tipo] || otimo.canonica.tipo)}</td></tr>
          <tr><td class="texto">Autovalores da curvatura local</td><td class="texto mono">${otimo.canonica.autovalores.map((v) => numBR(v, 4)).join(' ; ')}</td></tr>
          ${otimo.estacionario ? `
          <tr><td class="texto">Ponto estacionário (codificado)</td><td class="texto mono">${otimo.estacionario.codificados.map((v) => numBR(v, 4)).join(' ; ')}</td></tr>
          <tr><td class="texto">Ponto estacionário (real)</td><td class="texto mono">${otimo.estacionario.reais.map((v, j) => `${numBR(v, f[j].casasDecimais ?? 2)} ${esc(f[j].unidade || '')}`).join(' ; ')}</td></tr>
          <tr><td class="texto">Dentro da região experimental</td><td class="texto">${otimo.estacionario.dentroDaRegiao ? 'sim' : 'não'}</td></tr>` : ''}
          ${otimo.estacionarios && otimo.estacionarios.length > 1 ? `
          <tr><td class="texto">Outros pontos de inclinação nula</td><td class="texto">${otimo.estacionarios.length} ao todo — ${otimo.estacionarios.map((e) => tipoSuperficie[e.canonica.tipo] || e.canonica.tipo).join(', ')}</td></tr>` : ''}
        </tbody>
      </table></div>

      <h3 style="margin-top:1.5rem">Planejamento</h3>
      <div class="tabela-envolve"><table class="dados">
        <thead><tr><th>Item</th><th>Valor</th></tr></thead>
        <tbody>
          <tr><td class="texto">Tipo</td><td class="texto">Composto central (CCD)</td></tr>
          <tr><td class="texto">Modelo ajustado</td><td class="texto">${esc(NOME_MODELO[an.modelo] || NOME_MODELO.quadratico)}</td></tr>
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
export function telaSimulador(estado) {
  const an = estado.analise;
  if (!an) return `<div class="aviso aviso-atencao">Nenhum modelo calculado. Realize a análise primeiro.</div>`;

  const { meta, otimo } = an;
  const f = meta.fatores;
  const esc = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const numBR = (val, dec) => val.toLocaleString('pt-BR', { maximumFractionDigits: dec });

  return `
  <header class="cabecalho-pagina">
    <div>
      <h1>Simulador e Otimizador</h1>
      <p>Ajuste valores manualmente ou trave (Fixar) variáveis para calcular o melhor resultado possível nas demais.</p>
    </div>
  </header>

  <div class="dash-grade">
    <section class="painel">
      <div class="painel-cab" style="display: flex; justify-content: space-between; align-items: center;">
        <h2>Variáveis</h2>
        <button id="btn-otimizar" class="botao botao-primario" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; cursor: pointer;">
          Otimizar Livres
        </button>
      </div>
      <div class="grade-2" id="form-simulador">
        ${f.map((x, j) => `
          <div class="campo">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <label for="sim-fator-${j}">${esc(x.nome)} ${x.unidade ? `(${esc(x.unidade)})` : ''}</label>
              <label style="font-size: 0.8rem; cursor: pointer; user-select: none;">
                <input type="checkbox" data-sim-fixo="${j}"> Fixar
              </label>
            </div>
            <input type="number" step="any" id="sim-fator-${j}" data-sim-fator="${j}" value="${otimo.recomendado.reais[j]}" min="${x.min}" max="${x.max}">
          </div>
        `).join('')}
      </div>
    </section>

    <section class="painel">
      <div class="painel-cab"><h2>Resultado do Ponto Ótimo</h2></div>
      <div class="kpi" style="margin-top: 1rem;">
        <div class="kpi-linha">
          <span class="kpi-valor" id="simulador-previsto">${numBR(otimo.recomendado.previsto, 3)}</span>
          ${meta.resposta.unidade ? `<span class="un">${esc(meta.resposta.unidade)}</span>` : ''}
        </div>
        <div id="simulador-resumo-otimista" style="font-size: 0.875rem; color: var(--texto-secundario); margin-top: 0.75rem; line-height: 1.4;">
          Exibindo condição recomendada geral. Altere os valores, marque "Fixar" e clique em "Otimizar Livres" para recalcular o máximo em uma condição específica.
        </div>
      </div>
    </section>
  </div>`;
}