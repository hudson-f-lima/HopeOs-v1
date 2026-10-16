import { loadConfig, getSession, getToken, setToken, login, logout, fetchMe, selectEmpresa } from './api.js';
import { 
  state, 
  stateBus, 
  loadCatalog, 
  loadWeekAgenda,
  sessionRoleIn
} from './state.js';
import { 
  centsToBRL, 
  openModal, 
  closeModal,
  escapeHtml
} from './utils.js';
import { FuzzyField } from './components/fuzzy-field.js';
import { initAgenda, updateNovoAgendamentoPreview, refreshAgendaSlots } from './ui/agenda.js';
import { initCheckout, onServicoSelected } from './ui/checkout.js';
import { initDashboard, atualizarDashboard } from './ui/dashboard.js';
import {
  initCadastros,
  renderClientesList,
  renderServicosList,
  renderProfissionaisList,
  renderProdutosList,
  renderFormasList,
  renderListaEsperaList,
  openListaEsperaModal
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

const ROLE_LABEL = { admin: 'Admin', gestor: 'Gestão', recepcao: 'Recepção', profissional: 'Profissional' };

function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }

// Tela de login: resolve quando o login dá certo (ou quando o usuário opta pelo token legado).
function runLogin(mensagem) {
  hide('loadingScreen'); hide('appRoot'); hide('fatalError'); show('loginScreen');
  const form = document.getElementById('loginForm');
  const erro = document.getElementById('loginErro');
  const btn = document.getElementById('btnLogin');
  erro.textContent = mensagem || '';
  return new Promise(resolve => {
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const senha = document.getElementById('loginSenha').value;
      if (!email || !senha) { erro.textContent = 'Informe e-mail e senha.'; return; }
      btn.disabled = true; btn.textContent = 'Entrando…'; erro.textContent = '';
      try {
        await login(email, senha);
        document.getElementById('loginSenha').value = '';
        resolve('user');
      } catch (err) {
        erro.textContent = err.status === 401 ? 'E-mail ou senha incorretos.' : (err.message || 'Não foi possível entrar.');
      } finally {
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    };
    document.getElementById('btnTokenLegado').onclick = () => {
      const token = window.prompt('Token de acesso da API:');
      if (token && token.trim()) { setToken(token.trim()); resolve('legacy'); }
    };
  });
}

function escolherEmpresa(empresas) {
  const box = document.getElementById('loginEmpresas');
  hide('loadingScreen'); hide('appRoot'); show('loginScreen');
  document.getElementById('loginErro').textContent = 'Escolha a empresa:';
  box.innerHTML = empresas.map(e => `<button type="button" class="btn" data-empresa="${escapeHtml(e.empresa_id)}">${escapeHtml(e.nome || e.empresa_id)} · ${escapeHtml(ROLE_LABEL[e.role] || e.role)}</button>`).join('');
  show('loginEmpresas');
  return new Promise(resolve => {
    box.onclick = (ev) => {
      const b = ev.target.closest('[data-empresa]');
      if (!b) return;
      hide('loginEmpresas');
      resolve(empresas.find(e => e.empresa_id === b.dataset.empresa));
    };
  });
}

// Contexto da sessão: quem é, em qual empresa e com qual papel (só para a UI).
async function carregarSessao() {
  if (!getSession()) {
    state.session = { principal: 'legacy', role: null };
    return;
  }
  const me = await fetchMe();
  const empresas = me.empresas || [];
  if (!empresas.length) {
    await logout();
    throw Object.assign(new Error('Sua conta ainda não tem acesso a nenhuma empresa. Peça ao administrador.'), { name: 'NoAccessError' });
  }
  let atual = empresas.find(e => e.empresa_id === getSession().empresa_id);
  if (!atual) atual = empresas.length === 1 ? empresas[0] : await escolherEmpresa(empresas);
  selectEmpresa(atual.empresa_id);
  state.session = { principal: 'user', nome: me.user.nome, email: me.user.email, role: atual.role, empresa_id: atual.empresa_id, empresas };
  hide('loginScreen');
}

function aplicarSessaoNaUI() {
  const s = state.session;
  if (s && s.principal === 'user') {
    document.getElementById('sessionLabel').textContent = `${s.nome} · ${ROLE_LABEL[s.role] || s.role}`;
    show('sessionChip');
  }
  // Dashboard é relatório operacional/gerencial: profissional não tem acesso no backend.
  if (!sessionRoleIn('admin', 'gestor', 'recepcao')) hide('navDashboard');
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
  document.getElementById('btnAbrirListaEspera')?.addEventListener('click', openListaEsperaModal);
  
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
      refreshAgendaSlots();
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

  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await logout();
    window.location.reload();
  });

  try {
    await loadConfig();
    if (!getSession() && !getToken()) await runLogin();
    await carregarSessao();
    aplicarSessaoNaUI();
    await loadCatalog();

    renderClientesList();
    renderServicosList();
    renderProfissionaisList();
    renderProdutosList();
    renderFormasList();
    renderListaEsperaList();

    // Instantiate Fuzzy Fields and store them in the global state
    state.fuzzyCliente = new FuzzyField('coCliente', state.catalog.clientes, {
      labelFn: c => c.nome,
      valueFn: c => c.id,
      onSelect: () => { state.agendamentoIdParaCheckout = null; }
    });

    state.fuzzyServico = new FuzzyField('coServico', state.catalog.servicos.filter(s => s.ativo !== false), {
      labelFn: s => `${s.nome} (${centsToBRL(s.valor_centavos)})`,
      valueFn: s => s.id,
      onSelect: (servicoId) => { onServicoSelected(servicoId); }
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
        refreshAgendaSlots();
      }
    });

    state.fuzzyAgProfissional = new FuzzyField('agProfissional', state.catalog.profissionais.filter(p => p.ativo !== false), {
      labelFn: p => p.nome,
      valueFn: p => p.id,
      onSelect: (profissionalId) => {
        const links = state.catalog.profissional_servicos || [];
        const linkedServiceIds = links.filter(l => l.profissional_id === profissionalId).map(l => l.servico_id);
        state.fuzzyAgServico.setItems(state.catalog.servicos.filter(s => s.ativo !== false && linkedServiceIds.includes(s.id)));
        refreshAgendaSlots();
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

    // Fuzzy search fields (modal lista de espera, F4.4)
    state.fuzzyLeCliente = new FuzzyField('leCliente', state.catalog.clientes, {
      labelFn: c => c.nome,
      valueFn: c => c.id,
      onSelect: () => {}
    });

    state.fuzzyLeServico = new FuzzyField('leServico', state.catalog.servicos.filter(s => s.ativo !== false), {
      labelFn: s => `${s.nome} (${centsToBRL(s.valor_centavos)})`,
      valueFn: s => s.id,
      onSelect: () => {}
    });

    state.fuzzyLeProfissional = new FuzzyField('leProfissional', state.catalog.profissionais.filter(p => p.ativo !== false), {
      labelFn: p => p.nome,
      valueFn: p => p.id,
      onSelect: () => {}
    });

    // Parallel loading of week agenda and dashboard update (Vercel Best Practice)
    await Promise.all([
      loadWeekAgenda(),
      sessionRoleIn('admin', 'gestor', 'recepcao') ? atualizarDashboard() : Promise.resolve()
    ]);
  } catch (err) {
    console.error('Falha ao inicializar:', err);
    clearTimeout(slowBootTimer);
    
    // Credencial inválida/expirada ou conta sem acesso: volta para o login.
    if (err.name === 'AuthError' || err.name === 'NoAccessError') {
      setToken(null);
      await runLogin(err.name === 'NoAccessError' ? err.message : 'Sua sessão expirou. Entre novamente.');
      window.location.reload();
      return;
    }
    
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
