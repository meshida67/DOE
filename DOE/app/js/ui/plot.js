/**
 * plot.js — gráficos em SVG, sem biblioteca externa.
 *
 * Quatro formas, cada uma com um trabalho:
 *   superfície  — magnitude sobre dois fatores → rampa SEQUENCIAL de uma só
 *                 matiz (azul), com isolinhas e legenda numérica;
 *   efeitos     — polaridade (aumenta/diminui) → par DIVERGENTE azul↔vermelho
 *                 com barra de incerteza; quem cruza o zero não é conclusivo;
 *   obs × prev  — série única, azul do slot 1, sem caixa de legenda;
 *   resíduos    — série única, contra a ordem de execução, para flagrar deriva.
 *
 * As cores vêm de custom properties do CSS, então o modo escuro é uma troca de
 * variáveis e não um segundo caminho de código.
 */

const NS = 'http://www.w3.org/2000/svg';

const el = (nome, attrs = {}, pai = null) => {
  const n = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  }
  if (pai) pai.appendChild(n);
  return n;
};

/** Lê os tokens de cor vigentes — segue o tema sem duplicar a paleta em JS. */
function tokens(alvo) {
  const s = getComputedStyle(alvo);
  const v = (nome, padrao) => (s.getPropertyValue(nome) || padrao).trim();
  return {
    surface: v('--surface-1', '#fcfcfb'),
    textPrimary: v('--text-primary', '#0b0b0b'),
    textSecondary: v('--text-secondary', '#52514e'),
    muted: v('--muted', '#898781'),
    grid: v('--gridline', '#e1e0d9'),
    axis: v('--baseline', '#c3c2b7'),
    serie1: v('--series-1', '#2a78d6'),
    acento: v('--series-2', '#eb6834'),
    positivo: v('--diverging-pos', '#2a78d6'),
    negativo: v('--diverging-neg', '#d03b3b'),
    escuro: v('--is-dark', '0') === '1',
    rampa: v('--ramp-seq', '').split(',').map((c) => c.trim()).filter(Boolean),
  };
}

const RAMPA_PADRAO = [
  '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5',
  '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b',
];

const hexParaRGB = (hex) => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
};

/**
 * Interpola a rampa sequencial. Em modo escuro a âncora inverte: o valor baixo
 * recua para o fundo e o alto vem para a frente, de modo que "mais contraste
 * com a superfície" signifique "mais resposta" nos dois temas.
 */
function corSequencial(t, rampa, escuro) {
  const cores = rampa.length >= 2 ? rampa : RAMPA_PADRAO;
  const u = Math.min(1, Math.max(0, escuro ? 1 - t : t));
  const pos = u * (cores.length - 1);
  const i = Math.min(cores.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = hexParaRGB(cores[i]);
  const b = hexParaRGB(cores[i + 1]);
  return [0, 1, 2].map((j) => Math.round(a[j] + (b[j] - a[j]) * f));
}

/** Valores de eixo "redondos". */
export function ticksBonitos(min, max, alvo = 5) {
  if (!(max > min)) return [min];
  const bruto = (max - min) / alvo;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto / mag;
  const passo = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const ticks = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max + passo * 1e-9; v += passo) {
    ticks.push(Math.abs(v) < passo * 1e-9 ? 0 : v);
  }
  return ticks;
}

const fmt = (v, casas = 3) => {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  const c = a >= 100 ? 1 : a >= 10 ? 2 : casas;
  return Number(v.toFixed(c)).toLocaleString('pt-BR');
};

// ── camada de tooltip compartilhada ──────────────────────────────────────

function tooltip(container) {
  let t = container.querySelector('.viz-tip');
  if (!t) {
    t = document.createElement('div');
    t.className = 'viz-tip';
    t.setAttribute('role', 'status');
    container.appendChild(t);
  }
  return {
    mostrar(html, x, y) {
      t.innerHTML = html;
      t.style.opacity = '1';
      const r = container.getBoundingClientRect();
      const w = t.offsetWidth;
      t.style.left = `${Math.max(4, Math.min(r.width - w - 4, x - w / 2))}px`;
      t.style.top = `${y - t.offsetHeight - 12}px`;
    },
    esconder() { t.style.opacity = '0'; },
  };
}

/** Alvo de toque generoso: o mark é pequeno, a área sensível não. */
function areaSensivel(pai, x, y, r, aoEntrar, aoSair) {
  const hit = el('circle', { cx: x, cy: y, r: Math.max(r, 13), fill: 'transparent', style: 'cursor:pointer' }, pai);
  hit.addEventListener('mouseenter', aoEntrar);
  hit.addEventListener('mousemove', aoEntrar);
  hit.addEventListener('mouseleave', aoSair);
  return hit;
}

function moldura(container, { largura = 720, altura = 520, titulo = '', descricao = '' } = {}) {
  container.innerHTML = '';
  container.classList.add('viz');
  const svg = el('svg', {
    viewBox: `0 0 ${largura} ${altura}`,
    width: '100%',
    role: 'img',
    'aria-label': `${titulo}. ${descricao}`,
  }, container);
  return svg;
}

// ── 1. superfície de resposta ────────────────────────────────────────────

/** Marching squares: segmentos da isolinha de `nivel` sobre a grade. */
function isolinhas(z, n, nivel) {
  const seg = [];
  const interp = (a, b) => (nivel - a) / (b - a);
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const v = [z[j][i], z[j][i + 1], z[j + 1][i + 1], z[j + 1][i]]; // horário a partir do canto inferior-esquerdo
      let caso = 0;
      for (let c = 0; c < 4; c++) if (v[c] >= nivel) caso |= 1 << c;
      if (caso === 0 || caso === 15) continue;

      const P = {
        b: () => [i + interp(v[0], v[1]), j],
        d: () => [i + 1, j + interp(v[1], v[2])],
        t: () => [i + interp(v[3], v[2]), j + 1],
        e: () => [i, j + interp(v[0], v[3])],
      };
      // Nos casos ambíguos (5 e 10) o sinal da média dos 4 cantos decide como
      // ligar os pontos, evitando o "xadrez" clássico do marching squares.
      const media = (v[0] + v[1] + v[2] + v[3]) / 4;
      const liga = (a, b) => seg.push([P[a](), P[b]()]);
      switch (caso) {
        case 1: case 14: liga('e', 'b'); break;
        case 2: case 13: liga('b', 'd'); break;
        case 3: case 12: liga('e', 'd'); break;
        case 4: case 11: liga('d', 't'); break;
        case 6: case 9: liga('b', 't'); break;
        case 7: case 8: liga('e', 't'); break;
        case 5: if (media >= nivel) { liga('e', 't'); liga('b', 'd'); } else { liga('e', 'b'); liga('d', 't'); } break;
        case 10: if (media >= nivel) { liga('e', 'b'); liga('d', 't'); } else { liga('e', 't'); liga('b', 'd'); } break;
      }
    }
  }
  return seg;
}

/**
 * Mapa de superfície sobre dois fatores. Os demais ficam fixos nos valores
 * informados (por padrão, os do ótimo).
 */
export function plotarSuperficie(container, analise, opcoes = {}) {
  const { meta, ajuste, otimo, ensaios } = analise;
  const { iX = 0, iY = 1, fixos = null } = opcoes;
  const T = tokens(container);
  const fx = meta.fatores[iX];
  const fy = meta.fatores[iY];
  const resposta = meta.resposta;

  const N = 140;
  const base = fixos || otimo.recomendado.codificados;

  // Campo previsto na grade, em coordenadas codificadas.
  const limite = otimo.limiteCodificado;
  const z = [];
  let zMin = Infinity, zMax = -Infinity;
  for (let j = 0; j < N; j++) {
    const linha = [];
    for (let i = 0; i < N; i++) {
      const x = base.slice();
      x[iX] = -limite + (2 * limite * i) / (N - 1);
      x[iY] = -limite + (2 * limite * j) / (N - 1);
      let s = 0;
      for (let t = 0; t < ajuste.termos.length; t++) {
        const termo = ajuste.termos[t];
        s += ajuste.beta[t] * (termo.tipo === 'intercepto' ? 1
          : termo.tipo === 'linear' ? x[termo.i]
          : termo.tipo === 'quadratico' ? x[termo.i] * x[termo.i]
          : x[termo.i] * x[termo.j]);
      }
      linha.push(s);
      if (s < zMin) zMin = s;
      if (s > zMax) zMax = s;
    }
    z.push(linha);
  }

  const L = 78, R = 108, Topo = 20, B = 62;
  const W = 720, H = 520;
  const pw = W - L - R, ph = H - Topo - B;
  const svg = moldura(container, {
    largura: W, altura: H,
    titulo: `Superfície de resposta de ${resposta.nome}`,
    descricao: `Em função de ${fx.nome} e ${fy.nome}. Os valores estão na tabela de ensaios.`,
  });
  const tip = tooltip(container);

  // Campo, desenhado num canvas e embutido como imagem — 140×140 células como
  // <rect> seriam ~20 mil nós de DOM.
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const t = zMax > zMin ? (z[j][i] - zMin) / (zMax - zMin) : 0.5;
      const [r, g, b] = corSequencial(t, T.rampa, T.escuro);
      const p = 4 * ((N - 1 - j) * N + i); // canvas cresce para baixo
      img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  el('image', {
    href: cv.toDataURL(), x: L, y: Topo, width: pw, height: ph,
    preserveAspectRatio: 'none', style: 'image-rendering:auto',
  }, svg);

  const px = (c) => L + ((c + limite) / (2 * limite)) * pw;
  const py = (c) => Topo + ph - ((c + limite) / (2 * limite)) * ph;
  const real = (c, f) => f.centro + c * f.unidadeCodificada;
  const cod = (v, f) => (v - f.centro) / f.unidadeCodificada;

  // Isolinhas: hairlines na cor da tinta, com rótulo numérico em algumas.
  const nNiveis = 8;
  for (let n = 1; n <= nNiveis; n++) {
    const nivel = zMin + ((zMax - zMin) * n) / (nNiveis + 1);
    const segs = isolinhas(z, N, nivel);
    if (!segs.length) continue;
    const d = segs.map(([a, b]) =>
      `M${px(-limite + (2 * limite * a[0]) / (N - 1))},${py(-limite + (2 * limite * a[1]) / (N - 1))}` +
      `L${px(-limite + (2 * limite * b[0]) / (N - 1))},${py(-limite + (2 * limite * b[1]) / (N - 1))}`
    ).join('');
    el('path', {
      d, fill: 'none',
      stroke: T.escuro ? 'rgba(255,255,255,0.34)' : 'rgba(11,11,11,0.28)',
      'stroke-width': 1,
    }, svg);

    if (n % 2 === 0 && segs.length) {
      const meio = segs[Math.floor(segs.length / 2)][0];
      const tx = px(-limite + (2 * limite * meio[0]) / (N - 1));
      const ty = py(-limite + (2 * limite * meio[1]) / (N - 1));
      const g = el('g', {}, svg);
      const txt = el('text', {
        x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': 11, fill: T.textPrimary, 'paint-order': 'stroke',
        stroke: T.surface, 'stroke-width': 3.5, 'stroke-linejoin': 'round',
      }, g);
      txt.textContent = fmt(nivel, 2);
    }
  }

  // Eixos
  el('rect', { x: L, y: Topo, width: pw, height: ph, fill: 'none', stroke: T.axis, 'stroke-width': 1 }, svg);
  for (const v of ticksBonitos(real(-limite, fx), real(limite, fx), 5)) {
    const x = px(cod(v, fx));
    if (x < L - 0.5 || x > L + pw + 0.5) continue;
    el('line', { x1: x, y1: Topo + ph, x2: x, y2: Topo + ph + 5, stroke: T.axis, 'stroke-width': 1 }, svg);
    const t = el('text', { x, y: Topo + ph + 19, 'text-anchor': 'middle', 'font-size': 12, fill: T.muted, style: 'font-variant-numeric:tabular-nums' }, svg);
    t.textContent = fmt(v, 2);
  }
  for (const v of ticksBonitos(real(-limite, fy), real(limite, fy), 5)) {
    const y = py(cod(v, fy));
    if (y < Topo - 0.5 || y > Topo + ph + 0.5) continue;
    el('line', { x1: L - 5, y1: y, x2: L, y2: y, stroke: T.axis, 'stroke-width': 1 }, svg);
    const t = el('text', { x: L - 9, y, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 12, fill: T.muted, style: 'font-variant-numeric:tabular-nums' }, svg);
    t.textContent = fmt(v, 2);
  }
  const rx = el('text', { x: L + pw / 2, y: H - 22, 'text-anchor': 'middle', 'font-size': 13, fill: T.textSecondary }, svg);
  rx.textContent = fx.unidade ? `${fx.nome} (${fx.unidade})` : fx.nome;
  const ry = el('text', {
    x: 18, y: Topo + ph / 2, 'text-anchor': 'middle', 'font-size': 13, fill: T.textSecondary,
    transform: `rotate(-90 18 ${Topo + ph / 2})`,
  }, svg);
  ry.textContent = fy.unidade ? `${fy.nome} (${fy.unidade})` : fy.nome;

  // Ensaios realizados. Anel de 2px na cor da superfície para sobreviver ao fundo.
  for (const e of ensaios) {
    const cxCod = e.codificadosExecutados[iX];
    const cyCod = e.codificadosExecutados[iY];
    const outrosNoPlano = meta.fatores.every((_, j) =>
      j === iX || j === iY || Math.abs(e.codificadosExecutados[j] - base[j]) < 1e-6);
    const x = px(cxCod), y = py(cyCod);
    if (x < L || x > L + pw || y < Topo || y > Topo + ph) continue;

    el('circle', {
      cx: x, cy: y, r: 5,
      fill: outrosNoPlano ? T.textPrimary : 'none',
      stroke: T.surface, 'stroke-width': 2,
      opacity: outrosNoPlano ? 1 : 0.55,
    }, svg);
    if (!outrosNoPlano) {
      el('circle', { cx: x, cy: y, r: 5, fill: 'none', stroke: T.textPrimary, 'stroke-width': 1.5, opacity: 0.55 }, svg);
    }
    areaSensivel(svg, x, y, 5, (ev) => {
      const r = container.getBoundingClientRect();
      tip.mostrar(
        `<strong>${e.id}</strong><br>` +
        meta.fatores.map((f, j) => `${f.nome}: ${fmt(e.reais[j])} ${f.unidade || ''}`).join('<br>') +
        `<br>${resposta.nome} medido: <strong>${fmt(e.resposta)}</strong>` +
        `<br>previsto: ${fmt(e.previsto)}` +
        (outrosNoPlano ? '' : '<br><em>fora deste plano de corte</em>'),
        ev.clientX - r.left, ev.clientY - r.top
      );
    }, () => tip.esconder());
  }

  // Ótimo — marca de acento, com rótulo direto (identidade não fica só na cor).
  const ox = px(otimo.recomendado.codificados[iX]);
  const oy = py(otimo.recomendado.codificados[iY]);
  el('circle', { cx: ox, cy: oy, r: 9, fill: 'none', stroke: T.surface, 'stroke-width': 4 }, svg);
  el('circle', { cx: ox, cy: oy, r: 9, fill: 'none', stroke: T.acento, 'stroke-width': 2.5 }, svg);
  el('circle', { cx: ox, cy: oy, r: 3, fill: T.acento }, svg);
  const rotuloX = ox > L + pw - 90 ? ox - 14 : ox + 14;
  const ancora = ox > L + pw - 90 ? 'end' : 'start';
  const rot = el('text', {
    x: rotuloX, y: oy - 12, 'text-anchor': ancora, 'font-size': 12.5, 'font-weight': 600,
    fill: T.textPrimary, 'paint-order': 'stroke', stroke: T.surface, 'stroke-width': 3.5, 'stroke-linejoin': 'round',
  }, svg);
  rot.textContent = 'Ótimo';

  // Legenda da escala — obrigatória em codificação sequencial.
  const lx = L + pw + 26, lw = 16, lh = ph;
  const grad = el('linearGradient', { id: `g-${Math.random().toString(36).slice(2)}`, x1: 0, y1: 1, x2: 0, y2: 0 }, el('defs', {}, svg));
  for (let i = 0; i <= 10; i++) {
    const [r, g, b] = corSequencial(i / 10, T.rampa, T.escuro);
    el('stop', { offset: `${i * 10}%`, 'stop-color': `rgb(${r},${g},${b})` }, grad);
  }
  el('rect', { x: lx, y: Topo, width: lw, height: lh, fill: `url(#${grad.id})`, stroke: T.axis, 'stroke-width': 1 }, svg);
  for (const v of ticksBonitos(zMin, zMax, 5)) {
    if (v < zMin || v > zMax) continue;
    const y = Topo + lh - ((v - zMin) / (zMax - zMin)) * lh;
    el('line', { x1: lx + lw, y1: y, x2: lx + lw + 4, y2: y, stroke: T.axis, 'stroke-width': 1 }, svg);
    const t = el('text', { x: lx + lw + 8, y, 'dominant-baseline': 'middle', 'font-size': 11.5, fill: T.muted, style: 'font-variant-numeric:tabular-nums' }, svg);
    t.textContent = fmt(v, 2);
  }
  const lt = el('text', { x: lx, y: Topo - 7, 'font-size': 11.5, fill: T.textSecondary }, svg);
  lt.textContent = resposta.unidade || resposta.nome.slice(0, 12);

  // Área sensível do campo: lê o modelo em qualquer ponto.
  const capa = el('rect', { x: L, y: Topo, width: pw, height: ph, fill: 'transparent' }, svg);
  capa.addEventListener('mousemove', (ev) => {
    const r = svg.getBoundingClientRect();
    const escala = W / r.width;
    const sx = (ev.clientX - r.left) * escala;
    const sy = (ev.clientY - r.top) * escala;
    const cx = ((sx - L) / pw) * 2 * limite - limite;
    const cy = ((Topo + ph - sy) / ph) * 2 * limite - limite;
    const x = base.slice(); x[iX] = cx; x[iY] = cy;
    let s = 0;
    ajuste.termos.forEach((termo, t) => {
      s += ajuste.beta[t] * (termo.tipo === 'intercepto' ? 1
        : termo.tipo === 'linear' ? x[termo.i]
        : termo.tipo === 'quadratico' ? x[termo.i] * x[termo.i]
        : x[termo.i] * x[termo.j]);
    });
    const rc = container.getBoundingClientRect();
    tip.mostrar(
      `${fx.nome}: <strong>${fmt(real(cx, fx))}</strong> ${fx.unidade || ''}<br>` +
      `${fy.nome}: <strong>${fmt(real(cy, fy))}</strong> ${fy.unidade || ''}<br>` +
      `${resposta.nome} previsto: <strong>${fmt(s)}</strong> ${resposta.unidade || ''}`,
      ev.clientX - rc.left, ev.clientY - rc.top
    );
  });
  capa.addEventListener('mouseleave', () => tip.esconder());
  // A capa fica por baixo dos marcadores, que têm tooltip próprio.
  svg.insertBefore(capa, svg.querySelector('circle'));

  return svg;
}

// ── 2. efeitos dos fatores ───────────────────────────────────────────────

/**
 * Barras horizontais dos coeficientes com barra de incerteza (IC 95%).
 * Quem cruza o zero não se distingue do ruído — a leitura é geométrica, sem
 * depender de o usuário saber o que é p-valor.
 */
export function plotarEfeitos(container, analise) {
  const T = tokens(container);
  const coefs = analise.ajuste.coeficientes.filter((c) => c.tipo !== 'intercepto');
  const W = 780;
  const linhaAltura = 34;
  // Faixa de rótulos larga: com 3 ou 4 fatores as descrições ficam longas
  // ("Interação Temperatura × Concentração"), e truncar cedo demais apaga
  // justamente a informação que distingue uma linha da outra.
  const Topo = 34, B = 46, L = 258, R = 34;
  const H = Topo + coefs.length * linhaAltura + B;

  const svg = moldura(container, {
    largura: W, altura: H,
    titulo: 'Efeito de cada fator',
    descricao: 'Barras à direita aumentam a resposta, à esquerda diminuem. A linha fina é a incerteza; quem cruza o zero não é conclusivo.',
  });
  const tip = tooltip(container);

  const maxAbs = Math.max(...coefs.map((c) => Math.max(Math.abs(c.ic[0]), Math.abs(c.ic[1]), Math.abs(c.valor)))) || 1;
  const pw = W - L - R;
  const x0 = L + pw / 2;
  const px = (v) => x0 + (v / (maxAbs * 1.12)) * (pw / 2);

  for (const v of ticksBonitos(-maxAbs, maxAbs, 5)) {
    const x = px(v);
    if (x < L || x > W - R) continue;
    el('line', { x1: x, y1: Topo - 8, x2: x, y2: Topo + coefs.length * linhaAltura, stroke: T.grid, 'stroke-width': 1 }, svg);
    const t = el('text', { x, y: Topo + coefs.length * linhaAltura + 18, 'text-anchor': 'middle', 'font-size': 11.5, fill: T.muted, style: 'font-variant-numeric:tabular-nums' }, svg);
    t.textContent = fmt(v, 2);
  }
  el('line', { x1: x0, y1: Topo - 8, x2: x0, y2: Topo + coefs.length * linhaAltura, stroke: T.axis, 'stroke-width': 1 }, svg);

  coefs.forEach((c, i) => {
    const y = Topo + i * linhaAltura + linhaAltura / 2;
    const alt = 11;
    const positivo = c.valor >= 0;
    const cor = positivo ? T.positivo : T.negativo;
    const xa = px(Math.min(0, c.valor));
    const larg = Math.abs(px(c.valor) - px(0));

    const rot = el('text', { x: L - 14, y, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 12.5, fill: T.textSecondary }, svg);
    rot.textContent = c.descricao.length > 36 ? `${c.descricao.slice(0, 35)}…` : c.descricao;

    // Extremidade arredondada do lado do dado, reta no zero.
    const r = Math.min(4, larg);
    const d = positivo
      ? `M${xa},${y - alt / 2} H${xa + larg - r} a${r},${r} 0 0 1 ${r},${r} v${alt - 2 * r} a${r},${r} 0 0 1 ${-r},${r} H${xa} Z`
      : `M${xa + larg},${y - alt / 2} H${xa + r} a${r},${r} 0 0 0 ${-r},${r} v${alt - 2 * r} a${r},${r} 0 0 0 ${r},${r} H${xa + larg} Z`;
    el('path', { d, fill: cor, opacity: c.significativo ? 1 : 0.4 }, svg);

    if (isFinite(c.ic[0])) {
      const i0 = px(c.ic[0]), i1 = px(c.ic[1]);
      el('line', { x1: i0, y1: y, x2: i1, y2: y, stroke: T.textPrimary, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.72 }, svg);
      for (const xe of [i0, i1]) {
        el('line', { x1: xe, y1: y - 5, x2: xe, y2: y + 5, stroke: T.textPrimary, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.72 }, svg);
      }
    }

    const forade = positivo ? px(Math.max(c.valor, c.ic[1])) + 8 : px(Math.min(c.valor, c.ic[0])) - 8;
    const val = el('text', {
      x: Math.max(L - 4, Math.min(W - R - 4, forade)), y,
      'text-anchor': positivo ? 'start' : 'end', 'dominant-baseline': 'middle',
      'font-size': 12, fill: T.textPrimary, style: 'font-variant-numeric:tabular-nums',
      'paint-order': 'stroke', stroke: T.surface, 'stroke-width': 3, 'stroke-linejoin': 'round',
    }, svg);
    val.textContent = fmt(c.valor, 2);

    const hit = el('rect', { x: L, y: y - linhaAltura / 2, width: pw, height: linhaAltura, fill: 'transparent', style: 'cursor:pointer' }, svg);
    const mostrar = (ev) => {
      const rc = container.getBoundingClientRect();
      tip.mostrar(
        `<strong>${c.descricao}</strong><br>` +
        `Efeito: ${fmt(c.valor, 3)}<br>` +
        `Faixa provável: ${fmt(c.ic[0], 3)} a ${fmt(c.ic[1], 3)}<br>` +
        (c.significativo ? 'Distinguível do ruído' : 'Pode ser apenas ruído'),
        ev.clientX - rc.left, ev.clientY - rc.top
      );
    };
    hit.addEventListener('mousemove', mostrar);
    hit.addEventListener('mouseenter', mostrar);
    hit.addEventListener('mouseleave', () => tip.esconder());
  });

  const leg = el('text', { x: L, y: H - 14, 'font-size': 11.5, fill: T.muted }, svg);
  leg.textContent = '← diminui a resposta   |   aumenta a resposta →   (barra clara: pode ser só ruído)';
  return svg;
}

// ── 3. observado × previsto ──────────────────────────────────────────────

export function plotarObservadoPrevisto(container, analise) {
  const T = tokens(container);
  const { ensaios, meta } = analise;
  const W = 460, H = 400, L = 68, R = 20, Topo = 20, B = 54;
  const pw = W - L - R, ph = H - Topo - B;

  const svg = moldura(container, {
    largura: W, altura: H,
    titulo: `Valores medidos versus previstos de ${meta.resposta.nome}`,
    descricao: 'Quanto mais perto da diagonal, melhor o modelo descreve o ensaio.',
  });
  const tip = tooltip(container);

  const vals = ensaios.flatMap((e) => [e.resposta, e.previsto]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const folga = (hi - lo) * 0.08 || 1;
  lo -= folga; hi += folga;
  const px = (v) => L + ((v - lo) / (hi - lo)) * pw;
  const py = (v) => Topo + ph - ((v - lo) / (hi - lo)) * ph;

  for (const v of ticksBonitos(lo, hi, 5)) {
    if (v < lo || v > hi) continue;
    el('line', { x1: L, y1: py(v), x2: L + pw, y2: py(v), stroke: T.grid, 'stroke-width': 1 }, svg);
    el('line', { x1: px(v), y1: Topo, x2: px(v), y2: Topo + ph, stroke: T.grid, 'stroke-width': 1 }, svg);
    const ty = el('text', { x: L - 8, y: py(v), 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 11.5, fill: T.muted, style: 'font-variant-numeric:tabular-nums' }, svg);
    ty.textContent = fmt(v, 2);
    const tx = el('text', { x: px(v), y: Topo + ph + 17, 'text-anchor': 'middle', 'font-size': 11.5, fill: T.muted, style: 'font-variant-numeric:tabular-nums' }, svg);
    tx.textContent = fmt(v, 2);
  }
  el('line', { x1: px(lo), y1: py(lo), x2: px(hi), y2: py(hi), stroke: T.axis, 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);

  for (const e of ensaios) {
    const x = px(e.previsto), y = py(e.resposta);
    el('circle', { cx: x, cy: y, r: 5, fill: T.serie1, stroke: T.surface, 'stroke-width': 2 }, svg);
    areaSensivel(svg, x, y, 5, (ev) => {
      const rc = container.getBoundingClientRect();
      tip.mostrar(
        `<strong>${e.id}</strong><br>medido: ${fmt(e.resposta)}<br>previsto: ${fmt(e.previsto)}<br>diferença: ${fmt(e.residuo)}`,
        ev.clientX - rc.left, ev.clientY - rc.top
      );
    }, () => tip.esconder());
  }

  const ex = el('text', { x: L + pw / 2, y: H - 16, 'text-anchor': 'middle', 'font-size': 12.5, fill: T.textSecondary }, svg);
  ex.textContent = 'Previsto pelo modelo';
  const ey = el('text', { x: 16, y: Topo + ph / 2, 'text-anchor': 'middle', 'font-size': 12.5, fill: T.textSecondary, transform: `rotate(-90 16 ${Topo + ph / 2})` }, svg);
  ey.textContent = 'Medido no laboratório';
  return svg;
}

// ── 4. resíduos por ordem de execução ────────────────────────────────────

/**
 * Resíduo contra a ordem em que os ensaios foram feitos. Uma tendência aqui
 * (tudo positivo no começo, negativo no fim) denuncia deriva ao longo do dia —
 * algo que nenhum gráfico contra os fatores mostraria.
 */
export function plotarResiduos(container, analise) {
  const T = tokens(container);
  const { ensaios, meta } = analise;
  const W = 460, H = 400, L = 68, R = 20, Topo = 20, B = 54;
  const pw = W - L - R, ph = H - Topo - B;

  const svg = moldura(container, {
    largura: W, altura: H,
    titulo: 'Diferenças entre medido e previsto, na ordem de execução',
    descricao: 'Pontos espalhados sem padrão indicam que o experimento se manteve estável.',
  });
  const tip = tooltip(container);

  const ordenados = [...ensaios].sort((a, b) => a.ordemExecucao - b.ordemExecucao);
  const maxAbs = Math.max(...ordenados.map((e) => Math.abs(e.residuo))) * 1.25 || 1;
  const nMax = Math.max(...ordenados.map((e) => e.ordemExecucao));
  const px = (o) => L + ((o - 0.5) / nMax) * pw;
  const py = (v) => Topo + ph / 2 - (v / maxAbs) * (ph / 2);

  for (const v of ticksBonitos(-maxAbs, maxAbs, 5)) {
    if (Math.abs(v) > maxAbs) continue;
    el('line', { x1: L, y1: py(v), x2: L + pw, y2: py(v), stroke: v === 0 ? T.axis : T.grid, 'stroke-width': 1 }, svg);
    const t = el('text', { x: L - 8, y: py(v), 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 11.5, fill: T.muted, style: 'font-variant-numeric:tabular-nums' }, svg);
    t.textContent = fmt(v, 2);
  }
  for (const o of ticksBonitos(1, nMax, 5)) {
    if (o < 1 || o > nMax) continue;
    const t = el('text', { x: px(o), y: Topo + ph + 17, 'text-anchor': 'middle', 'font-size': 11.5, fill: T.muted, style: 'font-variant-numeric:tabular-nums' }, svg);
    t.textContent = String(Math.round(o));
  }

  for (const e of ordenados) {
    const x = px(e.ordemExecucao), y = py(e.residuo);
    el('line', { x1: x, y1: py(0), x2: x, y2: y, stroke: T.axis, 'stroke-width': 1 }, svg);
    el('circle', { cx: x, cy: y, r: 5, fill: T.serie1, stroke: T.surface, 'stroke-width': 2 }, svg);
    areaSensivel(svg, x, y, 5, (ev) => {
      const rc = container.getBoundingClientRect();
      tip.mostrar(
        `<strong>${e.id}</strong> (ensaio nº ${e.ordemExecucao})<br>medido: ${fmt(e.resposta)}<br>previsto: ${fmt(e.previsto)}<br>diferença: ${fmt(e.residuo)}`,
        ev.clientX - rc.left, ev.clientY - rc.top
      );
    }, () => tip.esconder());
  }

  const ex = el('text', { x: L + pw / 2, y: H - 16, 'text-anchor': 'middle', 'font-size': 12.5, fill: T.textSecondary }, svg);
  ex.textContent = 'Ordem de execução do ensaio';
  const ey = el('text', { x: 16, y: Topo + ph / 2, 'text-anchor': 'middle', 'font-size': 12.5, fill: T.textSecondary, transform: `rotate(-90 16 ${Topo + ph / 2})` }, svg);
  ey.textContent = `Medido − previsto (${meta.resposta.unidade || ''})`;
  return svg;
}
