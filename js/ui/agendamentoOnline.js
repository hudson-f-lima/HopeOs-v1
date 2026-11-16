// Conta → Link online (migration 016, D-037): o salão liga o próprio link de agendamento,
// escolhe o endereço e as regras (antecedência, janela, prazo de cancelamento, horários por
// número, preço visível) e informa o contato de privacidade. O servidor valida e decide; esta
// tela só mostra e envia. Ligar exige endereço, razão social e contato de privacidade.
import { api } from '../api.js';
import { sessionPode } from '../state.js';
import { escapeHtml, showBanner } from '../utils.js';

const el = id => document.getElementById(id);
let atual = null;

const FALTA = { slug: 'endereço do link', razaoSocial: 'razão social', privacidadeContato: 'contato de privacidade' };
const horas = min => (min % 60 === 0 ? `${min / 60} h` : `${min} min`);
const opcoes = (valores, sel, fmt) => valores.map(v => `<option value="${v}"${v === sel ? ' selected' : ''}>${escapeHtml(fmt(v))}</option>`).join('');
const comAtual = (lista, v) => (lista.includes(v) ? lista : [...lista, v].sort((a, b) => a - b));

function linkPublico(slug) {
  return slug ? new URL(`agendar.html?s=${encodeURIComponent(slug)}`, location.href).toString() : '';
}

function render() {
  const c = atual;
  if (!c.disponivel) {
    el('onlineConteudo').innerHTML = '<p class="body-sm text-tertiary">O link por salão ainda não está disponível neste servidor (falta aplicar a migration 016).</p>';
    return;
  }
  const pend = c.pendencias.map(p => FALTA[p] || p);
  const link = linkPublico(c.slug);
  el('onlineConteudo').innerHTML = `
    <p class="body-sm" id="onlineEstado" role="status"><b>${c.ativo ? 'Link LIGADO' : 'Link desligado'}</b>${c.ativo && link ? ` · <a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(link)}</a>` : ''}</p>
    ${pend.length ? `<p class="body-sm esc-alerta" id="onlinePendencias">Para ligar falta: ${escapeHtml(pend.join(', '))}.</p>` : ''}
    <form id="formOnline" novalidate>
      <div class="field"><label for="onlineSlug">Endereço do link</label>
        <input id="onlineSlug" maxlength="60" autocomplete="off" placeholder="ex.: salao-da-ana" value="${escapeHtml(c.slug || '')}"/>
        <p class="body-sm text-tertiary">Letras minúsculas, números e hífen. Fica: ${escapeHtml(linkPublico('seu-endereco'))}</p></div>
      <div class="field"><label for="onlineRazao">Razão social (aparece no aviso de privacidade)</label>
        <input id="onlineRazao" maxlength="200" value="${escapeHtml(c.razaoSocial || '')}"/></div>
      <div class="field"><label for="onlineContato">Contato de privacidade (e-mail ou WhatsApp para pedidos sobre dados)</label>
        <input id="onlineContato" maxlength="200" value="${escapeHtml(c.privacidadeContato || '')}"/></div>
      <div class="field"><label for="onlineAntecedencia">Antecedência mínima para agendar</label>
        <select id="onlineAntecedencia">${opcoes(comAtual([0, 30, 60, 120, 180, 240, 720, 1440], c.antecedenciaMin), c.antecedenciaMin, v => (v ? horas(v) : 'Sem antecedência'))}</select></div>
      <div class="field"><label for="onlineJanela">Até quantos dias à frente</label>
        <select id="onlineJanela">${opcoes(comAtual([7, 14, 21, 30, 45, 60, 90], c.janelaDias), c.janelaDias, v => `${v} dias`)}</select></div>
      <div class="field"><label for="onlineCancelamento">Prazo para o cliente cancelar ou remarcar</label>
        <select id="onlineCancelamento">${opcoes(comAtual([0, 60, 120, 180, 240, 720, 1440, 2880], c.cancelamentoPrazoMin), c.cancelamentoPrazoMin, v => (v ? `até ${horas(v)} antes` : 'Até o horário'))}</select></div>
      <div class="field"><label for="onlineMaxFuturos">Horários futuros por número de WhatsApp</label>
        <select id="onlineMaxFuturos">${opcoes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], c.maxFuturos, v => String(v))}</select></div>
      <label class="filter-inline"><input type="checkbox" id="onlineMostrarPreco"${c.mostrarPreco ? ' checked' : ''}/> Mostrar preços na página</label>
      <label class="filter-inline"><input type="checkbox" id="onlineLembretes"${c.lembretesPush ? ' checked' : ''}/> Lembretes por notificação no celular do cliente (1 dia e 2 h antes)</label>
      <label class="filter-inline"><input type="checkbox" id="onlineAtivo"${c.ativo ? ' checked' : ''}/> Link ligado</label>
      <p class="body-sm text-tertiary">O cliente vê preço e duração de cada profissional, pode escolher "sem preferência" e não consegue marcar horários recorrentes.</p>
      <p class="body-sm" id="onlineMsg" role="status"></p>
      <button type="submit" class="btn btn-primary" id="btnOnlineSalvar">Salvar</button>
    </form>`;
}

async function salvar(ev) {
  ev.preventDefault();
  const msg = el('onlineMsg');
  msg.textContent = '';
  const razao = el('onlineRazao').value.trim();
  const body = {
    slug: el('onlineSlug').value.trim().toLowerCase() || null,
    privacidadeContato: el('onlineContato').value.trim() || null,
    antecedenciaMin: Number(el('onlineAntecedencia').value),
    janelaDias: Number(el('onlineJanela').value),
    cancelamentoPrazoMin: Number(el('onlineCancelamento').value),
    maxFuturos: Number(el('onlineMaxFuturos').value),
    mostrarPreco: el('onlineMostrarPreco').checked,
    lembretesPush: el('onlineLembretes').checked,
    ativo: el('onlineAtivo').checked
  };
  el('btnOnlineSalvar').disabled = true;
  try {
    // A razão social é dado da empresa (PATCH /empresa); só vai se mudou.
    if (razao !== (atual.razaoSocial || '')) await api('/empresa', { method: 'PATCH', body: { razaoSocial: razao || null } });
    atual = await api('/empresa/agendamento-online', { method: 'PATCH', body });
    render();
    showBanner(atual.ativo ? 'Link de agendamento ligado.' : 'Configuração salva.', 'ok');
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    const b = el('btnOnlineSalvar');
    if (b) b.disabled = false;
  }
}

export async function carregarAgendamentoOnline() {
  if (!sessionPode('empresa:configurar')) return;
  try {
    atual = await api('/empresa/agendamento-online');
    render();
  } catch (err) {
    el('onlineConteudo').textContent = err.message;
  }
}

export function initAgendamentoOnline() {
  if (!sessionPode('empresa:configurar')) return;
  el('subtabBtnOnline')?.classList.remove('hidden');
  el('subtabBtnOnline')?.addEventListener('click', carregarAgendamentoOnline);
  el('onlineConteudo').addEventListener('submit', ev => { if (ev.target.id === 'formOnline') salvar(ev); });
}
