// Anti-clickjacking (D-052): o GitHub Pages não envia X-Frame-Options/frame-ancestors. Se o app for
// aberto dentro de um iframe de outro site, some e tenta abrir na janela de cima.
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try { window.top.location = window.location.href; } catch (_) { /* outro domínio: fica oculto */ }
}
import {
  authFeatures, AuthError, StaleContextError, loadConfig, getSession, login, logout, fetchMe,
  aceitarPrivacidade, selectEmpresa, consumeAuthLink, pendingPassword, definirSenha, recuperarSenha,
  onAuthContextChanged, openOAuth, requestEmailAccess, verifyEmailCode
} from './api.js';
import { readAuthStorage, writeAuthStorage } from './auth-storage.js';
import { state, stateBus, loadCatalog, loadWeekAgenda, sessionPode } from './state.js';
import { 
  centsToBRL, 
  openModal, 
  closeModal,
  escapeHtml,
  getInitials,
  normalizeSearchText,
  overlayDoTopo,
  showBanner
} from './utils.js';
import { FuzzyField } from './components/fuzzy-field.js';
import { initAgenda, updateNovoAgendamentoPreview, refreshAgendaSlots, avisarReguaCliente } from './ui/agenda.js';
import { initCheckout, onServicoSelected, onCheckoutFieldChanged } from './ui/checkout.js';
import { initComandas, abrirComandas } from './ui/comandas.js';
import { initDashboard, atualizarDashboard } from './ui/dashboard.js';
import { initCockpit, atualizarCockpit } from './ui/cockpit.js';
import { initDesempenho, atualizarAcessoDesempenho, fecharDesempenho } from './ui/desempenhoSalao.js';
import {
  initCadastros,
  openListaEsperaModal
} from './ui/cadastros.js';
import { initEquipe } from './ui/equipe.js';
import { initComissoes } from './ui/comissoes.js';
import { initGanhos, abrirMetas, podeVerMetasGanhos } from './ui/ganhos.js';
import { initTema } from './ui/tema.js';
import { initPermissoes } from './ui/permissoes.js';
import { initEscalas } from './ui/escalas.js';
import { initAgendamentoOnline } from './ui/agendamentoOnline.js';
import { initRegrasAgenda } from './ui/regrasAgenda.js';
import { initPlanos } from './ui/planos.js';
import { initAssinantes } from './ui/assinantes.js';
import { initAgora } from './ui/agora.js';
import { initLembretes } from './ui/lembretes.js';
import { initOnlineNovos } from './ui/onlineNovos.js';
import { initSeries } from './ui/series.js';
import { initAtendimento } from './ui/atendimento.js';
import { initCaixa, atualizarCaixa } from './ui/caixa.js';
import { initEstorno, atualizarComandasEstorno, podeEstornar } from './ui/estorno.js';
import { talvezAbrirOnboarding, abrirOnboarding } from './ui/onboarding.js';

const tabScroll = new Map();

export function showTab(name, { abrirLista = true } = {}) {
  const target = document.getElementById('tab-' + name);
  if (!target) return;
  const anterior = state.activeTab;
  if (anterior === 'dashboard' && name !== 'dashboard') fecharDesempenho();
  if (anterior !== name) tabScroll.set(anterior, window.scrollY);
  state.activeTab = name;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.toggle('hidden', el !== target));
  // Abrir o Dashboard busca os números de novo: outra pessoa pode ter fechado comanda
  // ou caixa em outro aparelho, e as pendências do topo precisam estar em dia.
  if (name === 'metas' && anterior !== 'metas' && state.session && podeVerMetasGanhos()) abrirMetas();
  if (name === 'dashboard' && anterior !== 'dashboard' && state.session && sessionPode('painel:operacional')) {
    atualizarAcessoDesempenho();
    atualizarDashboard();
    atualizarCockpit();
    if (sessionPode('caixa:conferir')) atualizarCaixa();
    if (document.getElementById('dobraComandas').open && podeEstornar()) atualizarComandasEstorno();
  }
  if (name === 'checkout' && anterior !== 'checkout' && abrirLista) abrirComandas();
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    const current = btn.dataset.tab === name;
    btn.classList.toggle('active', current);
    if (current) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  if (name !== 'dashboard') hide('btnVoltarGestao');
  const fab = document.getElementById('fab');
  if (fab) fab.classList.toggle('hidden', name !== 'agenda');
  if (anterior !== name) window.scrollTo(0, tabScroll.get(name) || 0);
}

function filtrarGestao() {
  const input = document.getElementById('buscaGestao');
  const termos = normalizeSearchText(input.value).trim().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const grupo of document.querySelectorAll('.gestao-grupo')) {
    const titulo = grupo.querySelector('h3').textContent;
    let resultados = 0;
    for (const botao of grupo.querySelectorAll('.gestao-atalho')) {
      const texto = normalizeSearchText(`${titulo} ${botao.textContent} ${botao.dataset.termos || ''}`);
      botao.hidden = !termos.every(termo => texto.includes(termo));
      if (!botao.hidden && !botao.classList.contains('hidden')) resultados++;
    }
    grupo.hidden = !resultados;
    total += resultados;
  }
  document.getElementById('gestaoSemResultados').classList.toggle('hidden', total > 0);
  if (!termos.length) document.getElementById('navGestao').classList.toggle('hidden', total === 0);
}

function initNavegacao() {
  const conta = document.getElementById('sheetConta');
  const avatar = document.getElementById('navAvatar');
  const gestao = document.getElementById('sheetGestao');
  const caixaGestao = gestao.querySelector('.sheet-box');
  const app = document.getElementById('appRoot');
  const tituloDetalhe = document.getElementById('gestaoDetalheTitulo');
  const fecharGestao = document.getElementById('btnFecharGestao');
  const voltarMetas = document.getElementById('btnVoltarMetas');
  const metas = document.getElementById('navMetas');
  const caixa = document.getElementById('gestaoCaixa');
  const gestaoScroll = new Map();
  let atalhoDetalhe;
  let retornoMetas;

  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'checkout' && state.activeTab === 'checkout') abrirComandas();
      hide('btnVoltarGestao');
      showTab(btn.dataset.tab);
    });
  });

  avatar.addEventListener('click', () => conta.showModal());
  document.getElementById('btnFecharConta').addEventListener('click', () => conta.close());
  metas.addEventListener('click', () => {
    const pessoal = conta.open;
    if (pessoal) conta.close();
    if (state.activeTab !== 'metas') retornoMetas = { tab: state.activeTab, atalho: pessoal ? avatar : metas };
    voltarMetas.classList.toggle('hidden', !retornoMetas);
    showTab('metas');
    document.getElementById('metasTitulo').focus();
  });
  voltarMetas.addEventListener('click', () => {
    if (!retornoMetas) return;
    showTab(retornoMetas.tab);
    retornoMetas.atalho.focus({ preventScroll: true });
    retornoMetas = null;
  });
  caixa.addEventListener('click', () => {
    showTab('dashboard');
    show('btnVoltarGestao');
    const dobra = document.getElementById('dobraCaixa');
    dobra.open = true;
    dobra.querySelector('summary').focus();
  });
  document.getElementById('btnVoltarGestao').addEventListener('click', () => {
    showTab('gestao');
    caixa.focus({ preventScroll: true });
  });

  document.getElementById('buscaGestao').addEventListener('input', filtrarGestao);
  caixaGestao.addEventListener('scroll', () => {
    if (atalhoDetalhe && !gestao.classList.contains('hidden')) gestaoScroll.set(atalhoDetalhe.dataset.subtab, caixaGestao.scrollTop);
  });
  document.getElementById('subtabRow').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-subtab]');
    if (!btn || btn.hidden || btn.classList.contains('hidden')) return;
    const alvo = document.getElementById('subtab-' + btn.dataset.subtab);
    document.querySelectorAll('.subtab-content').forEach(el => el.classList.toggle('hidden', el !== alvo));
    atalhoDetalhe = btn;
    tituloDetalhe.textContent = btn.textContent;
    openModal('sheetGestao');
    app.inert = true;
    caixaGestao.scrollTop = gestaoScroll.get(btn.dataset.subtab) || 0;
    tituloDetalhe.focus({ preventScroll: true });
  });
  const fechar = () => closeModal('sheetGestao');
  fecharGestao.addEventListener('click', fechar);
  gestao.addEventListener('click', ev => { if (ev.target === gestao) fechar(); });
  new MutationObserver(() => {
    if (!gestao.classList.contains('hidden') || !atalhoDetalhe) return;
    app.inert = false;
    atalhoDetalhe.focus({ preventScroll: true });
    atalhoDetalhe = null;
  }).observe(gestao, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Tab' || gestao.classList.contains('hidden') || overlayDoTopo() !== gestao || document.querySelector('dialog[open]')) return;
    const focaveis = [...gestao.querySelectorAll('button, input, select, textarea, a[href], summary')]
      .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
    const primeiro = focaveis[0];
    const ultimo = focaveis.at(-1);
    const atual = document.activeElement;
    if (ev.shiftKey ? atual === primeiro || !focaveis.includes(atual) : atual === ultimo || !gestao.contains(atual)) {
      ev.preventDefault();
      (ev.shiftKey ? ultimo : primeiro)?.focus();
    }
  });
}

const ROLE_LABEL = { admin: 'Admin', gestor: 'Gestão', recepcao: 'Recepção', profissional: 'Profissional' };

function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }

const NOTICE_KEY = 'hopeos.auth.notice';
const noAccess = 'Sua conta ainda não tem acesso a nenhuma empresa. Peça ao administrador.';

function setAuthNotice(message) {
  if (message) writeAuthStorage(NOTICE_KEY, message, true);
}

function getAuthNotice() {
  const message = readAuthStorage(NOTICE_KEY, true);
  writeAuthStorage(NOTICE_KEY, null, true);
  return message;
}

function runLogin(mensagem) {
  hide('loadingScreen'); hide('appRoot'); hide('fatalError'); hide('senhaForm'); hide('empresaCard'); show('loginScreen'); show('loginForm');
  const get = id => document.getElementById(id);
  const form = get('loginForm');
  const erro = get('loginErro');
  const status = get('loginStatus');
  const emailInput = get('loginEmail');
  const senhaInput = get('loginSenha');
  const codeInput = get('loginCodigo');
  const emailAccess = authFeatures.magicLink || authFeatures.otp;
  const alternate = Boolean(emailAccess || authFeatures.google || authFeatures.apple);
  const social = { google: get('btnGoogle'), apple: get('btnApple') };
  const buttons = [...form.querySelectorAll('button')];
  let mode = alternate ? 'email' : 'password';
  let reenable;
  let busy = false;

  function render() {
    get('loginSocial').classList.toggle('hidden', !(authFeatures.google || authFeatures.apple));
    for (const [provider, element] of Object.entries(social)) element.classList.toggle('hidden', !authFeatures[provider]);
    get('loginSenhaCampos').classList.toggle('hidden', mode !== 'password');
    get('btnLinkAcesso').classList.toggle('hidden', !emailAccess || mode === 'password');
    get('btnMostrarCodigo').classList.toggle('hidden', !authFeatures.otp || mode !== 'email');
    get('loginCodigoCampos').classList.toggle('hidden', mode !== 'code');
    get('btnMostrarSenha').classList.toggle('hidden', !alternate || mode === 'password');
    get('btnVoltarAcesso').classList.toggle('hidden', !alternate || mode === 'email');
    get('btnLinkAcesso').textContent = authFeatures.magicLink ? 'Receber link de acesso' : 'Receber código por e-mail';
  }

  function address() {
    if (!emailInput.value.trim() || !emailInput.validity.valid) {
      erro.textContent = 'Informe um e-mail válido.';
      emailInput.focus();
      return null;
    }
    return emailInput.value.trim();
  }

  function report(message) {
    status.textContent = message;
    status.classList.toggle('hidden', !message);
  }

  async function perform(operation) {
    if (busy) return;
    busy = true;
    for (const button of buttons) button.disabled = true;
    erro.textContent = '';
    report('');
    try {
      await operation();
    } catch (error) {
      erro.textContent = error.message || 'Não foi possível continuar. Tente novamente.';
    } finally {
      busy = false;
      for (const button of buttons) button.disabled = false;
      if (reenable > Date.now()) get('btnLinkAcesso').disabled = true;
    }
  }

  erro.textContent = mensagem || '';
  report('');
  render();
  return new Promise(resolve => {
    for (const [provider, button] of Object.entries(social)) button.onclick = () => perform(() => openOAuth(provider));
    get('btnMostrarSenha').onclick = () => {
      mode = 'password';
      render();
      senhaInput.focus();
    };
    get('btnVoltarAcesso').onclick = () => {
      mode = 'email';
      senhaInput.value = '';
      codeInput.value = '';
      render();
      emailInput.focus();
    };
    get('btnMostrarCodigo').onclick = () => {
      mode = 'code';
      render();
      codeInput.focus();
    };
    get('btnLinkAcesso').onclick = () => {
      const email = address();
      if (!email || reenable > Date.now()) return;
      perform(async () => {
        await requestEmailAccess(email);
        if (authFeatures.otp) mode = 'code';
        const method = authFeatures.otp && authFeatures.magicLink
          ? 'o link ou o código' : authFeatures.otp ? 'o código' : 'o link';
        report('Se houver uma conta com esse e-mail, você receberá ' + method + ' de acesso.');
        reenable = Date.now() + 60000;
        setTimeout(() => { if (!busy) get('btnLinkAcesso').disabled = false; }, 60000);
        render();
      });
    };
    const verify = () => {
      const email = address();
      if (!email) return;
      const code = codeInput.value.trim();
      if (!/^\d{6,10}$/.test(code)) {
        erro.textContent = 'Informe o código recebido por e-mail.';
        codeInput.focus();
        return;
      }
      perform(async () => {
        await verifyEmailCode(email, code);
        codeInput.value = '';
        resolve();
      });
    };
    get('btnValidarCodigo').onclick = verify;
    form.onsubmit = (event) => {
      event.preventDefault();
      if (mode === 'code') { verify(); return; }
      if (mode !== 'password') { get('btnLinkAcesso').click(); return; }
      const email = address();
      if (!email) return;
      const password = senhaInput.value;
      if (!password) { erro.textContent = 'Informe sua senha.'; senhaInput.focus(); return; }
      perform(async () => {
        try {
          await login(email, password);
          senhaInput.value = '';
          resolve();
        } catch (error) {
          if (error.status === 401 && !(error instanceof AuthError)) throw new Error('E-mail ou senha incorretos.');
          throw error;
        }
      });
    };
    get('btnEsqueciSenha').onclick = () => {
      const email = address();
      if (!email) return;
      perform(async () => {
        const result = await recuperarSenha(email);
        erro.textContent = result.message;
      });
    };
  });
}

function runDefinirSenha(tipo) {
  hide('loadingScreen'); hide('appRoot'); hide('loginForm'); show('loginScreen'); show('senhaForm');
  const get = id => document.getElementById(id);
  const erro = get('senhaErro');
  const btn = get('btnSalvarSenha');
  const a = get('novaSenha');
  const b = get('novaSenha2');
  get('senhaTitulo').textContent = tipo === 'invite' ? 'Defina sua senha' : 'Redefina sua senha';
  erro.textContent = '';
  get('btnReiniciarSenha').onclick = () => {
    setAuthNotice('Informe seu e-mail e selecione Esqueci minha senha para solicitar outro link.');
    logout();
  };
  get('senhaForm').onsubmit = async (event) => {
    event.preventDefault();
    if (a.value.length < 8) { erro.textContent = 'Use ao menos 8 caracteres.'; return; }
    if (new TextEncoder().encode(a.value).length > 72) { erro.textContent = 'Use até 72 caracteres (menos, se tiver acento ou emoji).'; return; }
    if (a.value !== b.value) { erro.textContent = 'As senhas não conferem.'; return; }
    btn.disabled = true; erro.textContent = '';
    try {
      await definirSenha(a.value);
      a.value = ''; b.value = '';
      setAuthNotice('Senha salva. Entre com a nova senha.');
      await logout();
    } catch (error) {
      erro.textContent = error.code === 'PASSWORD_PROOF_REQUIRED'
        ? 'Este link perdeu a validade. Solicite outro link de recuperação.'
        : error.message || 'Não foi possível salvar a senha.';
    } finally { btn.disabled = false; }
  };
}

function pedirAceitePrivacidade(versao) {
  hide('loadingScreen'); hide('appRoot'); show('loginScreen');
  hide('loginForm'); hide('senhaForm'); show('privacyCard');
  document.getElementById('privacyVersao').textContent = versao;
  const erro = document.getElementById('privacyErro');
  const btn = document.getElementById('btnAceitarPrivacidade');
  erro.textContent = '';
  return new Promise(resolve => {
    document.getElementById('btnRecusarPrivacidade').onclick = () => logout();
    btn.onclick = async () => {
      btn.disabled = true; erro.textContent = '';
      try {
        await aceitarPrivacidade(versao);
        hide('privacyCard'); show('loginForm');
        resolve();
      } catch (err) {
        erro.textContent = err.message || 'Não foi possível registrar o aceite.';
      } finally { btn.disabled = false; }
    };
  });
}

function escolherEmpresa(empresas, selecionada = null, mensagem = '') {
  const box = document.getElementById('loginEmpresas');
  hide('loadingScreen'); hide('appRoot'); hide('loginForm'); show('loginScreen'); show('empresaCard');
  document.getElementById('btnTrocarConta').onclick = () => logout();
  const hint = document.getElementById('empresaMensagem');
  hint.textContent = mensagem;
  hint.classList.toggle('hidden', !mensagem);
  document.getElementById('empresaTitulo').textContent = empresas.length ? 'Escolha a empresa' : 'Acesso à unidade';
  const cancel = document.getElementById('btnVoltarEmpresa');
  cancel.classList.toggle('hidden', !selecionada);
  box.innerHTML = empresas.map(e => `<button type="button" class="btn" data-empresa="${escapeHtml(e.empresa_id)}">${escapeHtml(e.nome || e.empresa_id)} · ${escapeHtml(ROLE_LABEL[e.role] || e.role)}</button>`).join('');
  return new Promise(resolve => {
    cancel.onclick = () => {
      hide('empresaCard');
      resolve(selecionada);
    };
    box.onclick = (ev) => {
      const b = ev.target.closest('[data-empresa]');
      if (!b) return;
      hide('empresaCard');
      resolve(empresas.find(e => e.empresa_id === b.dataset.empresa));
    };
  });
}

// Contexto da sessão: quem é, em qual empresa e com qual papel (só para a UI).
async function carregarSessao() {
  const me = await fetchMe();
  const empresas = me.empresas || [];
  if (!empresas.length) throw Object.assign(new Error(noAccess), { code: 'NO_ACTIVE_MEMBERSHIP' });
  // Aviso de privacidade (D-018): volta a aparecer se a versão mudar.
  if (me.privacidade?.pendente) await pedirAceitePrivacidade(me.privacidade.versaoAtual);
  let atual = empresas.find(e => e.empresa_id === getSession()?.empresa_id);
  if (!atual) atual = empresas.length === 1 ? empresas[0] : await escolherEmpresa(empresas);
  selectEmpresa(atual.empresa_id);
  state.session = {
    principal: 'user', user_id: me.user.id, nome: me.user.nome, email: me.user.email, role: atual.role,
    empresa_id: atual.empresa_id, empresas, permissoes: atual.permissoes || null, profissional_id: atual.profissional_id || null
  };
  hide('loginScreen');
}

function aplicarSessaoNaUI() {
  const s = state.session;
  if (s && s.principal === 'user') {
    document.getElementById('sessionLabel').textContent = `${s.nome} · ${ROLE_LABEL[s.role] || s.role}`;
    document.getElementById('navAvatarIniciais').textContent = getInitials(s.nome);
    show('sessionChip');
    if (s.empresas.length > 1) {
      const switcher = document.getElementById('btnTrocarEmpresa');
      switcher.classList.remove('hidden');
      switcher.onclick = async () => {
        document.getElementById('sheetConta').close();
        const empresa = await escolherEmpresa(s.empresas, s.empresas.find(e => e.empresa_id === s.empresa_id));
        if (empresa.empresa_id === s.empresa_id) { hide('loginScreen'); show('appRoot'); return; }
        selectEmpresa(empresa.empresa_id);
      };
    }
    if (authFeatures.linkIdentity) {
      const providers = { google: 'btnVincularGoogle', apple: 'btnVincularApple' };
      for (const [provider, id] of Object.entries(providers)) {
        if (!authFeatures[provider]) continue;
        const button = document.getElementById(id);
        show('vincularProvedores');
        show(id);
        button.onclick = async () => {
          const error = document.getElementById('vincularErro');
          button.disabled = true;
          error.textContent = '';
          try {
            const me = await fetchMe();
            if (me.user.id !== s.user_id || !me.empresas.some(e => e.empresa_id === s.empresa_id)) throw new AuthError();
            await openOAuth(provider, s.user_id);
          } catch (err) {
            error.textContent = err.message;
            button.disabled = false;
          }
        };
      }
    }
  }
  // Painel e lista de espera seguem a permissão efetiva (D-032): um profissional com o
  // pacote Recepção passa a ver os dois; sem ele, não vê.
  if (!sessionPode('painel:operacional')) hide('navDashboard');
  if (s?.permissoes && !['comanda:fechar', 'agenda:ver', 'comanda:historico'].some(codigo => sessionPode(codigo))) hide('navCheckout');
  if (sessionPode('painel:operacional') && sessionPode('caixa:conferir')) show('gestaoCaixa');
  if (s?.permissoes) {
    for (const [codigo, secoes] of [
      ['cadastros:ver', ['profissionais', 'servicos', 'produtos', 'formas']],
      ['clientes:ver', ['clientes']]
    ]) {
      if (sessionPode(codigo)) continue;
      secoes.forEach(secao => document.querySelector(`[data-subtab="${secao}"]`).classList.add('hidden'));
    }
  }
  if (!sessionPode('espera:ver')) {
    document.getElementById('btnAbrirListaEspera')?.classList.add('hidden');
    document.querySelector('.subtab-btn[data-subtab="espera"]')?.classList.add('hidden');
  }
  // Profissional: a agenda é o dia dele (D-030), salvo se ele também atua na recepção.
  if (s && s.principal === 'user' && s.role === 'profissional' && !sessionPode('agenda:ver', true)) {
    const rotuloAgenda = document.getElementById('navAgendaLabel');
    if (rotuloAgenda) rotuloAgenda.textContent = 'Hoje';
  }
  if (podeVerMetasGanhos() && !podeVerMetasGanhos(true)) {
    document.getElementById('contaAcoes').before(document.getElementById('navMetas'));
  }
}

function showFatalError(error, retry = () => window.location.reload()) {
  const loading = document.getElementById('loadingScreen');
  const app = document.getElementById('appRoot');
  const fatal = document.getElementById('fatalError');
  if (loading) loading.classList.add('hidden');
  if (app) app.classList.add('hidden');
  if (fatal) fatal.classList.remove('hidden');
  const title = document.getElementById('fatalTitulo');
  const message = document.getElementById('fatalMensagem');
  if (title) title.textContent = error?.status === 429 ? 'Aguarde antes de tentar' : 'Acesso indisponível';
  if (message) message.textContent = error?.status === 429
    ? 'Muitas tentativas. Aguarde e tente novamente.'
    : 'Não foi possível conectar ao servidor agora. Tente novamente em instantes.';
  document.getElementById('btnTentarNovamente').onclick = retry;
}

async function prepararAcesso() {
  for (;;) {
    try {
      await loadConfig();
      return;
    } catch (error) {
      // Enquanto a confirmação do callback não começou, é seguro repetir a configuração
      // nesta página. A URL já foi saneada; recarregar descartaria o retorno capturado.
      await new Promise(resolve => showFatalError(error, resolve));
      hide('fatalError');
      show('loadingScreen');
    }
  }
}

function watchOperationalContext() {
  const initialState = structuredClone(state);
  const appRoot = document.getElementById('appRoot');
  const operational = [...document.body.children].filter(node =>
    node.id === 'onboardingScreen' ||
    (appRoot.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING && node.tagName !== 'SCRIPT') ||
    node === appRoot);
  const templates = operational.map(node => node.cloneNode(true));
  let leaving = false;
  onAuthContextChanged(reason => {
    if (leaving) return;
    leaving = true;
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, structuredClone(initialState));
    operational.forEach((element, index) => element.replaceWith(templates[index]));
    hide('senhaForm'); hide('privacyCard'); hide('empresaCard'); hide('loginScreen');
    document.getElementById('loginSenha').value = '';
    document.getElementById('loginCodigo').value = '';
    document.getElementById('novaSenha').value = '';
    document.getElementById('novaSenha2').value = '';
    show('loadingScreen');
    if (reason === 'account') setAuthNotice('A conta deste navegador mudou.');
    // A navegação descarta também os dados privados nos módulos já inicializados.
    window.location.reload();
  });
  return () => leaving;
}

async function init() {
  const contextChanged = watchOperationalContext();
  const loadingMessage = document.getElementById('loadingMessage') || document.querySelector('#loadingScreen div:last-child');
  const slowBootTimer = setTimeout(() => {
    if (loadingMessage) loadingMessage.textContent = 'Conectando ao servidor... isso pode levar alguns segundos.';
  }, 3500);

  initNavegacao();
  initTema();
  document.getElementById('btnAbrirListaEspera')?.addEventListener('click', openListaEsperaModal);
  document.getElementById('dobraComandas').addEventListener('toggle', ev => {
    if (ev.target.open && state.activeTab === 'dashboard' && podeEstornar()) atualizarComandasEstorno();
  });
  
  // FAB (New Appointment)
  const fab = document.getElementById('fab');
  if (fab) {
    fab.addEventListener('click', () => {
      // Trigger new agendamento modal opening via stateBus or custom event
      const date = state.selectedDay || new Date().toISOString().slice(0, 10);
      state.agListaEspera = null;
      state.fuzzyAgCliente.clear();
      avisarReguaCliente(null);
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

  // Initialize UI sub-modules
  initAgenda();
  initLembretes();
  initCheckout();
  initComandas(() => showTab('checkout', { abrirLista: false }));
  initDashboard();
  initCockpit();
  initDesempenho();
  initCadastros();

  document.getElementById('btnLogout')?.addEventListener('click', () => logout());

  try {
    await prepararAcesso();
    let notice = getAuthNotice();
    try {
      if (await consumeAuthLink() === 'link') notice = 'Conta vinculada.';
    } catch (error) {
      if (contextChanged() || error instanceof StaleContextError) return;
      notice = error.message;
    }
    const passwordType = pendingPassword();
    if (passwordType) {
      clearTimeout(slowBootTimer);
      runDefinirSenha(passwordType);
      return;
    }
    if (!getSession()) await runLogin(notice);
    else if (notice) showBanner(notice);
    if (contextChanged()) return;
    await carregarSessao();
    if (contextChanged()) return;
    aplicarSessaoNaUI();
    // Salão sem configuração mínima: assistente antes das telas vazias.
    await talvezAbrirOnboarding();
    if (contextChanged()) return;
    document.getElementById('loadingScreen')?.classList.remove('hidden');
    await loadCatalog();
    if (contextChanged()) return;


    // Instantiate Fuzzy Fields and store them in the global state
    state.fuzzyCliente = new FuzzyField('coCliente', state.catalog.clientes, {
      labelFn: c => c.nome,
      valueFn: c => c.id,
      onSelect: () => onCheckoutFieldChanged('cliente')
    });

    state.fuzzyServico = new FuzzyField('coServico', state.catalog.servicos.filter(s => s.ativo !== false), {
      labelFn: s => `${s.nome} (${centsToBRL(s.valor_centavos)})`,
      valueFn: s => s.id,
      onSelect: servicoId => {
        onCheckoutFieldChanged('servico');
        onServicoSelected(servicoId);
      }
    });

    state.fuzzyProduto = new FuzzyField('coProduto', (state.catalog.produtos || []).filter(p => p.ativo !== false), {
      labelFn: p => `${p.nome} (${centsToBRL(p.preco_venda_centavos)})`,
      valueFn: p => p.id,
      onSelect: () => onCheckoutFieldChanged('produto')
    });

    state.fuzzyProfissional = new FuzzyField('coProfissional', state.catalog.profissionais.filter(p => p.ativo !== false), {
      labelFn: p => p.nome,
      valueFn: p => p.id,
      onSelect: () => onCheckoutFieldChanged('profissional')
    });

    state.fuzzyForma = new FuzzyField('coForma', state.catalog.formas_pagamento.filter(f => f.ativo !== false), {
      labelFn: f => f.label,
      valueFn: f => f.code,
      onSelect: () => onCheckoutFieldChanged('forma')
    });

    // Fuzzy search fields (modal novo agendamento) with cross-filtering
    state.fuzzyAgCliente = new FuzzyField('agCliente', state.catalog.clientes, {
      labelFn: c => c.nome,
      valueFn: c => c.id,
      onSelect: (clienteId) => { avisarReguaCliente(clienteId); }
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

    initEquipe();
    initPermissoes();
  initEscalas();
  initAgendamentoOnline();
  initRegrasAgenda();
  initPlanos();
  initAssinantes();
  // Depende da sessão (permissão agenda:ver): por isso aqui, e não com os outros módulos da agenda.
  initOnlineNovos();
  initSeries();
  initAtendimento();
    initComissoes();
    initGanhos();
    initAgora();
    initCaixa();
    initEstorno();
    if (sessionPode('empresa:configurar')) {
      const btnAssistente = document.getElementById('btnAbrirAssistente');
      btnAssistente.classList.remove('hidden');
      btnAssistente.addEventListener('click', async () => {
        document.getElementById('appRoot').classList.add('hidden');
        await abrirOnboarding();
        window.location.reload();
      });
    }
    filtrarGestao();

    await loadWeekAgenda();
  } catch (err) {
    clearTimeout(slowBootTimer);
    if (contextChanged() || err instanceof StaleContextError) return;
    if (['USER_INACTIVE', 'NO_ACTIVE_MEMBERSHIP'].includes(err.code)) {
      setAuthNotice(noAccess);
      await logout({ revoke: false });
      return;
    }
    if (err.code === 'NO_UNIT_ACCESS' && state.session) {
      const { empresa_id: bloqueada, empresas } = state.session;
      const alternativas = empresas.filter(empresa => empresa.empresa_id !== bloqueada);
      const outra = await escolherEmpresa(alternativas, null, 'Você não tem uma unidade ativa vinculada nesta empresa. Peça acesso ao administrador.');
      if (!contextChanged() && outra) selectEmpresa(outra.empresa_id);
      return;
    }
    if (err instanceof AuthError) {
      await runLogin('Sua sessão expirou. Entre novamente.');
      window.location.reload();
      return;
    }

    showFatalError(err);
    return;
  }

  clearTimeout(slowBootTimer);
  if (contextChanged()) return;

  const loading = document.getElementById('loadingScreen');
  const root = document.getElementById('appRoot');
  if (loading) loading.classList.add('hidden');
  if (root) root.classList.remove('hidden');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => {});
    // Versão nova instalada: a página aberta ainda roda o código antigo até recarregar.
    const rotuloVersao = v => String(v || '').replace('hope-os-shell-', '');
    navigator.serviceWorker.addEventListener('message', ev => {
      const d = ev.data || {};
      if (d.tipo === 'nova-versao') document.getElementById('bannerAtualizacao')?.classList.remove('hidden'); // fica até atualizar
      if (d.tipo === 'versao' && document.getElementById('appVersao')) document.getElementById('appVersao').textContent = rotuloVersao(d.versao);
    });
    document.getElementById('btnAtualizarApp')?.addEventListener('click', () => window.location.reload());
    // Versão em uso (para suporte) e checagem de atualização: ao voltar para o app e a cada 30 min
    // (a recepção deixa o app aberto o dia todo; o navegador sozinho demora a perguntar).
    navigator.serviceWorker.ready.then(reg => {
      const perguntar = () => { if (reg.active) reg.active.postMessage({ tipo: 'versao' }); };
      perguntar();
      const checar = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checar(); });
      setInterval(checar, 30 * 60 * 1000);
    }).catch(() => {});
  }
}

// Link de convite/recuperação aberto numa aba onde o app já está: só o fragmento
// muda e a página não recarrega. Recarrega para o boot consumir o token.
window.addEventListener('hashchange', () => {
  if (/(^|[#&])(access_token|error|error_code)=/.test(window.location.hash)) window.location.reload();
});

// Comanda fechada: o fechamento do dia muda.
stateBus.addEventListener('checkout:closed', () => {
  if (state.activeTab !== 'dashboard') return;
  if (sessionPode('caixa:conferir')) atualizarCaixa();
  if (document.getElementById('dobraComandas').open && podeEstornar()) atualizarComandasEstorno();
});
// Estorno feito: caixa do dia e dashboard mudam (linha negativa, relatórios).
stateBus.addEventListener('estorno:feito', () => {
  if (state.activeTab !== 'dashboard') return;
  if (sessionPode('caixa:conferir')) atualizarCaixa();
  if (sessionPode('painel:operacional')) atualizarDashboard();
});

// Listen to Tab Change event from event bus
stateBus.addEventListener('tab:change', (e) => {
  showTab(e.detail);
});

// Run
init();
