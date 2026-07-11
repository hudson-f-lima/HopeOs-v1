import { api, getListaEspera, createListaEspera, updateListaEspera } from '../api.js?v=ts1783742622';
import { state, stateBus } from '../state.js';
import {
  centsToBRL,
  brlToCents,
  escapeHtml,
  normalizeSearchText,
  openModal,
  closeModal,
  clearModalError,
  showModalError,
  submitCadastro,
  toggleAtivo,
  confirmAction,
  renderList,
  showBanner,
  waLink
} from '../utils.js';

const MODELO_COMISSAO_LABEL = { bruto_salao: 'Bruto salão', dividido: 'Dividido', bruto_staff: 'Bruto staff' };

/* ---------- Clientes ---------- */
function renderClienteRow(c) {
  return `<div class="cadastro-row${c.ativo === false ? ' inactive' : ''}" data-id="${c.id}">
    <div class="info">
      <div class="nome">${escapeHtml(c.nome)}</div>
      <div class="meta">${escapeHtml(c.whatsapp || '')}${c.faltas ? ' · ' + c.faltas + ' falta(s)' : ''}</div>
    </div>
    <div class="actions">
      <button data-action="editar-cliente">Editar</button>
      <button data-action="toggle-cliente" class="${c.ativo === false ? '' : 'danger'}">${c.ativo === false ? 'Reativar' : 'Desativar'}</button>
    </div>
  </div>`;
}

export function renderClientesList() {
  const mostrarInativos = document.getElementById('chkClientesInativos').checked;
  const query = normalizeSearchText(document.getElementById('buscaClientes').value.trim());
  const base = (state.catalog.clientes || []).filter(c => mostrarInativos || c.ativo !== false);
  const filtered = query
    ? base.filter(c => normalizeSearchText(`${c.nome || ''} ${c.whatsapp || ''}`).includes(query))
    : base;
  const limit = query ? 50 : 20;
  const visible = filtered.slice(0, limit);
  const hint = document.getElementById('clientesListHint');
  if (hint) {
    if (!base.length) hint.textContent = 'Nenhum cliente cadastrado.';
    else if (query) hint.textContent = `${visible.length} de ${filtered.length} resultado(s) para a busca.`;
    else hint.textContent = `Mostrando ${visible.length} de ${filtered.length} cliente(s). Use a busca para encontrar rapidamente.`;
  }
  renderList('listClientes', visible, renderClienteRow);
}

function openClienteModal(cliente) {
  document.getElementById('modalClienteTitulo').textContent = cliente ? 'Editar cliente' : 'Novo cliente';
  document.getElementById('clId').value = cliente ? cliente.id : '';
  document.getElementById('clNome').value = cliente ? cliente.nome : '';
  document.getElementById('clWhatsapp').value = cliente ? (cliente.whatsapp || '') : '';
  document.getElementById('clObservacoes').value = cliente ? (cliente.observacoes || '') : '';
  document.getElementById('clAtivoField').classList.toggle('hidden', !cliente);
  document.getElementById('clAtivo').checked = cliente ? cliente.ativo !== false : true;
  clearModalError('clError');
  openModal('modalCliente');
}

async function submitClienteForm() {
  const id = document.getElementById('clId').value;
  const body = {
    nome: document.getElementById('clNome').value.trim(),
    whatsapp: document.getElementById('clWhatsapp').value.trim() || undefined,
    observacoes: document.getElementById('clObservacoes').value.trim() || undefined
  };
  if (id) body.ativo = document.getElementById('clAtivo').checked;
  const data = await submitCadastro(
    () => api(id ? `/clientes/${id}` : '/clientes', { method: id ? 'PATCH' : 'POST', body }),
    id ? 'Cliente atualizado.' : 'Cliente criado.',
    renderClientesList,
    'clError'
  );
  if (data) closeModal('modalCliente');
}

/* ---------- Serviços ---------- */
function renderServicoRow(s) {
  return `<div class="cadastro-row${s.ativo === false ? ' inactive' : ''}" data-id="${s.id}">
    <div class="info">
      <div class="nome">${escapeHtml(s.nome)}</div>
      <div class="meta">${escapeHtml(s.categoria || '')} · ${centsToBRL(s.valor_centavos)} · ${s.duracao_min}min · comissão ${s.comissao_pct}%</div>
    </div>
    <div class="actions">
      <button data-action="editar-servico">Editar</button>
      <button data-action="toggle-servico" class="${s.ativo === false ? '' : 'danger'}">${s.ativo === false ? 'Reativar' : 'Desativar'}</button>
    </div>
  </div>`;
}

export function renderServicosList() {
  const mostrarInativos = document.getElementById('chkServicosInativos').checked;
  renderList('listServicos', state.catalog.servicos.filter(s => mostrarInativos || s.ativo !== false), renderServicoRow);
}

function openServicoModal(servico) {
  document.getElementById('modalServicoTitulo').textContent = servico ? 'Editar serviço' : 'Novo serviço';
  document.getElementById('svId').value = servico ? servico.id : '';
  document.getElementById('svNome').value = servico ? servico.nome : '';
  document.getElementById('svCategoria').value = servico ? (servico.categoria || '') : '';
  document.getElementById('svValor').value = servico ? (servico.valor_centavos / 100).toFixed(2) : '';
  document.getElementById('svDuracao').value = servico ? servico.duracao_min : '';
  document.getElementById('svSlot').value = servico ? (servico.slot_min || '') : '';
  document.getElementById('svComissao').value = servico ? servico.comissao_pct : '0';
  document.getElementById('svAtivoField').classList.toggle('hidden', !servico);
  document.getElementById('svAtivo').checked = servico ? servico.ativo !== false : true;
  clearModalError('svError');
  openModal('modalServico');
}

async function submitServicoForm() {
  const id = document.getElementById('svId').value;
  const body = {
    nome: document.getElementById('svNome').value.trim(),
    categoria: document.getElementById('svCategoria').value.trim() || undefined,
    valorCentavos: brlToCents(document.getElementById('svValor').value),
    duracaoMin: Number(document.getElementById('svDuracao').value),
    slotMin: document.getElementById('svSlot').value ? Number(document.getElementById('svSlot').value) : undefined,
    comissaoPct: Number(document.getElementById('svComissao').value || 0)
  };
  if (id) body.ativo = document.getElementById('svAtivo').checked;
  const data = await submitCadastro(
    () => api(id ? `/servicos/${id}` : '/servicos', { method: id ? 'PATCH' : 'POST', body }),
    id ? 'Serviço atualizado.' : 'Serviço criado.',
    renderServicosList,
    'svError'
  );
  if (data) closeModal('modalServico');
}

/* ---------- Profissionais ---------- */
function renderProfissionalRow(p) {
  return `<div class="cadastro-row${p.ativo === false ? ' inactive' : ''}" data-id="${p.id}">
    <div class="info">
      <div class="nome">${escapeHtml(p.nome)}</div>
      <div class="meta">${escapeHtml(p.whatsapp || '')} · ${MODELO_COMISSAO_LABEL[p.modelo_comissao] || p.modelo_comissao}</div>
    </div>
    <div class="actions">
      <button data-action="editar-profissional">Editar</button>
      <button data-action="vinculos-profissional">Serviços</button>
      <button data-action="toggle-profissional" class="${p.ativo === false ? '' : 'danger'}">${p.ativo === false ? 'Reativar' : 'Desativar'}</button>
    </div>
  </div>`;
}

export function renderProfissionaisList() {
  const mostrarInativos = document.getElementById('chkProfissionaisInativos').checked;
  renderList('listProfissionais', state.catalog.profissionais.filter(p => mostrarInativos || p.ativo !== false), renderProfissionalRow);
}

function openProfissionalModal(prof) {
  document.getElementById('modalProfissionalTitulo').textContent = prof ? 'Editar profissional' : 'Novo profissional';
  document.getElementById('pfId').value = prof ? prof.id : '';
  document.getElementById('pfNome').value = prof ? prof.nome : '';
  document.getElementById('pfWhatsapp').value = prof ? (prof.whatsapp || '') : '';
  document.getElementById('pfModeloComissao').value = prof ? prof.modelo_comissao : 'bruto_salao';
  document.getElementById('pfAtivoField').classList.toggle('hidden', !prof);
  document.getElementById('pfAtivo').checked = prof ? prof.ativo !== false : true;
  clearModalError('pfError');
  openModal('modalProfissional');
}

async function submitProfissionalForm() {
  const id = document.getElementById('pfId').value;
  const body = {
    nome: document.getElementById('pfNome').value.trim(),
    whatsapp: document.getElementById('pfWhatsapp').value.trim() || undefined,
    modeloComissao: document.getElementById('pfModeloComissao').value
  };
  if (id) body.ativo = document.getElementById('pfAtivo').checked;
  const data = await submitCadastro(
    () => api(id ? `/profissionais/${id}` : '/profissionais', { method: id ? 'PATCH' : 'POST', body }),
    id ? 'Profissional atualizado.' : 'Profissional criado.',
    renderProfissionaisList,
    'pfError'
  );
  if (data) closeModal('modalProfissional');
}

/* ---------- Vínculos & Overrides ---------- */
let vinculosProfissionalAtual = null;

function servicosVinculadosIds(profissionalId) {
  return (state.catalog.profissional_servicos || [])
    .filter(l => l.profissional_id === profissionalId)
    .map(l => l.servico_id);
}

function renderOverridesSection(profissional) {
  const linkedIds = servicosVinculadosIds(profissional.id);
  const section = document.getElementById('vinculosOverridesSection');
  if (!linkedIds.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  const overrides = profissional.overrides || {};
  document.getElementById('vinculosOverridesList').innerHTML = linkedIds.map(servicoId => {
    const servico = state.catalog.servicos.find(s => s.id === servicoId);
    if (!servico) return '';
    const ov = overrides[servicoId] || {};
    const valor = ov.valor_centavos != null ? (ov.valor_centavos / 100).toFixed(2) : '';
    const duracao = ov.duracao_min != null ? ov.duracao_min : '';
    const comissao = ov.comissao_pct != null ? ov.comissao_pct : '';
    return `<div class="card" style="margin-bottom:8px;background:var(--md-surface-variant);" data-servico-id="${servicoId}">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px;">${escapeHtml(servico.nome)}</div>
      <div style="font-size:11px;color:var(--md-outline);margin-bottom:6px;">Padrão: ${centsToBRL(servico.valor_centavos)} · ${servico.duracao_min}min · ${servico.comissao_pct}%</div>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <input type="number" min="0" step="0.01" class="ov-valor" placeholder="R$" value="${valor}" style="flex:1;"/>
        <input type="number" min="5" max="480" step="1" class="ov-duracao" placeholder="min" value="${duracao}" style="flex:1;"/>
        <input type="number" min="0" max="100" step="0.01" class="ov-comissao" placeholder="%" value="${comissao}" style="flex:1;"/>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-primary" data-action="salvar-override" style="flex:1;padding:8px;">Salvar</button>
        <button class="btn btn-secondary" data-action="remover-override" style="flex:1;padding:8px;">Remover override</button>
      </div>
    </div>`;
  }).join('');
}

function openVinculosModal(profissional) {
  vinculosProfissionalAtual = profissional;
  document.getElementById('vinculosNomeProfissional').textContent = `Serviços de ${profissional.nome}`;
  clearModalError('vnError');

  const linkedIds = servicosVinculadosIds(profissional.id);
  document.getElementById('vinculosChecklist').innerHTML = state.catalog.servicos
    .filter(s => s.ativo !== false)
    .map(s => `<label class="checklist-row"><input type="checkbox" value="${s.id}" ${linkedIds.includes(s.id) ? 'checked' : ''}/> ${escapeHtml(s.nome)} (${centsToBRL(s.valor_centavos)})</label>`)
    .join('') || '<p class="empty-state">Cadastre serviços antes de configurar vínculos.</p>';

  renderOverridesSection(profissional);
  openModal('modalVinculos');
}

function refreshVinculosProfissionalAtual() {
  vinculosProfissionalAtual = state.catalog.profissionais.find(p => p.id === vinculosProfissionalAtual.id) || vinculosProfissionalAtual;
}

async function salvarVinculos() {
  const servicoIds = Array.from(document.querySelectorAll('#vinculosChecklist input[type=checkbox]:checked')).map(el => el.value);
  if (!servicoIds.length) {
    const ok = await confirmAction({
      title: 'Remover vínculos',
      message: 'Isso vai remover todos os serviços deste profissional.',
      confirmLabel: 'Remover vínculos',
      danger: true
    });
    if (!ok) return;
  }
  const body = servicoIds.length ? { servicoIds } : { servicoIds: [], confirmarSubstituicaoTotal: true };

  await submitCadastro(
    () => api(`/profissionais/${vinculosProfissionalAtual.id}/servicos`, { method: 'PUT', body }),
    'Vínculos atualizados.',
    () => {
      renderProfissionaisList();
      refreshVinculosProfissionalAtual();
      const linkedIds = servicosVinculadosIds(vinculosProfissionalAtual.id);
      document.querySelectorAll('#vinculosChecklist input[type=checkbox]').forEach(el => { el.checked = linkedIds.includes(el.value); });
      renderOverridesSection(vinculosProfissionalAtual);
    },
    'vnError'
  );
}

async function salvarOverride(servicoId, card) {
  const valorInput = card.querySelector('.ov-valor').value;
  const duracaoInput = card.querySelector('.ov-duracao').value;
  const comissaoInput = card.querySelector('.ov-comissao').value;
  const body = {};
  if (valorInput !== '') body.valorCentavos = brlToCents(valorInput);
  if (duracaoInput !== '') body.duracaoMin = Number(duracaoInput);
  if (comissaoInput !== '') body.comissaoPct = Number(comissaoInput);
  if (!Object.keys(body).length) { showModalError('vnError', 'Informe ao menos um campo de override.'); return; }

  await submitCadastro(
    () => api(`/profissionais/${vinculosProfissionalAtual.id}/servicos/${servicoId}/override`, { method: 'PATCH', body }),
    'Override salvo.',
    () => { refreshVinculosProfissionalAtual(); renderOverridesSection(vinculosProfissionalAtual); },
    'vnError'
  );
}

async function removerOverride(servicoId) {
  await submitCadastro(
    () => api(`/profissionais/${vinculosProfissionalAtual.id}/servicos/${servicoId}/override`, { method: 'PATCH', body: { remover: true } }),
    'Override removido.',
    () => { refreshVinculosProfissionalAtual(); renderOverridesSection(vinculosProfissionalAtual); },
    'vnError'
  );
}

/* ---------- Produtos ---------- */
function renderProdutoRow(p) {
  return `<div class="cadastro-row${p.ativo === false ? ' inactive' : ''}" data-id="${p.id}">
    <div class="info">
      <div class="nome">${escapeHtml(p.nome)}${p.sku ? ' · ' + escapeHtml(p.sku) : ''}</div>
      <div class="meta">${centsToBRL(p.preco_venda_centavos)} · estoque ${p.estoque_atual}/${p.estoque_minimo}</div>
    </div>
    <div class="actions">
      <button data-action="editar-produto">Editar</button>
      <button data-action="ajustar-estoque-produto">Estoque</button>
      <button data-action="toggle-produto" class="${p.ativo === false ? '' : 'danger'}">${p.ativo === false ? 'Reativar' : 'Desativar'}</button>
    </div>
  </div>`;
}

export function renderProdutosList() {
  const mostrarInativos = document.getElementById('chkProdutosInativos').checked;
  renderList('listProdutos', (state.catalog.produtos || []).filter(p => mostrarInativos || p.ativo !== false), renderProdutoRow);
}

function openProdutoModal(produto) {
  document.getElementById('modalProdutoTitulo').textContent = produto ? 'Editar produto' : 'Novo produto';
  document.getElementById('pdId').value = produto ? produto.id : '';
  document.getElementById('pdNome').value = produto ? produto.nome : '';
  document.getElementById('pdSku').value = produto ? (produto.sku || '') : '';
  document.getElementById('pdCategoria').value = produto ? (produto.categoria || '') : '';
  document.getElementById('pdCusto').value = produto ? (produto.custo_centavos / 100).toFixed(2) : '';
  document.getElementById('pdPreco').value = produto ? (produto.preco_venda_centavos / 100).toFixed(2) : '';
  document.getElementById('pdEstoqueInicialField').classList.toggle('hidden', !!produto);
  document.getElementById('pdEstoqueInicial').value = '0';
  document.getElementById('pdEstoqueMinimo').value = produto ? produto.estoque_minimo : '0';
  document.getElementById('pdComissao').value = produto ? produto.comissao_pct : '0';
  document.getElementById('pdModeloComissao').value = produto ? produto.modelo_comissao : 'bruto_salao';
  document.getElementById('pdControlaEstoque').checked = produto ? produto.controla_estoque !== false : true;
  document.getElementById('pdAtivoField').classList.toggle('hidden', !produto);
  document.getElementById('pdAtivo').checked = produto ? produto.ativo !== false : true;
  clearModalError('pdError');
  openModal('modalProduto');
}

async function submitProdutoForm() {
  const id = document.getElementById('pdId').value;
  const bodyBase = {
    nome: document.getElementById('pdNome').value.trim(),
    sku: document.getElementById('pdSku').value.trim() || undefined,
    categoria: document.getElementById('pdCategoria').value.trim() || undefined,
    custoCentavos: brlToCents(document.getElementById('pdCusto').value),
    precoVendaCentavos: brlToCents(document.getElementById('pdPreco').value),
    estoqueMinimo: Number(document.getElementById('pdEstoqueMinimo').value || 0),
    comissaoPct: Number(document.getElementById('pdComissao').value || 0),
    modeloComissao: document.getElementById('pdModeloComissao').value,
    controlaEstoque: document.getElementById('pdControlaEstoque').checked
  };
  let data;
  if (id) {
    data = await submitCadastro(
      () => api(`/produtos/${id}`, { method: 'PATCH', body: { ...bodyBase, ativo: document.getElementById('pdAtivo').checked } }),
      'Produto atualizado.', renderProdutosList, 'pdError'
    );
  } else {
    data = await submitCadastro(
      () => api('/produtos', { method: 'POST', body: { ...bodyBase, estoqueInicial: Number(document.getElementById('pdEstoqueInicial').value || 0) } }),
      'Produto criado.', renderProdutosList, 'pdError'
    );
  }
  if (data) closeModal('modalProduto');
}

let ajusteEstoqueProdutoAtual = null;

function openAjusteEstoqueModal(produto) {
  ajusteEstoqueProdutoAtual = produto;
  document.getElementById('ajusteEstoqueProdutoNome').textContent = `${produto.nome} · estoque atual: ${produto.estoque_atual}`;
  document.getElementById('aeTipo').value = 'entrada';
  document.getElementById('aeQuantidade').value = '';
  document.getElementById('aeCusto').value = '';
  document.getElementById('aeMotivo').value = '';
  clearModalError('aeError');
  openModal('modalAjusteEstoque');
}

async function submitAjusteEstoqueForm() {
  const body = {
    tipo: document.getElementById('aeTipo').value,
    quantidade: Number(document.getElementById('aeQuantidade').value),
    custoUnitarioCentavos: document.getElementById('aeCusto').value ? brlToCents(document.getElementById('aeCusto').value) : undefined,
    motivo: document.getElementById('aeMotivo').value.trim() || undefined
  };
  const data = await submitCadastro(
    () => api(`/produtos/${ajusteEstoqueProdutoAtual.id}/estoque/ajuste`, { method: 'POST', body }),
    'Estoque ajustado.', renderProdutosList, 'aeError'
  );
  if (data) closeModal('modalAjusteEstoque');
}

/* ---------- Formas de Pagamento ---------- */
function renderFormaRow(f) {
  return `<div class="cadastro-row${f.ativo === false ? ' inactive' : ''}" data-code="${f.code}">
    <div class="info">
      <div class="nome">${f.icon ? f.icon + ' ' : ''}${escapeHtml(f.label)} <span style="color:var(--md-outline);font-weight:400;">(${f.code})</span></div>
      <div class="meta">Taxa ${f.taxa_pct}% + ${centsToBRL(f.taxa_fixa_centavos)} · ${f.dias_recebimento}d</div>
    </div>
    <div class="actions">
      <button data-action="editar-forma">Editar</button>
      <button data-action="toggle-forma" class="${f.ativo === false ? '' : 'danger'}">${f.ativo === false ? 'Reativar' : 'Desativar'}</button>
    </div>
  </div>`;
}

export function renderFormasList() {
  const mostrarInativas = document.getElementById('chkFormasInativas').checked;
  renderList('listFormas', (state.catalog.formas_pagamento || []).filter(f => mostrarInativas || f.ativo !== false), renderFormaRow);
}

function openFormaModal(forma) {
  document.getElementById('modalFormaTitulo').textContent = forma ? 'Editar forma de pagamento' : 'Nova forma de pagamento';
  document.getElementById('fmCode').value = forma ? forma.code : '';
  document.getElementById('fmCode').disabled = !!forma;
  document.getElementById('fmLabel').value = forma ? forma.label : '';
  document.getElementById('fmIcon').value = forma ? (forma.icon || '') : '';
  document.getElementById('fmTaxaPct').value = forma ? forma.taxa_pct : '0';
  document.getElementById('fmTaxaFixa').value = forma ? (forma.taxa_fixa_centavos / 100).toFixed(2) : '0.00';
  document.getElementById('fmDiasRecebimento').value = forma ? forma.dias_recebimento : '0';
  document.getElementById('fmAtivoField').classList.toggle('hidden', !forma);
  document.getElementById('fmAtivo').checked = forma ? forma.ativo !== false : true;
  clearModalError('fmError');
  openModal('modalForma');
}

async function submitFormaForm() {
  const isEdit = document.getElementById('fmCode').disabled;
  const bodyBase = {
    label: document.getElementById('fmLabel').value.trim(),
    icon: document.getElementById('fmIcon').value.trim() || undefined,
    taxaPct: Number(document.getElementById('fmTaxaPct').value || 0),
    taxaFixaCentavos: brlToCents(document.getElementById('fmTaxaFixa').value),
    diasRecebimento: Number(document.getElementById('fmDiasRecebimento').value || 0)
  };
  let data;
  if (isEdit) {
    const code = document.getElementById('fmCode').value.trim().toLowerCase();
    data = await submitCadastro(
      () => api(`/formas-pagamento/${code}`, { method: 'PATCH', body: { ...bodyBase, ativo: document.getElementById('fmAtivo').checked } }),
      'Forma de pagamento atualizada.', renderFormasList, 'fmError'
    );
  } else {
    const code = document.getElementById('fmCode').value.trim().toLowerCase();
    data = await submitCadastro(
      () => api('/formas-pagamento', { method: 'POST', body: { code, ...bodyBase } }),
      'Forma de pagamento criada.', renderFormasList, 'fmError'
    );
  }
  if (data) closeModal('modalForma');
}

/* ---------- Lista de espera (F4.4) ---------- */
const LISTA_ESPERA_STATUS_LABEL = { aguardando: 'Aguardando', contatado: 'Contatado', agendado: 'Agendado', cancelado: 'Cancelado' };

function findClienteById(id) {
  return (state.catalog.clientes || []).find(c => c.id === id);
}

function renderListaEsperaRow(item) {
  const cliente = findClienteById(item.cliente_id);
  const servico = state.catalog.servicos.find(s => s.id === item.servico_id);
  const profissional = state.catalog.profissionais.find(p => p.id === item.profissional_id);
  const statusLabel = LISTA_ESPERA_STATUS_LABEL[item.status] || item.status;
  const isOpen = item.status === 'aguardando' || item.status === 'contatado';

  const metaParts = [servico ? servico.nome : 'Serviço removido'];
  if (profissional) metaParts.push(profissional.nome);
  if (item.data_preferencia) metaParts.push('pref. ' + item.data_preferencia);
  metaParts.push(statusLabel);

  const whatsappBtn = cliente?.whatsapp
    ? `<a class="btn btn-secondary" style="width:auto;padding:6px 12px;text-decoration:none;text-align:center;" href="${escapeHtml(waLink(cliente.whatsapp, `Olá ${cliente.nome}! Abriu uma vaga para ${servico ? servico.nome : 'seu atendimento'}, tem interesse?`))}" target="_blank" rel="noopener">WhatsApp</a>`
    : '';

  const actionsHtml = isOpen ? `
    ${item.status === 'aguardando' ? '<button data-action="le-contatado">Marcar contatado</button>' : ''}
    <button data-action="le-agendado">Marcar agendado</button>
    <button data-action="le-cancelado" class="danger">Cancelar</button>
  ` : '';

  return `<div class="cadastro-row" data-id="${item.id}">
    <div class="info">
      <div class="nome">${escapeHtml(cliente ? cliente.nome : 'Cliente removido')}</div>
      <div class="meta">${escapeHtml(metaParts.join(' · '))}</div>
    </div>
    <div class="actions">${whatsappBtn}${actionsHtml}</div>
  </div>`;
}

export async function renderListaEsperaList() {
  const container = document.getElementById('listListaEspera');
  if (!container) return;
  const mostrarTodas = document.getElementById('chkListaEsperaTodas')?.checked;
  try {
    const items = await getListaEspera();
    const filtered = mostrarTodas ? items : items.filter(i => i.status === 'aguardando' || i.status === 'contatado');
    renderList('listListaEspera', filtered, renderListaEsperaRow);
  } catch (err) {
    container.innerHTML = `<p class="empty-state">Erro ao carregar lista de espera: ${escapeHtml(err.message)}</p>`;
  }
}

export function openListaEsperaModal() {
  document.getElementById('leDataPreferencia').value = '';
  document.getElementById('leObservacoes').value = '';
  state.fuzzyLeCliente?.clear();
  state.fuzzyLeServico?.clear();
  state.fuzzyLeProfissional?.clear();
  clearModalError('leError');
  openModal('modalListaEspera');
}

async function submitListaEsperaForm() {
  const clienteId = state.fuzzyLeCliente?.getValue();
  const servicoId = state.fuzzyLeServico?.getValue();
  const profissionalId = state.fuzzyLeProfissional?.getValue();
  if (!clienteId || !servicoId) {
    showModalError('leError', 'Selecione cliente e serviço.');
    return;
  }
  const body = {
    clienteId,
    servicoId,
    profissionalId: profissionalId || undefined,
    dataPreferencia: document.getElementById('leDataPreferencia').value || undefined,
    observacoes: document.getElementById('leObservacoes').value.trim() || undefined
  };
  const data = await submitCadastro(
    () => createListaEspera(body),
    'Adicionado à lista de espera.',
    renderListaEsperaList,
    'leError'
  );
  if (data) closeModal('modalListaEspera');
}

async function updateListaEsperaStatus(id, status) {
  try {
    await updateListaEspera(id, { status });
    showBanner('Status atualizado.', 'ok');
    await renderListaEsperaList();
  } catch (err) {
    showBanner(err.message, 'error');
  }
}

export function initCadastros() {
  /* Clientes */
  document.getElementById('chkClientesInativos').addEventListener('change', renderClientesList);
  document.getElementById('buscaClientes').addEventListener('input', renderClientesList);
  document.getElementById('btnNovoCliente').addEventListener('click', () => openClienteModal(null));
  document.getElementById('btnCancelarCliente').addEventListener('click', () => closeModal('modalCliente'));
  document.getElementById('btnSalvarCliente').addEventListener('click', submitClienteForm);
  document.getElementById('listClientes').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const cliente = (state.catalog.clientes || []).find(c => c.id === btn.closest('[data-id]').dataset.id);
    if (!cliente) return;
    if (btn.dataset.action === 'editar-cliente') openClienteModal(cliente);
    if (btn.dataset.action === 'toggle-cliente') toggleAtivo('/clientes', cliente.id, cliente.ativo !== false, renderClientesList);
  });

  /* Serviços */
  document.getElementById('chkServicosInativos').addEventListener('change', renderServicosList);
  document.getElementById('btnNovoServico').addEventListener('click', () => openServicoModal(null));
  document.getElementById('btnCancelarServico').addEventListener('click', () => closeModal('modalServico'));
  document.getElementById('btnSalvarServico').addEventListener('click', submitServicoForm);
  document.getElementById('listServicos').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const servico = state.catalog.servicos.find(s => s.id === btn.closest('[data-id]').dataset.id);
    if (!servico) return;
    if (btn.dataset.action === 'editar-servico') openServicoModal(servico);
    if (btn.dataset.action === 'toggle-servico') toggleAtivo('/servicos', servico.id, servico.ativo !== false, renderServicosList);
  });

  /* Profissionais */
  document.getElementById('chkProfissionaisInativos').addEventListener('change', renderProfissionaisList);
  document.getElementById('btnNovoProfissional').addEventListener('click', () => openProfissionalModal(null));
  document.getElementById('btnCancelarProfissional').addEventListener('click', () => closeModal('modalProfissional'));
  document.getElementById('btnSalvarProfissional').addEventListener('click', submitProfissionalForm);
  document.getElementById('listProfissionais').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const profissional = state.catalog.profissionais.find(p => p.id === btn.closest('[data-id]').dataset.id);
    if (!profissional) return;
    if (btn.dataset.action === 'editar-profissional') openProfissionalModal(profissional);
    if (btn.dataset.action === 'vinculos-profissional') openVinculosModal(profissional);
    if (btn.dataset.action === 'toggle-profissional') toggleAtivo('/profissionais', profissional.id, profissional.ativo !== false, renderProfissionaisList);
  });

  /* Vínculos & Overrides */
  document.getElementById('btnSalvarVinculos').addEventListener('click', salvarVinculos);
  document.getElementById('btnFecharVinculos').addEventListener('click', () => closeModal('modalVinculos'));
  document.getElementById('vinculosOverridesList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('[data-servico-id]');
    const servicoId = card.dataset.servicoId;
    if (btn.dataset.action === 'salvar-override') salvarOverride(servicoId, card);
    if (btn.dataset.action === 'remover-override') removerOverride(servicoId);
  });

  /* Produtos */
  document.getElementById('chkProdutosInativos').addEventListener('change', renderProdutosList);
  document.getElementById('btnNovoProduto').addEventListener('click', () => openProdutoModal(null));
  document.getElementById('btnCancelarProduto').addEventListener('click', () => closeModal('modalProduto'));
  document.getElementById('btnSalvarProduto').addEventListener('click', submitProdutoForm);
  document.getElementById('listProdutos').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const produto = (state.catalog.produtos || []).find(p => p.id === btn.closest('[data-id]').dataset.id);
    if (!produto) return;
    if (btn.dataset.action === 'editar-produto') openProdutoModal(produto);
    if (btn.dataset.action === 'ajustar-estoque-produto') openAjusteEstoqueModal(produto);
    if (btn.dataset.action === 'toggle-produto') toggleAtivo('/produtos', produto.id, produto.ativo !== false, renderProdutosList);
  });
  document.getElementById('btnCancelarAjusteEstoque').addEventListener('click', () => closeModal('modalAjusteEstoque'));
  document.getElementById('btnSalvarAjusteEstoque').addEventListener('click', submitAjusteEstoqueForm);

  /* Formas de pagamento */
  document.getElementById('chkFormasInativas').addEventListener('change', renderFormasList);
  document.getElementById('btnNovaForma').addEventListener('click', () => openFormaModal(null));
  document.getElementById('btnCancelarForma').addEventListener('click', () => closeModal('modalForma'));
  document.getElementById('btnSalvarForma').addEventListener('click', submitFormaForm);
  document.getElementById('listFormas').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const forma = (state.catalog.formas_pagamento || []).find(f => f.code === btn.closest('[data-code]').dataset.code);
    if (!forma) return;
    if (btn.dataset.action === 'editar-forma') openFormaModal(forma);
    if (btn.dataset.action === 'toggle-forma') toggleAtivo('/formas-pagamento', forma.code, forma.ativo !== false, renderFormasList);
  });

  /* Lista de espera */
  document.getElementById('chkListaEsperaTodas').addEventListener('change', renderListaEsperaList);
  document.getElementById('btnNovaListaEspera').addEventListener('click', openListaEsperaModal);
  document.getElementById('btnCancelarListaEspera').addEventListener('click', () => closeModal('modalListaEspera'));
  document.getElementById('btnSalvarListaEspera').addEventListener('click', submitListaEsperaForm);
  document.getElementById('listListaEspera').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    if (btn.dataset.action === 'le-contatado') updateListaEsperaStatus(id, 'contatado');
    if (btn.dataset.action === 'le-agendado') updateListaEsperaStatus(id, 'agendado');
    if (btn.dataset.action === 'le-cancelado') updateListaEsperaStatus(id, 'cancelado');
  });

  stateBus.addEventListener('catalog:updated', () => {
    renderClientesList();
    renderServicosList();
    renderProfissionaisList();
    renderProdutosList();
    renderFormasList();
    renderListaEsperaList();
  });
}
