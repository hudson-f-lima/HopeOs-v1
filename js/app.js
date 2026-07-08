import { loadConfig } from './api.js';
import { 
  state, 
  stateBus, 
  loadCatalog, 
  loadWeekAgenda 
} from './state.js';
import { 
  centsToBRL, 
  openModal, 
  closeModal 
} from './utils.js';
import { FuzzyField } from './components/fuzzy-field.js';
import { initAgenda, updateNovoAgendamentoPreview } from './ui/agenda.js';
import { initCheckout } from './ui/checkout.js';
import { initDashboard, atualizarDashboard } from './ui/dashboard.js';
import { 
  initCadastros, 
  renderClientesList, 
  renderServicosList, 
  renderProfissionaisList, 
  renderProdutosList, 
  renderFormasList 
} from './ui/cadastros.js';

export function showTab(name) {
  state.activeTab = name;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById('tab-' + name);
  if (target) target.classList.remove('hidden');
  
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
  const fab = document.getElementById('fab');
  if (fab) fab.classList.toggle('hidden', name !== 'agenda');
}

export function showSubtab(name) {
  document.querySelectorAll('.subtab-content').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById('subtab-' + name);
  if (target) target.classList.remove('hidden');
  
  document.querySelectorAll('.subtab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.subtab === name));
}

function showFatalError() {
  const loading = document.getElementById('loadingScreen');
  const app = document.getElementById('appRoot');
  const fatal = document.getElementById('fatalError');
  if (loading) loading.classList.add('hidden');
  if (app) app.classList.add('hidden');
  if (fatal) fatal.classList.remove('hidden');
}

async function init() {
  const loadingMessage = document.getElementById('loadingMessage') || document.querySelector('#loadingScreen div:last-child');
  const slowBootTimer = setTimeout(() => {
    if (loadingMessage) loadingMessage.textContent = 'Conectando ao servidor... isso pode levar alguns segundos.';
  }, 3500);

  // Navigation tabs
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });
  
  document.getElementById('navAvatar').addEventListener('click', () => openModal('sheetGestao'));
  document.getElementById('btnFecharGestao').addEventListener('click', () => closeModal('sheetGestao'));
  
  // FAB (New Appointment)
  const fab = document.getElementById('fab');
  if (fab) {
    fab.addEventListener('click', () => {
      // Trigger new agendamento modal opening via stateBus or custom event
      const date = state.selectedDay || new Date().toISOString().slice(0, 10);
      state.fuzzyAgCliente.clear();
      state.fuzzyAgServico.setItems(state.catalog.servicos.filter(s => s.ativo !== false));
      state.fuzzyAgServico.clear();
      state.fuzzyAgProfissional.setItems(state.catalog.profissionais.filter(p => p.ativo !== false));
      state.fuzzyAgProfissional.clear();
      
      document.getElementById('agData').value = date;
      const defaultTime = String(new Date().getHours()).padStart(2, '0') + ':00';
      document.getElementById('agHorario').value = defaultTime;
      updateNovoAgendamentoPreview();
      openModal('modalNovoAgendamento');
    });
  }

  // Gestao subtabs
  document.getElementById('subtabRow').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-subtab]');
    if (!btn) return;
    showSubtab(btn.dataset.subtab);
  });

  // Initialize UI sub-modules
  initAgenda();
  initCheckout();
  initDashboard();
  initCadastros();

  try {
    await loadConfig();
    await loadCatalog();

    renderClientesList();
    renderServicosList();
    renderProfissionaisList();
    renderProdutosList();
    renderFormasList();

    // Instantiate Fuzzy Fields and store them in the global state
    state.fuzzyCliente = new FuzzyField('coCliente', state.catalog.clientes, {
      labelFn: c => c.nome,
      valueFn: c => c.id,
      onSelect: () => { state.agendamentoIdParaCheckout = null; }
    });

    state.fuzzyServico = new FuzzyField('coServico', state.catalog.servicos.filter(s => s.ativo !== false), {
      labelFn: s => `${s.nome} (${centsToBRL(s.valor_centavos)})`,
      valueFn: s => s.id,
      onSelect: () => {}
    });

    state.fuzzyProduto = new FuzzyField('coProduto', (state.catalog.produtos || []).filter(p => p.ativo !== false), {
      labelFn: p => `${p.nome} (${centsToBRL(p.preco_venda_centavos)})`,
      valueFn: p => p.id,
      onSelect: () => {}
    });

    state.fuzzyProfissional = new FuzzyField('coProfissional', state.catalog.profissionais.filter(p => p.ativo !== false), {
      labelFn: p => p.nome,
      valueFn: p => p.id,
      onSelect: () => {}
    });

    state.fuzzyForma = new FuzzyField('coForma', state.catalog.formas_pagamento.filter(f => f.ativo !== false), {
      labelFn: f => f.label,
      valueFn: f => f.code,
      onSelect: () => {}
    });

    // Fuzzy search fields (modal novo agendamento) with cross-filtering
    state.fuzzyAgCliente = new FuzzyField('agCliente', state.catalog.clientes, {
      labelFn: c => c.nome,
      valueFn: c => c.id,
      onSelect: () => {}
    });

    state.fuzzyAgServico = new FuzzyField('agServico', state.catalog.servicos.filter(s => s.ativo !== false), {
      labelFn: s => `${s.nome} (${centsToBRL(s.valor_centavos)})`,
      valueFn: s => s.id,
      onSelect: (servicoId) => {
        const links = state.catalog.profissional_servicos || [];
        const linkedProfIds = links.filter(l => l.servico_id === servicoId).map(l => l.profissional_id);
        state.fuzzyAgProfissional.setItems(state.catalog.profissionais.filter(p => p.ativo !== false && linkedProfIds.includes(p.id)));
        updateNovoAgendamentoPreview();
      }
    });

    state.fuzzyAgProfissional = new FuzzyField('agProfissional', state.catalog.profissionais.filter(p => p.ativo !== false), {
      labelFn: p => p.nome,
      valueFn: p => p.id,
      onSelect: (profissionalId) => {
        const links = state.catalog.profissional_servicos || [];
        const linkedServiceIds = links.filter(l => l.profissional_id === profissionalId).map(l => l.servico_id);
        state.fuzzyAgServico.setItems(state.catalog.servicos.filter(s => s.ativo !== false && linkedServiceIds.includes(s.id)));
      }
    });

    // Fuzzy search fields (modal reagendar) with cross-filtering
    state.fuzzyReNovoServico = new FuzzyField('reNovoServico', state.catalog.servicos.filter(s => s.ativo !== false), {
      labelFn: s => `${s.nome} (${centsToBRL(s.valor_centavos)})`,
      valueFn: s => s.id,
      onSelect: (servicoId) => {
        const links = state.catalog.profissional_servicos || [];
        const linkedProfIds = links.filter(l => l.servico_id === servicoId).map(l => l.profissional_id);
        state.fuzzyReNovoProfissional.setItems(state.catalog.profissionais.filter(p => p.ativo !== false && linkedProfIds.includes(p.id)));
      }
    });

    state.fuzzyReNovoProfissional = new FuzzyField('reNovoProfissional', state.catalog.profissionais.filter(p => p.ativo !== false), {
      labelFn: p => p.nome,
      valueFn: p => p.id,
      onSelect: (profissionalId) => {
        const links = state.catalog.profissional_servicos || [];
        const linkedServiceIds = links.filter(l => l.profissional_id === profissionalId).map(l => l.servico_id);
        state.fuzzyReNovoServico.setItems(state.catalog.servicos.filter(s => s.ativo !== false && linkedServiceIds.includes(s.id)));
      }
    });

    // Parallel loading of week agenda and dashboard update (Vercel Best Practice)
    await Promise.all([
      loadWeekAgenda(),
      atualizarDashboard()
    ]);
  } catch (err) {
    console.error('Falha ao inicializar:', err);
    clearTimeout(slowBootTimer);
    showFatalError();
    return;
  }

  clearTimeout(slowBootTimer);

  const loading = document.getElementById('loadingScreen');
  const root = document.getElementById('appRoot');
  if (loading) loading.classList.add('hidden');
  if (root) root.classList.remove('hidden');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => {});
  }
}

// Listen to Tab Change event from event bus
stateBus.addEventListener('tab:change', (e) => {
  showTab(e.detail);
});

// Run
init();
