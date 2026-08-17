/**
 * main.js — estado da aplicação, navegação e ligação dos eventos.
 *
 * Uma única tela por vez, redesenhada inteira a cada transição. Para um
 * aplicativo deste tamanho isso é mais simples de acompanhar do que
 * atualização incremental, e elimina toda uma classe de bugs de sincronismo
 * entre o que está na tela e o que está no estado.
 */

import { criarPlanejamento, analisarResultados, CONFIG_PADRAO } from './core/pipeline.js';
import {
  gerarModeloEntrada, gerarPlanilhaEnsaios, gerarPlanilhaResultados,
  lerArquivo, identificarArquivo, lerModeloPreenchido, lerEnsaiosPreenchidos,
  baixarLivro, nomeArquivo,
} from './io/excel.js';
import { baixarLatex } from './io/latex.js';
import { telaInicio, telaDefinir, telaPlano, telaAnalise, listaErros, caixaAviso } from './ui/views.js';
import { plotarSuperficie, plotarEfeitos, plotarObservadoPrevisto, plotarResiduos } from './ui/plot.js';

const CHAVE_RASCUNHO = 'doe:rascunho:v1';

const estado = {
  tela: 'inicio',
  spec: null,
  meta: null,
  ensaios: null,
  diagnostico: null,
  analise: null,
  erros: [],
  avisos: [],
  avancadoAberto: false,
};

const app = () => document.getElementById('app');
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// ── navegação ────────────────────────────────────────────────────────────

function irPara(tela, { limparMensagens = true } = {}) {
  if (limparMensagens) { estado.erros = []; estado.avisos = []; }
  estado.tela = tela;
  renderizar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderizar() {
  const alvo = app();
  switch (estado.tela) {
    case 'definir': alvo.innerHTML = telaDefinir(estado); ligarDefinir(); break;
    case 'plano': alvo.innerHTML = telaPlano(estado); break;
    case 'analise': alvo.innerHTML = telaAnalise(estado); ligarAnalise(); break;
    default: alvo.innerHTML = telaInicio(); break;
  }
  atualizarBotaoRascunho();
}

// ── tela: definir ────────────────────────────────────────────────────────

function ligarDefinir() {
  $('#resp-objetivo')?.addEventListener('change', (e) => {
    $('#campo-alvo')?.classList.toggle('oculto', e.target.value !== 'alvo');
  });

  $('#add-fator')?.addEventListener('click', () => {
    const spec = coletarFormulario();
    if (spec.fatores.length >= 4) {
      estado.erros = ['A ferramenta trabalha com no máximo 4 condições ao mesmo tempo. Com mais que isso o número de ensaios cresce rápido demais para um laboratório didático.'];
      estado.spec = spec;
      renderizar();
      return;
    }
    spec.fatores.push({ nome: '', unidade: '', min: '', max: '' });
    estado.spec = spec;
    estado.avancadoAberto = $('.avancado')?.hasAttribute('open') ?? false;
    renderizar();
  });

  $$('[data-remover-fator]').forEach((b) => b.addEventListener('click', () => {
    const spec = coletarFormulario();
    spec.fatores.splice(Number(b.dataset.removerFator), 1);
    estado.spec = spec;
    estado.avancadoAberto = $('.avancado')?.hasAttribute('open') ?? false;
    renderizar();
  }));

  $('#gerar-plano')?.addEventListener('click', () => {
    estado.spec = coletarFormulario();
    estado.avancadoAberto = $('.avancado')?.hasAttribute('open') ?? false;
    gerarPlanejamento(estado.spec);
  });
}

/** Lê a tela de volta para um objeto de especificação. */
function coletarFormulario() {
  const val = (sel) => $(sel)?.value?.trim() ?? '';
  const numero = (sel) => {
    const v = $(sel)?.value;
    return v === '' || v === undefined ? '' : Number(v);
  };

  const fatores = $$('[data-linha-fator]').map((tr) => ({
    nome: $('[data-campo="nome"]', tr).value.trim(),
    unidade: $('[data-campo="unidade"]', tr).value.trim(),
    min: $('[data-campo="min"]', tr).value === '' ? '' : Number($('[data-campo="min"]', tr).value),
    max: $('[data-campo="max"]', tr).value === '' ? '' : Number($('[data-campo="max"]', tr).value),
  }));

  const objetivo = val('#resp-objetivo') || 'maximizar';
  return {
    experimento: { nome: val('#exp-nome'), grupo: val('#exp-grupo'), data: new Date().toLocaleDateString('pt-BR') },
    resposta: {
      nome: val('#resp-nome'), unidade: val('#resp-unidade'), objetivo,
      ...(objetivo === 'alvo' ? { alvo: numero('#resp-alvo') } : {}),
    },
    fatores,
    config: {
      pontosCentrais: Number($('#cfg-centrais')?.value || CONFIG_PADRAO.pontosCentrais),
      tipoAlpha: $('#cfg-alpha')?.value || CONFIG_PADRAO.tipoAlpha,
    },
  };
}

function gerarPlanejamento(spec) {
  try {
    const { meta, ensaios, diagnostico } = criarPlanejamento(spec);
    Object.assign(estado, { meta, ensaios, diagnostico, analise: null });
    salvarRascunho();
    irPara('plano');
  } catch (e) {
    estado.erros = e.erros || [e.message];
    estado.tela = 'definir';
    renderizar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ── tela: análise ────────────────────────────────────────────────────────

function ligarAnalise() {
  $$('.aba').forEach((b) => b.addEventListener('click', () => {
    $$('.aba').forEach((x) => x.classList.remove('ativa'));
    b.classList.add('ativa');
    $$('[data-painel]').forEach((p) => p.classList.toggle('oculto', p.dataset.painel !== b.dataset.aba));
  }));

  desenharGraficos();

  const ex = $('#eixo-x'), ey = $('#eixo-y');
  if (ex && ey) {
    const aoTrocar = (mudou) => {
      // Dois eixos não podem mostrar o mesmo fator: empurra o outro.
      if (ex.value === ey.value) {
        const outro = mudou === ex ? ey : ex;
        const livre = [...outro.options].map((o) => o.value).find((v) => v !== mudou.value);
        if (livre !== undefined) outro.value = livre;
      }
      desenharSuperficie();
    };
    ex.addEventListener('change', () => aoTrocar(ex));
    ey.addEventListener('change', () => aoTrocar(ey));
  }
}

function desenharSuperficie() {
  const alvo = $('#graf-superficie');
  if (!alvo || !estado.analise) return;
  const iX = Number($('#eixo-x')?.value ?? 0);
  const iY = Number($('#eixo-y')?.value ?? 1);
  plotarSuperficie(alvo, estado.analise, { iX, iY });

  const nota = $('#nota-fixos');
  if (nota) {
    const { meta, otimo } = estado.analise;
    const fixos = meta.fatores
      .map((f, j) => ({ f, j }))
      .filter(({ j }) => j !== iX && j !== iY)
      .map(({ f, j }) => `${f.nome} = ${Number(otimo.recomendado.reais[j].toFixed(f.casasDecimais ?? 2)).toLocaleString('pt-BR')} ${f.unidade || ''}`.trim());
    nota.textContent = fixos.length
      ? `Corte feito com ${fixos.join(' e ')} — os valores da condição recomendada.`
      : '';
  }
}

function desenharGraficos() {
  if (!estado.analise) return;
  try {
    desenharSuperficie();
    plotarEfeitos($('#graf-efeitos'), estado.analise);
    plotarObservadoPrevisto($('#graf-obsprev'), estado.analise);
    plotarResiduos($('#graf-residuos'), estado.analise);
  } catch (e) {
    console.error('Falha ao desenhar os gráficos:', e);
  }
}

// ── arquivos ─────────────────────────────────────────────────────────────

function pedirArquivo(modo) {
  const input = $('#entrada-arquivo');
  input.dataset.modo = modo;
  input.value = '';
  input.click();
}

async function processarArquivo(arquivo, modo) {
  if (!arquivo) return;
  try {
    const buffer = await arquivo.arrayBuffer();
    const wb = lerArquivo(new Uint8Array(buffer));
    const tipo = identificarArquivo(wb);

    if (tipo === 'ensaios' || (modo === 'analise' && tipo !== 'modelo')) {
      const { meta, ensaios, erros, avisos } = lerEnsaiosPreenchidos(wb);
      if (erros.length) return mostrarErros(erros, avisos);
      const analise = analisarResultados(meta, ensaios);
      Object.assign(estado, { meta, ensaios, analise, avisos });
      salvarRascunho();
      irPara('analise', { limparMensagens: false });
      estado.avisos = avisos;
      return;
    }

    if (tipo === 'modelo') {
      const { spec, erros, avisos } = lerModeloPreenchido(wb);
      if (erros.length) {
        estado.spec = spec;
        estado.erros = erros;
        estado.avisos = avisos;
        estado.tela = 'definir';
        renderizar();
        return;
      }
      estado.spec = spec;
      estado.avisos = avisos;
      gerarPlanejamento(spec);
      return;
    }

    mostrarErros([
      'Não reconheci este arquivo. Envie o modelo de Excel preenchido (para criar um planejamento) ou a planilha de ensaios com os resultados (para analisar).',
    ]);
  } catch (e) {
    mostrarErros([`Não consegui ler o arquivo: ${e.message}`]);
  }
}

function mostrarErros(erros, avisos = []) {
  estado.erros = erros;
  estado.avisos = avisos;
  const alvo = app();
  const banner = document.createElement('div');
  banner.innerHTML = listaErros(erros) + avisos.map((a) => caixaAviso('atencao', a)).join('');
  alvo.prepend(banner);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── rascunho local ───────────────────────────────────────────────────────

/**
 * Guarda o trabalho em andamento no navegador. O arquivo Excel continua sendo
 * a forma de levar os dados adiante; isto só evita perder tudo se alguém
 * fechar a aba antes de baixar.
 */
function salvarRascunho() {
  try {
    localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({
      salvoEm: Date.now(),
      meta: estado.meta,
      ensaios: estado.ensaios,
      diagnostico: estado.diagnostico,
      temAnalise: !!estado.analise,
    }));
  } catch { /* modo privativo ou cota cheia: seguir sem rascunho */ }
}

function lerRascunho() {
  try {
    const bruto = localStorage.getItem(CHAVE_RASCUNHO);
    if (!bruto) return null;
    const r = JSON.parse(bruto);
    return r?.meta && r?.ensaios ? r : null;
  } catch { return null; }
}

function atualizarBotaoRascunho() {
  const botao = $('#retomar');
  if (!botao) return;
  const r = lerRascunho();
  const mostrar = !!r && estado.tela === 'inicio';
  botao.classList.toggle('oculto', !mostrar);
  if (mostrar) botao.title = `Salvo em ${new Date(r.salvoEm).toLocaleString('pt-BR')}`;
}

function retomarRascunho() {
  const r = lerRascunho();
  if (!r) return;
  Object.assign(estado, { meta: r.meta, ensaios: r.ensaios, diagnostico: r.diagnostico });
  if (r.temAnalise) {
    try {
      estado.analise = analisarResultados(r.meta, r.ensaios);
      return irPara('analise');
    } catch { /* segue para a tela de plano */ }
  }
  irPara('plano');
}

// ── tema ─────────────────────────────────────────────────────────────────

function aplicarTema(tema) {
  if (tema === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', tema);
  localStorage.setItem('doe:tema', tema);
  const b = $('#alternar-tema');
  if (b) b.textContent = tema === 'dark' ? '☀' : tema === 'light' ? '☾' : '◐';
  if (estado.tela === 'analise') desenharGraficos();
}

// ── ligação global ───────────────────────────────────────────────────────

document.addEventListener('click', (ev) => {
  const alvo = ev.target.closest('[data-ir], [data-baixar-modelo], [data-abrir-arquivo], [data-baixar-ensaios], [data-baixar-resultados], [data-baixar-latex]');
  if (!alvo) return;

  if (alvo.dataset.ir) return irPara(alvo.dataset.ir);
  if (alvo.hasAttribute('data-abrir-arquivo')) return pedirArquivo(alvo.dataset.abrirArquivo);

  if (alvo.hasAttribute('data-baixar-modelo')) {
    return baixarLivro(gerarModeloEntrada(), 'modelo-experimento-doe.xlsx');
  }
  if (alvo.hasAttribute('data-baixar-ensaios') && estado.meta) {
    return baixarLivro(
      gerarPlanilhaEnsaios(estado.meta, estado.ensaios, estado.diagnostico),
      nomeArquivo('ensaios', estado.meta.experimento.nome)
    );
  }
  if (alvo.hasAttribute('data-baixar-resultados') && estado.analise) {
    return baixarLivro(
      gerarPlanilhaResultados(estado.analise),
      nomeArquivo('resultados', estado.meta.experimento.nome)
    );
  }
  if (alvo.hasAttribute('data-baixar-latex') && estado.analise) {
    return baixarLatex(estado.analise, nomeArquivo('tabelas', estado.meta.experimento.nome, 'tex'));
  }
});

function iniciar() {
  document.body.insertAdjacentHTML('beforeend',
    '<input type="file" id="entrada-arquivo" accept=".xlsx,.xls" class="oculto">');

  $('#entrada-arquivo').addEventListener('change', (ev) => {
    processarArquivo(ev.target.files[0], ev.target.dataset.modo);
  });

  // Arrastar e soltar em qualquer lugar da página.
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (ev) => {
    if (![...(ev.dataTransfer?.types || [])].includes('Files')) return;
    ev.preventDefault();
    document.body.classList.add('arrastando');
  }));
  document.addEventListener('dragleave', (ev) => {
    if (ev.relatedTarget === null) document.body.classList.remove('arrastando');
  });
  document.addEventListener('drop', (ev) => {
    if (!ev.dataTransfer?.files?.length) return;
    ev.preventDefault();
    document.body.classList.remove('arrastando');
    processarArquivo(ev.dataTransfer.files[0], 'qualquer');
  });

  $('#alternar-tema')?.addEventListener('click', () => {
    const atual = localStorage.getItem('doe:tema') || 'auto';
    aplicarTema({ auto: 'light', light: 'dark', dark: 'auto' }[atual]);
  });
  $('#retomar')?.addEventListener('click', retomarRascunho);
  $('#recomecar')?.addEventListener('click', () => {
    localStorage.removeItem(CHAVE_RASCUNHO);
    Object.assign(estado, { spec: null, meta: null, ensaios: null, diagnostico: null, analise: null });
    irPara('inicio');
  });

  aplicarTema(localStorage.getItem('doe:tema') || 'auto');
  renderizar();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
