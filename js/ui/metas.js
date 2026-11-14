// Gestão > Ganhos: metas do mês e ranking (D-019, migration 011).
// Gestão define a meta de cada profissional e liga ou desliga o ranking para a equipe.
// O profissional vê as próprias metas e, se o salão ligou, a posição dele no ranking —
// sem o valor em reais dos colegas. O progresso vem do servidor; nada é calculado aqui.
import { api } from '../api.js';
import { sessionRoleIn } from '../state.js';
import { escapeHtml, centsToBRL } from '../utils.js';
import { reaisParaCentavos } from './caixa.js';

const el = id => document.getElementById(id);
const gestao = () => sessionRoleIn('admin', 'gestor');
const ROTULO = { faturamento: 'Faturamento em serviços', atendimentos: 'Atendimentos', produtos: 'Venda de produtos' };
const valor = (tipo, v) => (tipo === 'atendimentos' ? String(v) : centsToBRL(v));
const emReais = c => (c ? (c / 100).toFixed(2).replace('.', ',') : '');
let contexto = { mes: null, profissionalId: null };

function renderMetas(lista) {
  const linhas = lista.map(m => `
    <div class="meta-linha" data-meta="${escapeHtml(m.tipo)}" data-percentual="${m.percentual}" data-atingida="${m.atingida ? 1 : 0}">
      <div class="row"><span>${ROTULO[m.tipo]}${m.atingida ? ' · meta atingida' : ''}</span><b>${valor(m.tipo, m.realizado)} de ${valor(m.tipo, m.alvo)} (${m.percentual}%)</b></div>
      <progress max="100" value="${Math.min(100, m.percentual)}" aria-label="${ROTULO[m.tipo]}: ${m.percentual}% da meta"></progress>
    </div>`).join('');
  el('metasLista').innerHTML = linhas || `<p class="empty-state">${gestao() ? 'Nenhuma meta definida para este mês.' : 'O salão não definiu meta para você neste mês.'}</p>`;
}

// Meta do salão (D-027): reconhecimento sem valor. Só totais do salão; não entra em
// comissão nem em pagamento. Some quando o mês não tem metas de faturamento.
async function atualizarMetaSalao(mes) {
  const bloco = el('metaSalaoBloco');
  if (!bloco) return;
  try {
    const m = await api(`/gamificacao/meta-salao?mes=${encodeURIComponent(mes)}`);
    if (!m.temMetas) { bloco.classList.add('hidden'); bloco.innerHTML = ''; return; }
    const pct = Math.min(100, Math.max(0, m.percentual));
    bloco.innerHTML = m.reconhecida
      ? `<div class="meta-salao-selo"><span aria-hidden="true">★</span> Meta do salão atingida neste mês</div><p class="body-sm text-tertiary" style="margin:4px 0 0;">${centsToBRL(m.realizadoCentavos)} de ${centsToBRL(m.metaCentavos)} em serviços.</p>`
      : `<div class="body-sm"><b>Meta do salão:</b> ${m.percentual}% (${centsToBRL(m.realizadoCentavos)} de ${centsToBRL(m.metaCentavos)} em serviços)</div><progress max="100" value="${pct}" aria-label="Meta do salão: ${m.percentual}%"></progress>`;
    bloco.classList.remove('hidden');
  } catch (_) {
    bloco.classList.add('hidden'); bloco.innerHTML = '';
  }
}

export async function atualizarMetas(mes, profissionalId) {
  contexto = { mes, profissionalId: profissionalId || null };
  el('metasErro').textContent = '';
  // Gestão vê a meta do salão no topo da lista da equipe; aqui só o profissional.
  if (!gestao()) atualizarMetaSalao(mes);
  try {
    const r = await api(`/metas?mes=${encodeURIComponent(mes)}`);
    const lista = gestao() ? r.metas.filter(m => m.profissionalId === profissionalId) : r.metas;
    renderMetas(lista);
    if (gestao()) {
      const alvo = tipo => (lista.find(m => m.tipo === tipo) || {}).alvo;
      el('metaFaturamento').value = emReais(alvo('faturamento'));
      el('metaProdutos').value = emReais(alvo('produtos'));
      el('metaAtendimentos').value = alvo('atendimentos') || '';
      el('metasForm').classList.toggle('hidden', !profissionalId);
    }
    el('metasBloco').classList.remove('hidden');
  } catch (err) {
    el('metasErro').textContent = err.message;
  }
}

async function salvarMetas() {
  const msg = el('metasMsg');
  msg.textContent = '';
  if (!contexto.profissionalId) { msg.textContent = 'Escolha um profissional.'; return; }
  const fat = reaisParaCentavos(el('metaFaturamento').value);
  const atdTexto = el('metaAtendimentos').value.trim();
  const atd = atdTexto === '' ? null : Number(atdTexto);
  const prod = reaisParaCentavos(el('metaProdutos').value);
  if (Number.isNaN(fat)) { msg.textContent = 'Meta de faturamento inválida. Use, por exemplo, 5000,00.'; return; }
  if (Number.isNaN(prod)) { msg.textContent = 'Meta de produtos inválida. Use, por exemplo, 800,00.'; return; }
  if (atd !== null && (!Number.isInteger(atd) || atd < 0)) { msg.textContent = 'Meta de atendimentos deve ser um número inteiro.'; return; }
  const botao = el('btnSalvarMetas');
  botao.disabled = true;
  try {
    // Campo vazio remove a meta daquele tipo.
    for (const [tipo, valorAlvo] of [['faturamento', fat], ['produtos', prod], ['atendimentos', atd]]) {
      await api('/metas', { method: 'PUT', body: { profissionalId: contexto.profissionalId, mes: contexto.mes, tipo, valorAlvo: valorAlvo || null } });
    }
    msg.textContent = 'Metas salvas.';
    await atualizarMetas(contexto.mes, contexto.profissionalId);
  } catch (err) {
    msg.textContent = err.message;
  } finally { botao.disabled = false; }
}

// Preenche o formulário com a sugestão do servidor (média de 3 meses + crescimento).
// Nada é gravado até a gestão tocar em "Salvar metas".
async function sugerirMetas() {
  const msg = el('metasSugestaoMsg');
  msg.textContent = '';
  if (!contexto.profissionalId) { msg.textContent = 'Escolha um profissional.'; return; }
  const inc = Number(String(el('metaIncremento').value || '0').replace(',', '.'));
  if (!Number.isFinite(inc) || inc < 0 || inc > 100) { msg.textContent = 'Crescimento deve ficar entre 0 e 100%.'; return; }
  const botao = el('btnSugerirMetas');
  botao.disabled = true;
  try {
    const r = await api(`/metas/sugestao?mes=${encodeURIComponent(contexto.mes)}&incrementoPct=${inc}`);
    const s = r.sugestoes.find(x => x.profissionalId === contexto.profissionalId);
    if (!s || (!s.faturamento && !s.produtos && !s.atendimentos)) {
      msg.textContent = `Sem histórico suficiente: é preciso movimento nos 3 meses anteriores (${s ? s.mesesComMovimento : 0} de 3). Defina a meta à mão.`;
      return;
    }
    if (s.faturamento) el('metaFaturamento').value = emReais(s.faturamento.sugerido);
    if (s.produtos) el('metaProdutos').value = emReais(s.produtos.sugerido);
    if (s.atendimentos) el('metaAtendimentos').value = s.atendimentos.sugerido;
    const partes = [s.faturamento && `serviços ${centsToBRL(s.faturamento.media)}`, s.produtos && `produtos ${centsToBRL(s.produtos.media)}`, s.atendimentos && `${s.atendimentos.media} atendimentos`].filter(Boolean);
    msg.textContent = `Média de ${r.mesesBase[0]} a ${r.mesesBase[2]}: ${partes.join(', ')}. Sugestão com +${inc}%. Ajuste se quiser e salve.`;
  } catch (err) {
    msg.textContent = err.message;
  } finally { botao.disabled = false; }
}

function renderRanking(r) {
  const comValor = gestao();
  el('rankingLista').innerHTML = r.ranking.length ? r.ranking.map(x => `
    <div class="row" data-posicao="${x.posicao}" data-voce="${x.voce ? 1 : 0}">
      <span>${x.posicao}º · ${escapeHtml(x.nome)}${x.voce ? ' (você)' : ''} · ${x.atendimentos} atend.</span>
      <b>${comValor || x.voce ? centsToBRL(x.valorCentavos) : `${x.percentualDoLider}% do 1º`}</b>
    </div>${comValor ? `<p class="list-count-hint ranking-detalhe">serviços ${centsToBRL(x.faturamentoCentavos)} · produtos ${centsToBRL(x.produtosCentavos)} · ticket médio ${centsToBRL(x.ticketMedioCentavos)}</p>` : ''}`).join('') : '<p class="empty-state">Ninguém atendeu neste mês ainda.</p>';
}

export async function atualizarRanking(mes) {
  const bloco = el('rankingBloco');
  contexto.mes = mes;
  try {
    const criterio = el('rankingCriterio').value || 'servicos';
    const r = await api(`/gamificacao/ranking?mes=${encodeURIComponent(mes)}&criterio=${criterio}`);
    // Ranking desligado para a equipe: o bloco não aparece para o profissional.
    if (!gestao() && !r.visivelEquipe) { bloco.classList.add('hidden'); return; }
    renderRanking(r);
    if (gestao()) {
      el('rankingVisivelWrap').classList.remove('hidden');
      el('rankingVisivel').checked = r.visivelEquipe;
    }
    bloco.classList.remove('hidden');
  } catch (err) {
    bloco.classList.add('hidden');
    el('metasErro').textContent = err.message;
  }
}

async function alternarVisibilidade() {
  const caixa = el('rankingVisivel');
  const msg = el('rankingMsg');
  caixa.disabled = true; msg.textContent = '';
  try {
    await api('/empresa', { method: 'PATCH', body: { rankingVisivelEquipe: caixa.checked } });
    msg.textContent = caixa.checked ? 'A equipe passa a ver o ranking (sem o valor em reais dos colegas).' : 'O ranking fica visível só para a gestão.';
  } catch (err) {
    caixa.checked = !caixa.checked;
    msg.textContent = err.message;
  } finally { caixa.disabled = false; }
}

export function initMetas() {
  if (!sessionRoleIn('admin', 'gestor', 'profissional')) return;
  el('metasForm').addEventListener('submit', ev => { ev.preventDefault(); salvarMetas(); });
  el('btnSugerirMetas').addEventListener('click', sugerirMetas);
  el('rankingVisivel').addEventListener('change', alternarVisibilidade);
  el('rankingCriterio').addEventListener('change', () => { if (contexto.mes) atualizarRanking(contexto.mes); });
}
