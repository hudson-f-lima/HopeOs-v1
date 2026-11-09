// Página pública de agendamento online (agendar.html?s=<slug>), sem login.
// Fala só com /api/public/agendar/:slug. Toda regra (horários livres, antecedência,
// limites, cliente) é do backend; aqui só se mostra e se envia. Nada de innerHTML
// com dado da API: tudo entra por textContent.
const estado = {
  api: null, slug: null, catalogo: null,
  servico: null, profissional: null, data: null, horario: null,
  slotsSeq: 0, enviando: false
};
const $ = id => document.getElementById(id);
const precoFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const MSG_CONEXAO = 'Não foi possível falar com o salão agora. Verifique sua conexão e tente de novo.';

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'onClick') e.addEventListener('click', v);
    else e.setAttribute(k, v);
  }
  for (const f of filhos) if (f !== null && f !== undefined) e.append(f);
  return e;
}
function limpar(no) { while (no.firstChild) no.removeChild(no.firstChild); }
function mostrar(id, sim = true) { $(id).hidden = !sim; }
function aviso(texto) {
  const a = $('aviso');
  a.textContent = texto || '';
  a.hidden = !texto;
  if (texto) a.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function utc(data) { const [y, m, d] = data.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function somarDias(data, n) { const t = utc(data); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
const diaSemanaCurto = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
const diaLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
function ddmm(data) { const [, m, d] = data.split('-'); return `${d}/${m}`; }

async function resolverApi() {
  const override = new URLSearchParams(location.search).get('apiBase');
  if (override) return override.replace(/\/+$/, '');
  const res = await fetch('./config.json', { cache: 'no-store' });
  const cfg = await res.json();
  if (!cfg || !cfg.apiBase) throw new Error('config.json sem apiBase');
  return String(cfg.apiBase).replace(/\/+$/, '');
}

async function chamar(sufixo, opcoes = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${estado.api}/public/agendar/${encodeURIComponent(estado.slug)}${sufixo}`, {
      method: opcoes.method || 'GET',
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl.signal,
      headers: opcoes.body ? { 'content-type': 'application/json' } : undefined,
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
    });
    let corpo = null;
    try { corpo = await res.json(); } catch { /* sem corpo JSON */ }
    return { status: res.status, corpo };
  } finally { clearTimeout(timer); }
}
const mensagemDe = r => (r && r.corpo && r.corpo.error && r.corpo.error.message) || 'Não foi possível concluir agora. Tente de novo.';
const codigoDe = r => r && r.corpo && r.corpo.error && r.corpo.error.code;

// --- Passos -------------------------------------------------------------------
function marcar(container, botao) {
  for (const b of container.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === botao));
}

function renderServicos() {
  const lista = $('listaServicos');
  limpar(lista);
  for (const s of estado.catalogo.servicos) {
    const botao = el('button', { type: 'button', class: 'opcao', 'aria-pressed': 'false', 'data-servico': s.id },
      el('span', {}, el('span', { text: s.nome }), el('small', { text: `${s.duracaoMin} min` })),
      el('span', { class: 'preco', text: precoFmt.format((s.precoCentavos || 0) / 100) }));
    botao.addEventListener('click', () => escolherServico(s, botao));
    lista.append(botao);
  }
  if (!estado.catalogo.servicos.length) lista.append(el('p', { class: 'pg-info', text: 'Nenhum serviço disponível online no momento. Fale com o salão.' }));
}

function resetarDepoisDe(passo) {
  const ordem = ['servico', 'profissional', 'data', 'horario'];
  for (const p of ordem.slice(ordem.indexOf(passo) + 1)) estado[p] = null;
  if (ordem.indexOf(passo) < 1) mostrar('secDia', false);
  if (ordem.indexOf(passo) < 2) mostrar('secHorario', false);
  if (ordem.indexOf(passo) < 3) mostrar('secDados', false);
  aviso('');
}

function escolherServico(servico, botao) {
  estado.servico = servico;
  resetarDepoisDe('servico');
  marcar($('listaServicos'), botao);
  const lista = $('listaProfissionais');
  limpar(lista);
  for (const p of servico.profissionais) {
    const b = el('button', { type: 'button', class: 'opcao', 'aria-pressed': 'false', 'data-profissional': p.id }, el('span', { text: p.nome }));
    b.addEventListener('click', () => escolherProfissional(p, b));
    lista.append(b);
  }
  mostrar('secProfissional');
  $('secProfissional').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escolherProfissional(profissional, botao) {
  estado.profissional = profissional;
  resetarDepoisDe('profissional');
  marcar($('listaProfissionais'), botao);
  const lista = $('listaDias');
  limpar(lista);
  const { primeiroDia, ultimoDia } = estado.catalogo.regras;
  for (let d = primeiroDia; d <= ultimoDia; d = somarDias(d, 1)) {
    const data = d;
    const b = el('button', { type: 'button', class: 'dia', role: 'listitem', 'aria-pressed': 'false', 'data-dia': data },
      el('small', { text: diaSemanaCurto.format(utc(data)).replace('.', '') }), el('strong', { text: ddmm(data) }));
    b.addEventListener('click', () => escolherDia(data, b));
    lista.append(b);
  }
  mostrar('secDia');
  $('secDia').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function escolherDia(data, botao) {
  estado.data = data;
  resetarDepoisDe('data');
  if (botao) marcar($('listaDias'), botao);
  mostrar('secHorario');
  await carregarHorarios();
}

async function carregarHorarios() {
  const seq = ++estado.slotsSeq;
  const lista = $('listaHorarios');
  limpar(lista);
  mostrar('horariosVazio', false);
  mostrar('horariosCarregando');
  const qs = new URLSearchParams({ servicoId: estado.servico.id, profissionalId: estado.profissional.id, data: estado.data });
  let r;
  try { r = await chamar(`/slots?${qs}`); } catch { r = null; }
  if (seq !== estado.slotsSeq) return; // o cliente já trocou de dia
  mostrar('horariosCarregando', false);
  if (!r) return aviso(MSG_CONEXAO);
  if (r.status !== 200) return aviso(mensagemDe(r));
  const slots = (r.corpo.data && r.corpo.data.slots) || [];
  if (!slots.length) { mostrar('horariosVazio'); return; }
  for (const h of slots) {
    const b = el('button', { type: 'button', class: 'horario', 'aria-pressed': 'false', 'data-horario': h, text: h });
    b.addEventListener('click', () => escolherHorario(h, b));
    lista.append(b);
  }
  $('secHorario').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escolherHorario(horario, botao) {
  estado.horario = horario;
  aviso('');
  marcar($('listaHorarios'), botao);
  $('resumoEscolha').textContent = `${estado.servico.nome} com ${estado.profissional.nome} — ${diaLongo.format(utc(estado.data))}, às ${horario}`;
  mostrar('secDados');
  $('secDados').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function enviar(ev) {
  ev.preventDefault();
  if (estado.enviando || !estado.horario) return;
  const nome = $('nome').value.replace(/\s+/g, ' ').trim();
  const whatsapp = $('whatsapp').value.trim();
  const digitos = whatsapp.replace(/\D/g, '');
  if (nome.length < 2) return aviso('Informe seu nome.');
  if (![10, 11, 12, 13].includes(digitos.length)) return aviso('Informe o WhatsApp com DDD, por exemplo (11) 98888-7777.');
  if (!$('consentimento').checked) return aviso('Confirme que leu o aviso de privacidade.');
  estado.enviando = true;
  $('btnAgendar').disabled = true;
  $('btnAgendar').textContent = 'Agendando…';
  let r;
  try {
    r = await chamar('', {
      method: 'POST',
      body: {
        servicoId: estado.servico.id, profissionalId: estado.profissional.id, data: estado.data, horario: estado.horario,
        nome, whatsapp, consentimento: true, website: $('website').value
      }
    });
  } catch { r = null; }
  estado.enviando = false;
  $('btnAgendar').disabled = false;
  $('btnAgendar').textContent = 'Agendar';
  if (!r) return aviso(MSG_CONEXAO);
  if (r.status === 201) return confirmar(r.corpo.data);
  aviso(mensagemDe(r));
  if (['HORARIO_INDISPONIVEL', 'HORARIO_OCUPADO'].includes(codigoDe(r))) {
    estado.horario = null;
    mostrar('secDados', false);
    await carregarHorarios();
  }
}

function confirmar(d) {
  $('confirmacaoTexto').textContent = `${d.servico} com ${d.profissional}, ${diaLongo.format(utc(d.data))}, às ${d.horario}.`;
  mostrar('fluxo', false);
  mostrar('secConfirmacao');
  aviso('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function recomecar() {
  estado.servico = null;
  resetarDepoisDe('servico');
  mostrar('secProfissional', false);
  marcar($('listaServicos'), null);
  $('consentimento').checked = false;
  mostrar('secConfirmacao', false);
  mostrar('fluxo');
}

function indisponivel() {
  mostrar('carregando', false);
  $('nomeSalao').textContent = 'Agendar horário';
  mostrar('indisponivel');
}

async function iniciar() {
  $('formDados').addEventListener('submit', enviar);
  $('btnNovo').addEventListener('click', recomecar);
  estado.slug = (new URLSearchParams(location.search).get('s') || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{3,60}$/.test(estado.slug)) return indisponivel();
  let r;
  try {
    estado.api = await resolverApi();
    r = await chamar('');
  } catch { r = null; }
  if (!r) { mostrar('carregando', false); return aviso(MSG_CONEXAO); }
  if (r.status !== 200) return r.status === 404 ? indisponivel() : (mostrar('carregando', false), aviso(mensagemDe(r)));
  estado.catalogo = r.corpo.data;
  $('nomeSalao').textContent = estado.catalogo.salao.nome || 'Agendar horário';
  $('avisoSalao').textContent = estado.catalogo.salao.nome || 'salão';
  $('avisoVersao').textContent = (estado.catalogo.aviso && estado.catalogo.aviso.versao) || '—';
  document.title = `Agendar — ${estado.catalogo.salao.nome || 'salão'}`;
  renderServicos();
  mostrar('carregando', false);
  mostrar('fluxo');
}

iniciar();
