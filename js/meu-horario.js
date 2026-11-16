// Página do link pessoal do agendamento (meu-horario.html#t=<código>), sem login (C2, D-038).
// O código fica no fragmento da URL (não vai ao servidor nem no Referer) e é enviado no CORPO
// dos POSTs para /api/public/meu-agendamento*. Toda regra (prazo, status, horários livres,
// limite de remarcações) é do servidor: aqui só se mostra o que ele permite. Nada de innerHTML
// com dado da API: tudo entra por textContent.
import { apiBaseDaUrl } from './api-base.js';
import { baixarIcs, googleAgendaUrl } from './calendario-cliente.js';
import * as Push from './push-cliente.js';

const $ = id => document.getElementById(id);
const estado = { api: null, token: null, dados: null, dataEscolhida: null, horarioEscolhido: null, seq: 0, ocupado: false };
const precoFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const diaLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const diaSemanaCurto = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
const horaLocal = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const MSG_CONEXAO = 'Não foi possível falar com o salão agora. Verifique sua conexão e tente de novo.';
const STATUS = {
  agendado: 'Agendado', confirmado: 'Confirmado', cancelado: 'Cancelado', remarcado: 'Remarcado',
  em_atendimento: 'Em atendimento', concluido: 'Concluído', falta: 'Não compareceu', outro: '—'
};

function utc(data) { const [y, m, d] = data.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function somarDias(data, n) { const t = utc(data); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function ddmm(data) { const [, m, d] = data.split('-'); return `${d}/${m}`; }
function mostrar(id, sim = true) { $(id).hidden = !sim; }
function limpar(no) { while (no.firstChild) no.removeChild(no.firstChild); }
function aviso(texto, tipo = 'erro') {
  const a = $('aviso');
  a.dataset.tipo = tipo;
  a.textContent = texto || '';
  a.hidden = !texto;
  if (texto) a.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function resolverApi() {
  const override = apiBaseDaUrl(location); // só em host local (E2E/dev)
  if (override) return override;
  const res = await fetch('./config.json', { cache: 'no-store' });
  const cfg = await res.json();
  if (!cfg || !cfg.apiBase) throw new Error('config.json sem apiBase');
  return String(cfg.apiBase).replace(/\/+$/, '');
}

async function chamar(acao, extra = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${estado.api}/public/meu-agendamento${acao}`, {
      method: 'POST', credentials: 'omit', cache: 'no-store', signal: ctrl.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: estado.token, ...extra })
    });
    let corpo = null;
    try { corpo = await res.json(); } catch { /* sem corpo JSON */ }
    return { status: res.status, corpo };
  } catch { return null; } finally { clearTimeout(timer); }
}
const mensagemDe = r => (r && r.corpo && r.corpo.error && r.corpo.error.message) || 'Não foi possível concluir agora. Tente de novo.';

function linkInvalido() {
  Push.esquecerToken();
  mostrar('carregando', false);
  mostrar('secHorario', false);
  mostrar('secRemarcar', false);
  $('nomeSalao').textContent = 'Meu horário';
  mostrar('invalido');
}

function render(d) {
  estado.dados = d;
  const a = d.agendamento;
  $('nomeSalao').textContent = d.salao.nome || 'Meu horário';
  document.title = `Meu horário — ${d.salao.nome || 'salão'}`;
  $('status').textContent = STATUS[a.status] || STATUS.outro;
  $('status').dataset.status = a.status;
  $('quando').textContent = `${diaLongo.format(utc(a.data))}, às ${a.horario} (${a.duracaoMin} min)`;
  $('oque').textContent = `${a.servico}${a.profissional ? ` com ${a.profissional}` : ''}`;
  mostrar('preco', a.precoCentavos !== null && a.precoCentavos !== undefined);
  if (a.precoCentavos !== null && a.precoCentavos !== undefined) $('preco').textContent = precoFmt.format(a.precoCentavos / 100);
  const ativo = ['agendado', 'confirmado'].includes(a.status);
  $('prazo').textContent = !ativo ? ''
    : d.pode.cancelar || d.pode.remarcar
      ? `Pelo link, você pode mudar até ${horaLocal.format(new Date(d.prazo.limiteIso))}. Depois disso, fale com o salão.`
      : 'O prazo para mudar pelo link terminou. Para mudar, fale com o salão.';
  mostrar('btnConfirmar', d.pode.confirmar);
  mostrar('btnCancelar', d.pode.cancelar);
  mostrar('btnRemarcar', d.pode.remarcar);
  mostrar('btnIcs', ativo);
  mostrar('linkGoogle', ativo);
  if (ativo) $('linkGoogle').href = googleAgendaUrl(d.calendario, location.href);
  atualizarPush(d, ativo);
  mostrar('linkSalao', !!d.salao.whatsapp);
  if (d.salao.whatsapp) $('linkSalao').href = `https://wa.me/${encodeURIComponent(d.salao.whatsapp)}`;
  mostrar('carregando', false);
  mostrar('secRemarcar', false);
  mostrar('secHorario');
}

async function acao(nome, botao, confirmarTexto) {
  if (estado.ocupado) return;
  if (confirmarTexto && !window.confirm(confirmarTexto)) return;
  estado.ocupado = true;
  botao.disabled = true;
  aviso('');
  const r = await chamar(nome);
  estado.ocupado = false;
  botao.disabled = false;
  if (!r) return aviso(MSG_CONEXAO);
  if (r.status === 404) return linkInvalido();
  if (r.status !== 200) {
    aviso(mensagemDe(r));
    return recarregar();
  }
  render(r.corpo.data);
  aviso(nome === '/cancelar' ? 'Horário cancelado.' : nome === '/confirmar' ? 'Presença confirmada. Até lá!' : '', 'ok');
}

async function recarregar() {
  const r = await chamar('');
  if (!r) return aviso(MSG_CONEXAO);
  if (r.status === 404) return linkInvalido();
  if (r.status !== 200) return aviso(mensagemDe(r));
  render(r.corpo.data);
}

// --- Remarcar ----------------------------------------------------------------
async function abrirRemarcar() {
  aviso('');
  estado.horarioEscolhido = null;
  $('btnConfirmarRemarcacao').disabled = true;
  const restantes = estado.dados.remarcacoesRestantes;
  $('remarcacoesRestantes').textContent = `Você ainda pode remarcar pelo link ${restantes} ${restantes === 1 ? 'vez' : 'vezes'}.`;
  mostrar('secHorario', false);
  mostrar('secRemarcar');
  await carregarHorarios(estado.dados.agendamento.data, true);
}

function renderDias(primeiroDia, ultimoDia) {
  const lista = $('listaDias');
  limpar(lista);
  for (let d = primeiroDia; d <= ultimoDia; d = somarDias(d, 1)) {
    const data = d;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'dia'; b.setAttribute('role', 'listitem'); b.dataset.dia = data;
    b.setAttribute('aria-pressed', String(data === estado.dataEscolhida));
    const s = document.createElement('small'); s.textContent = diaSemanaCurto.format(utc(data)).replace('.', '');
    const f = document.createElement('strong'); f.textContent = ddmm(data);
    b.append(s, f);
    b.addEventListener('click', () => carregarHorarios(data));
    lista.append(b);
  }
}

async function carregarHorarios(data, desenharDias = false) {
  const seq = ++estado.seq;
  estado.dataEscolhida = data;
  estado.horarioEscolhido = null;
  $('btnConfirmarRemarcacao').disabled = true;
  for (const b of $('listaDias').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.dia === data));
  limpar($('listaHorarios'));
  mostrar('horariosVazio', false);
  mostrar('horariosCarregando');
  const r = await chamar('/horarios', { data });
  if (seq !== estado.seq) return;
  mostrar('horariosCarregando', false);
  if (!r) return aviso(MSG_CONEXAO);
  if (r.status === 404) return linkInvalido();
  if (r.status !== 200) { aviso(mensagemDe(r)); return recarregar(); }
  const d = r.corpo.data;
  if (desenharDias) renderDias(d.primeiroDia, d.ultimoDia);
  if (!d.slots.length) { mostrar('horariosVazio'); return; }
  for (const h of d.slots) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'horario'; b.dataset.horario = h; b.textContent = h; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      estado.horarioEscolhido = h;
      for (const x of $('listaHorarios').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
      $('btnConfirmarRemarcacao').disabled = false;
    });
    $('listaHorarios').append(b);
  }
}

async function confirmarRemarcacao() {
  if (estado.ocupado || !estado.horarioEscolhido) return;
  estado.ocupado = true;
  $('btnConfirmarRemarcacao').disabled = true;
  aviso('');
  const r = await chamar('/remarcar', { data: estado.dataEscolhida, horario: estado.horarioEscolhido });
  estado.ocupado = false;
  if (!r) { $('btnConfirmarRemarcacao').disabled = false; return aviso(MSG_CONEXAO); }
  if (r.status === 404) return linkInvalido();
  if (r.status !== 200) {
    aviso(mensagemDe(r));
    if (r.status === 409 || (r.corpo && r.corpo.error && r.corpo.error.code === 'HORARIO_INDISPONIVEL')) return carregarHorarios(estado.dataEscolhida);
    return recarregar();
  }
  render(r.corpo.data);
  aviso('Horário remarcado. Se você adicionou à agenda do celular, adicione de novo.', 'ok');
}

// --- Lembrete por notificação (C5) -------------------------------------------
async function atualizarPush(d, ativo) {
  const botao = $('btnPush');
  const dica = $('pushDica');
  mostrar('btnPush', false); mostrar('pushDica', false);
  if (!ativo || !d.push || !d.push.disponivel) return;
  if (Push.ehIphoneForaDaTela() && !Push.suportado()) {
    dica.textContent = 'Para receber lembrete por notificação no iPhone: toque em Compartilhar, depois em "Adicionar à Tela de Início", e abra o horário por lá.';
    mostrar('pushDica');
    return;
  }
  if (!Push.suportado()) return;
  let ligado = false;
  try { ligado = Boolean(await Push.assinaturaAtual()); } catch { ligado = false; }
  botao.textContent = ligado ? 'Desativar lembrete por notificação' : 'Receber lembrete por notificação';
  botao.dataset.ligado = ligado ? '1' : '0';
  mostrar('btnPush');
}

async function alternarPush() {
  if (estado.ocupado || !estado.dados) return;
  estado.ocupado = true;
  const botao = $('btnPush');
  botao.disabled = true;
  aviso('');
  try {
    if (botao.dataset.ligado === '1') {
      const endpoint = await Push.desativar();
      if (endpoint) await chamar('/push', { acao: 'cancelar', endpoint });
      Push.esquecerToken();
      aviso('Lembretes por notificação desativados.', 'ok');
    } else {
      const assinatura = await Push.ativar(estado.dados.push.chavePublica);
      const r = await chamar('/push', { acao: 'assinar', assinatura });
      if (!r || r.status !== 200) throw new Error(mensagemDe(r));
      Push.guardarToken(estado.token);
      aviso('Pronto! Você recebe um aviso 1 dia antes e 2 horas antes do horário.', 'ok');
    }
  } catch (err) {
    aviso(err && err.message === 'PERMISSAO_NEGADA' ? 'As notificações estão bloqueadas neste aparelho. Libere nas configurações do navegador para receber os lembretes.' : ((err && err.message) || MSG_CONEXAO));
  } finally {
    estado.ocupado = false;
    botao.disabled = false;
    if (estado.dados) atualizarPush(estado.dados, true);
  }
}

async function iniciar() {
  // Outro link colado na mesma aba (só o #t= muda): o navegador não recarrega sozinho.
  window.addEventListener('hashchange', () => location.reload());
  // O código vem do link (#t=). Quem abre pelo toque na notificação não tem o #t: usa o que este
  // aparelho guardou ao ligar os lembretes.
  estado.token = new URLSearchParams(location.hash.slice(1)).get('t') || Push.tokenGuardado();
  $('btnConfirmar').addEventListener('click', ev => acao('/confirmar', ev.currentTarget));
  $('btnCancelar').addEventListener('click', ev => acao('/cancelar', ev.currentTarget, 'Cancelar este horário? Para marcar de novo, use o link do salão.'));
  $('btnRemarcar').addEventListener('click', abrirRemarcar);
  $('btnVoltar').addEventListener('click', () => { mostrar('secRemarcar', false); mostrar('secHorario'); aviso(''); });
  $('btnConfirmarRemarcacao').addEventListener('click', confirmarRemarcacao);
  $('btnPush').addEventListener('click', alternarPush);
  $('btnIcs').addEventListener('click', () => { if (estado.dados) baixarIcs(estado.dados.calendario, location.href); });
  if (!/^[A-Za-z0-9_-]{43}$/.test(estado.token)) return linkInvalido();
  try { estado.api = await resolverApi(); } catch { mostrar('carregando', false); return aviso(MSG_CONEXAO); }
  await recarregar();
}

iniciar();
