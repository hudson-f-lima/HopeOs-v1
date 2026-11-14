// Conta → Equipe: permissões individuais (D-032). Proprietário e gerente acrescentam
// permissões a uma pessoa, dentro da própria autoridade. O servidor decide o que cada um
// pode mexer (campo "editaveis"); a tela só mostra isso. Nada é tirado do papel.
import { api } from '../api.js';
import { state, sessionPode } from '../state.js';
import { escapeHtml, showBanner, openModal, closeModal, showModalError, clearModalError } from '../utils.js';

const el = id => document.getElementById(id);
const PAPEL = { admin: 'Proprietário', gestor: 'Gerente', recepcao: 'Recepção', profissional: 'Profissional' };
const ORDEM = { admin: 0, gestor: 1, recepcao: 2, profissional: 3 };
let dados = null;
let atual = null;

function resumo(p) {
  const n = p.permissoesExtras.length;
  return n ? `${n} permissão(ões) além do papel` : 'Só o padrão do papel';
}

function renderLista() {
  const pessoas = dados.pessoas.slice().sort((a, b) => ORDEM[a.role] - ORDEM[b.role] || String(a.nome || '').localeCompare(String(b.nome || '')));
  el('listPermissoes').innerHTML = pessoas.map(p => `
    <div class="perm-pessoa" data-membership="${escapeHtml(p.membershipId)}">
      <span class="perm-quem"><b>${escapeHtml(p.nome || p.email || '—')}</b><span>${escapeHtml(PAPEL[p.role] || p.role)} · ${p.voce ? 'você' : escapeHtml(resumo(p))}</span></span>
      ${p.editaveis.length
        ? `<button type="button" class="btn btn-secondary perm-abrir" data-perm-abrir="${escapeHtml(p.membershipId)}">Permissões</button>`
        : `<span class="body-sm text-tertiary">${p.voce ? '' : 'Fora da sua autoridade'}</span>`}
    </div>`).join('') || '<p class="empty-state">Ninguém na equipe ainda.</p>';
}

export async function carregarPermissoes() {
  if (!sessionPode('equipe:permissoes')) return;
  try {
    dados = await api('/equipe/permissoes');
    renderLista();
  } catch (err) {
    el('listPermissoes').innerHTML = `<p class="body-sm" role="alert" style="color:var(--md-error)">${escapeHtml(err.message)}</p>`;
  }
}

const marcadasNaTela = () => [...el('permGrupos').querySelectorAll('input[data-perm]:checked')].map(i => i.dataset.perm);
const pacoteEditavel = () => dados.pacotes.recepcao.permissoes.filter(c => atual.editaveis.includes(c));

function atualizarBotaoPacote() {
  const b = el('btnPermPacote');
  if (!b) return;
  const marcadas = marcadasNaTela();
  const tem = pacoteEditavel().every(c => marcadas.includes(c));
  b.textContent = tem ? 'Tirar acesso de recepção' : 'Dar acesso de recepção';
  b.dataset.estado = tem ? 'tem' : 'nao';
}

function abrir(id) {
  atual = dados.pessoas.find(p => p.membershipId === id);
  if (!atual) return;
  clearModalError('permErro');
  el('permModalTitulo').textContent = `Permissões de ${atual.nome || atual.email || 'pessoa'}`;
  el('permModalPapel').textContent = `Papel: ${PAPEL[atual.role] || atual.role}. O que vem do papel fica; aqui você só acrescenta.`;
  const marcadas = new Set(atual.permissoesExtras);
  el('permPacote').innerHTML = pacoteEditavel().length
    ? `<button type="button" class="btn btn-secondary" id="btnPermPacote">Dar acesso de recepção</button>
       <p class="list-count-hint">Marca de uma vez o que a recepção faz: agenda de todos, encaixes, lista de espera, comanda de qualquer profissional, caixa do dia, clientes e painel da operação. Ganhos, metas e desempenho continuam só dela.</p>`
    : '';
  const grupos = [...new Set(dados.catalogo.map(x => x.grupo))];
  el('permGrupos').innerHTML = grupos.map(g => {
    const itens = dados.catalogo.filter(x => x.grupo === g).map(x => {
      const doPapel = x.padrao[atual.role];
      const editavel = atual.editaveis.includes(x.codigo);
      if (doPapel === 'total') {
        return `<label class="perm-item perm-do-papel"><input type="checkbox" checked disabled/><span>${escapeHtml(x.rotulo)}<small>Do papel</small></span></label>`;
      }
      if (!editavel) {
        return marcadas.has(x.codigo)
          ? `<label class="perm-item"><input type="checkbox" checked disabled/><span>${escapeHtml(x.rotulo)}<small>Concedida pelo proprietário; só ele altera</small></span></label>`
          : '';
      }
      const nota = doPapel === 'proprio' ? '<small>Hoje só o próprio; marcada, vale para todos</small>' : '';
      return `<label class="perm-item"><input type="checkbox" data-perm="${escapeHtml(x.codigo)}"${marcadas.has(x.codigo) ? ' checked' : ''}/><span>${escapeHtml(x.rotulo)}${nota}</span></label>`;
    }).filter(Boolean).join('');
    return itens ? `<fieldset class="perm-grupo"><legend>${escapeHtml(g)}</legend>${itens}</fieldset>` : '';
  }).join('');
  const hist = el('permHistorico');
  hist.innerHTML = '';
  hist.closest('details').open = false;
  atualizarBotaoPacote();
  openModal('modalPermissoes');
}

async function salvar() {
  // Permissões que quem pede não pode mexer são mantidas como estão.
  const fixas = atual.permissoesExtras.filter(c => !atual.editaveis.includes(c));
  const permissoes = [...new Set([...marcadasNaTela(), ...fixas])];
  const botao = el('btnPermSalvar');
  botao.disabled = true;
  try {
    const r = await api(`/equipe/permissoes/${atual.membershipId}`, { method: 'PUT', body: { permissoes } });
    const partes = [r.concedidas.length ? `${r.concedidas.length} concedida(s)` : '', r.revogadas.length ? `${r.revogadas.length} revogada(s)` : ''].filter(Boolean);
    showBanner(`Permissões salvas: ${partes.join(', ') || 'nada mudou'}. Valem na próxima ação da pessoa.`, 'ok');
    closeModal('modalPermissoes');
    carregarPermissoes();
  } catch (err) {
    showModalError('permErro', err.message);
  } finally {
    botao.disabled = false;
  }
}

async function carregarHistorico() {
  const hist = el('permHistorico');
  hist.innerHTML = '<p class="body-sm text-tertiary">Carregando…</p>';
  try {
    const eventos = await api(`/equipe/permissoes/${atual.membershipId}/historico`);
    const rotulo = c => (dados.catalogo.find(x => x.codigo === c) || {}).rotulo || c;
    hist.innerHTML = eventos.length
      ? eventos.map(e => `<div class="perm-evento" data-acao="${escapeHtml(e.acao)}"><span>${escapeHtml(new Date(e.quando).toLocaleString('pt-BR'))}</span><span>${escapeHtml(e.por || '—')} ${e.acao === 'conceder' ? 'concedeu' : 'revogou'} “${escapeHtml(rotulo(e.permissao))}”</span></div>`).join('')
      : '<p class="body-sm text-tertiary">Nenhuma concessão registrada.</p>';
  } catch (err) {
    hist.innerHTML = `<p class="body-sm" role="alert" style="color:var(--md-error)">${escapeHtml(err.message)}</p>`;
  }
}

export function initPermissoes() {
  if (!sessionPode('equipe:permissoes')) return;
  el('subtabBtnEquipe')?.classList.remove('hidden');
  el('cardPermissoes').classList.remove('hidden');
  // Convites, papéis e status continuam só do proprietário (rotas /admin).
  if (!(state.session && state.session.role === 'admin')) {
    el('cardConvite')?.classList.add('hidden');
    el('cardListaEquipe')?.classList.add('hidden');
  }
  el('listPermissoes').addEventListener('click', ev => {
    const b = ev.target.closest('[data-perm-abrir]');
    if (b) abrir(b.dataset.permAbrir);
  });
  el('permPacote').addEventListener('click', ev => {
    const b = ev.target.closest('#btnPermPacote');
    if (!b) return;
    const marcar = b.dataset.estado !== 'tem';
    pacoteEditavel().forEach(c => {
      const input = el('permGrupos').querySelector(`input[data-perm="${c}"]`);
      if (input) input.checked = marcar;
    });
    atualizarBotaoPacote();
  });
  el('permGrupos').addEventListener('change', atualizarBotaoPacote);
  el('btnPermSalvar').addEventListener('click', salvar);
  el('btnPermCancelar').addEventListener('click', () => closeModal('modalPermissoes'));
  el('permHistorico').closest('details').addEventListener('toggle', ev => { if (ev.target.open) carregarHistorico(); });
  carregarPermissoes();
}
