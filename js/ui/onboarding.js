// Assistente de configuração em 6 fases (Onda A, D-008).
// O progresso vem de GET /onboarding/status, calculado dos dados reais: fechar o
// app no meio e voltar em outro aparelho retoma da fase pendente. Nada aqui grava
// no financeiro; a simulação usa /checkout/preview.
import { api } from '../api.js';
import { centsToBRL, escapeHtml, waLink } from '../utils.js';
import { sessionRoleIn, state } from '../state.js';

const el = id => document.getElementById(id);
const ADIADO_KEY = 'hopeos.onboarding.adiado';
const MODELOS = [
  ['dividido', 'Dividido', 'A taxa da maquininha sai do valor antes de calcular a comissão.'],
  ['bruto_salao', 'Salão assume a taxa', 'Comissão sobre o valor cheio; o salão paga a taxa.'],
  ['bruto_staff', 'Profissional assume a taxa', 'Comissão sobre o valor cheio; a taxa sai da comissão do profissional.']
];
const DIAS = [['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'], ['qui', 'Quinta'], ['sex', 'Sexta'], ['sab', 'Sábado'], ['dom', 'Domingo']];

let ctx = null; // { status, presets, empresa, catalogo, fase, resolver }

const reais = cents => ((Number(cents) || 0) / 100).toFixed(2);
const centavos = v => Math.round(Number(String(v).replace(',', '.')) * 100);

function adiado() {
  try { return sessionStorage.getItem(ADIADO_KEY) === '1'; } catch { return false; }
}

async function recarregar() {
  const [status, empresa, catalogo] = await Promise.all([api('/onboarding/status'), api('/empresa'), api('/catalog')]);
  Object.assign(ctx, { status, empresa, catalogo });
}

function render() {
  const fases = ctx.status.fases;
  el('onbProgresso').innerHTML = fases.map((f, i) => `
    <button type="button" class="onb-passo${f.id === ctx.fase ? ' atual' : ''}${f.concluida ? ' feito' : ''}" data-fase="${f.id}"
      aria-current="${f.id === ctx.fase ? 'step' : 'false'}" title="${escapeHtml(f.titulo)}">${f.concluida ? '✓' : i + 1}</button>`).join('');
  const atual = fases.find(f => f.id === ctx.fase);
  el('onbTitulo').textContent = `${fases.indexOf(atual) + 1}. ${atual.titulo}`;
  el('onbErro').textContent = '';
  el('btnOnbVoltar').disabled = fases[0].id === ctx.fase;
  el('btnOnbProximo').textContent = ctx.fase === 'simulacao' ? 'Concluir e abrir o salão' : 'Salvar e continuar';
  RENDER[ctx.fase]();
}

function irPara(fase) { ctx.fase = fase; render(); el('onbBody').scrollTop = 0; }

function proximaDepoisDe(fase) {
  const ids = ctx.status.fases.map(f => f.id);
  return ids[Math.min(ids.indexOf(fase) + 1, ids.length - 1)];
}

// ---------- Fase 1: dados ----------
function renderEmpresa() {
  const e = ctx.empresa;
  const campo = (id, rotulo, valor, tipo = 'text', extra = '') =>
    `<div class="field"><label for="${id}">${rotulo}</label><input id="${id}" type="${tipo}" value="${escapeHtml(valor || '')}" ${extra}/></div>`;
  el('onbBody').innerHTML = `
    <p class="onb-ajuda">Como o salão aparece para clientes e equipe.</p>
    ${campo('onbNome', 'Nome do estabelecimento', e.nome, 'text', 'required autocomplete="organization"')}
    ${campo('onbWhats', 'WhatsApp do salão', e.whatsapp, 'tel', 'inputmode="tel" placeholder="(11) 99999-9999"')}
    ${campo('onbTel', 'Telefone fixo (opcional)', e.telefone, 'tel', 'inputmode="tel"')}
    ${campo('onbEnd', 'Endereço (opcional)', e.endereco)}
    ${campo('onbCidade', 'Cidade (opcional)', e.cidade)}`;
}
async function salvarEmpresa() {
  const nome = el('onbNome').value.trim();
  const whatsapp = el('onbWhats').value.trim();
  const telefone = el('onbTel').value.trim();
  if (!nome) throw new Error('Informe o nome do estabelecimento.');
  if (!whatsapp && !telefone) throw new Error('Informe ao menos um telefone de contato.');
  await api('/empresa', { method: 'PATCH', body: { nome, whatsapp: whatsapp || null, telefone: telefone || null, endereco: el('onbEnd').value.trim() || null, cidade: el('onbCidade').value.trim() || null } });
}

// ---------- Fase 2: horários ----------
function renderHorarios() {
  const atual = Object.keys(ctx.empresa.horario_por_dia || {}).length ? ctx.empresa.horario_por_dia : ctx.presets.horarioPadrao;
  const e = ctx.empresa;
  el('onbBody').innerHTML = `
    <p class="onb-ajuda">A agenda só oferece horários dentro do expediente de cada dia.</p>
    <div class="onb-dias">${DIAS.map(([k, nome]) => {
      const d = atual[k] || { ativo: false, inicio: '09:00', fim: '19:00' };
      return `<div class="onb-dia" data-dia="${k}">
        <label class="filter-inline"><input type="checkbox" data-campo="ativo" ${d.ativo ? 'checked' : ''}/> ${nome}</label>
        <input type="time" data-campo="inicio" value="${escapeHtml(d.inicio)}" aria-label="Abre ${nome}"/>
        <input type="time" data-campo="fim" value="${escapeHtml(d.fim)}" aria-label="Fecha ${nome}"/>
      </div>`;
    }).join('')}</div>
    <div class="field"><label for="onbSlot">Intervalo da grade da agenda</label>
      <select id="onbSlot">${[10, 15, 20, 30, 45, 60].map(n => `<option value="${n}" ${Number(e.slot_padrao || 30) === n ? 'selected' : ''}>${n} min</option>`).join('')}</select></div>
    <label class="filter-inline"><input type="checkbox" id="onbAlmoco" ${e.intervalo_almoco ? 'checked' : ''}/> Fechar para almoço</label>
    <div class="onb-linha" id="onbAlmocoHoras">
      <input type="time" id="onbAlmocoIni" value="${escapeHtml(e.almoco_inicio || '12:00')}" aria-label="Início do almoço"/>
      <input type="time" id="onbAlmocoFim" value="${escapeHtml(e.almoco_fim || '13:00')}" aria-label="Fim do almoço"/>
    </div>`;
}
async function salvarHorarios() {
  const horarioPorDia = {};
  el('onbBody').querySelectorAll('[data-dia]').forEach(linha => {
    const v = c => linha.querySelector(`[data-campo="${c}"]`);
    horarioPorDia[linha.dataset.dia] = { ativo: v('ativo').checked, inicio: v('inicio').value, fim: v('fim').value };
  });
  if (!Object.values(horarioPorDia).some(d => d.ativo)) throw new Error('Marque ao menos um dia de funcionamento.');
  const almoco = el('onbAlmoco').checked;
  await api('/empresa', {
    method: 'PATCH',
    body: { horarioPorDia, slotPadrao: Number(el('onbSlot').value), intervaloAlmoco: almoco, almocoInicio: el('onbAlmocoIni').value || null, almocoFim: el('onbAlmocoFim').value || null }
  });
}

// ---------- Fase 3: pagamentos ----------
function renderPagamentos() {
  const existentes = new Set((ctx.catalogo.formas_pagamento || []).map(f => f.code));
  el('onbBody').innerHTML = `
    <p class="onb-ajuda">Taxas são <b>exemplos</b>: confira as do seu contrato com a operadora. Elas entram no cálculo da comissão.</p>
    ${ctx.presets.formasPagamento.map(f => `
      <div class="onb-item" data-code="${escapeHtml(f.code)}">
        <label class="filter-inline"><input type="checkbox" ${existentes.has(f.code) ? 'checked disabled' : 'checked'}/> ${escapeHtml(f.label)}${existentes.has(f.code) ? ' (já cadastrada)' : ''}</label>
        <label class="onb-mini">Taxa % <input type="number" step="0.01" min="0" data-campo="taxa" value="${f.taxaPct}" ${existentes.has(f.code) ? 'disabled' : ''}/></label>
        <label class="onb-mini">Recebe em (dias) <input type="number" min="0" data-campo="dias" value="${f.diasRecebimento}" ${existentes.has(f.code) ? 'disabled' : ''}/></label>
      </div>`).join('')}`;
}
async function salvarPagamentos() {
  const itens = [];
  el('onbBody').querySelectorAll('[data-code]').forEach(linha => {
    const marcado = linha.querySelector('input[type=checkbox]');
    if (!marcado.checked || marcado.disabled) return;
    const base = ctx.presets.formasPagamento.find(f => f.code === linha.dataset.code);
    itens.push({ code: base.code, label: base.label, taxaPct: Number(linha.querySelector('[data-campo=taxa]').value || 0), diasRecebimento: Number(linha.querySelector('[data-campo=dias]').value || 0) });
  });
  if (itens.length) await api('/onboarding/formas', { method: 'POST', body: { itens } });
  else if (!(ctx.catalogo.formas_pagamento || []).length) throw new Error('Escolha ao menos uma forma de pagamento.');
}

// ---------- Fase 4: catálogo ----------
function renderCatalogo() {
  const nicho = ctx.nicho || ctx.presets.nichos[0].id;
  const existentes = new Set((ctx.catalogo.servicos || []).map(s => s.nome.trim().toLowerCase()));
  const lista = ctx.presets.nichos.find(n => n.id === nicho).servicos;
  el('onbBody').innerHTML = `
    <p class="onb-ajuda">Comece por um cardápio pronto e ajuste preço, tempo e comissão. Depois dá para editar tudo em Gestão.</p>
    <div class="onb-nichos">${ctx.presets.nichos.map(n => `<button type="button" class="chip${n.id === nicho ? ' selected' : ''}" data-nicho="${n.id}">${escapeHtml(n.nome)}</button>`).join('')}</div>
    ${(ctx.catalogo.servicos || []).length ? `<p class="onb-ajuda">Você já tem ${(ctx.catalogo.servicos || []).length} serviço(s) cadastrado(s).</p>` : ''}
    ${lista.map((s, i) => {
      const ja = existentes.has(s.nome.trim().toLowerCase());
      return `<div class="onb-item" data-idx="${i}">
        <label class="filter-inline"><input type="checkbox" ${ja ? 'checked disabled' : 'checked'}/> ${escapeHtml(s.nome)}${ja ? ' (já cadastrado)' : ''}</label>
        <div class="onb-linha">
          <label class="onb-mini">R$ <input type="number" step="0.01" min="0" data-campo="valor" value="${reais(s.valorCentavos)}" ${ja ? 'disabled' : ''}/></label>
          <label class="onb-mini">min <input type="number" min="5" step="5" data-campo="duracao" value="${s.duracaoMin}" ${ja ? 'disabled' : ''}/></label>
          <label class="onb-mini">comissão % <input type="number" min="0" max="100" data-campo="comissao" value="${s.comissaoPct}" ${ja ? 'disabled' : ''}/></label>
        </div>
      </div>`;
    }).join('')}`;
}
async function salvarCatalogo() {
  const lista = ctx.presets.nichos.find(n => n.id === (ctx.nicho || ctx.presets.nichos[0].id)).servicos;
  const itens = [];
  el('onbBody').querySelectorAll('[data-idx]').forEach(linha => {
    const marcado = linha.querySelector('input[type=checkbox]');
    if (!marcado.checked || marcado.disabled) return;
    const s = lista[Number(linha.dataset.idx)];
    const v = c => linha.querySelector(`[data-campo="${c}"]`).value;
    itens.push({ nome: s.nome, categoria: s.categoria, valorCentavos: centavos(v('valor')), duracaoMin: Number(v('duracao')), comissaoPct: Number(v('comissao')) });
  });
  if (itens.length) await api('/onboarding/servicos', { method: 'POST', body: { itens } });
  else if (!(ctx.catalogo.servicos || []).length) throw new Error('Escolha ao menos um serviço.');
}

// ---------- Fase 5: equipe ----------
function renderEquipe() {
  const servicos = (ctx.catalogo.servicos || []).filter(s => s.ativo !== false);
  const profs = (ctx.catalogo.profissionais || []).filter(p => p.ativo !== false);
  const vinculos = ctx.catalogo.profissional_servicos || [];
  const convite = p => waLink(p.whatsapp, `Olá, ${p.nome}! Você foi cadastrado(a) na equipe do ${ctx.empresa.nome} no HOPE OS. Em breve você recebe o convite por e-mail para criar sua senha.`);
  el('onbBody').innerHTML = `
    <p class="onb-ajuda">Cadastre quem atende. Cada pessoa herda os serviços marcados; use "Personalizar" só para exceções (ex.: tempo ou preço diferente).</p>
    ${profs.length ? `<div class="onb-equipe">${profs.map(p => `
      <div class="onb-item"><b>${escapeHtml(p.nome)}</b>
        <span class="onb-ajuda">${vinculos.filter(v => v.profissional_id === p.id).length} serviço(s)</span>
        ${p.whatsapp ? `<a class="chip" target="_blank" rel="noopener" href="${escapeHtml(convite(p))}">Avisar no WhatsApp</a>` : ''}
      </div>`).join('')}</div>` : ''}
    <form id="onbProfForm" class="onb-form" novalidate>
      <h3>Adicionar profissional</h3>
      <div class="field"><label for="onbProfNome">Nome</label><input id="onbProfNome" required/></div>
      <div class="field"><label for="onbProfWhats">WhatsApp (opcional)</label><input id="onbProfWhats" type="tel" inputmode="tel"/></div>
      ${sessionRoleIn('admin') && state.session && state.session.principal === 'user' ? `<div class="field"><label for="onbProfEmail">E-mail para acesso ao app (opcional)</label><input id="onbProfEmail" type="email"/></div>` : ''}
      <div class="field"><label for="onbProfModelo">Taxa da maquininha</label>
        <select id="onbProfModelo">${MODELOS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <p class="onb-ajuda" id="onbModeloAjuda">${MODELOS[0][2]}</p></div>
      <div class="field"><label>Serviços que atende</label>
        ${servicos.map(s => `<div class="onb-item" data-servico="${s.id}">
          <label class="filter-inline"><input type="checkbox" checked/> ${escapeHtml(s.nome)} · ${centsToBRL(s.valor_centavos)} · ${s.duracao_min} min</label>
          <details><summary>Personalizar</summary><div class="onb-linha">
            <label class="onb-mini">R$ <input type="number" step="0.01" min="0" data-campo="valor" placeholder="${reais(s.valor_centavos)}"/></label>
            <label class="onb-mini">min <input type="number" min="5" step="5" data-campo="duracao" placeholder="${s.duracao_min}"/></label>
            <label class="onb-mini">comissão % <input type="number" min="0" max="100" data-campo="comissao" placeholder="${s.comissao_pct}"/></label>
          </div></details></div>`).join('')}
      </div>
      <button type="submit" class="btn btn-secondary">Adicionar à equipe</button>
    </form>`;
  el('onbProfModelo').onchange = () => { el('onbModeloAjuda').textContent = MODELOS.find(m => m[0] === el('onbProfModelo').value)[2]; };
  el('onbProfForm').onsubmit = ev => { ev.preventDefault(); adicionarProfissional().catch(err => { el('onbErro').textContent = err.message; }); };
}
async function adicionarProfissional() {
  const nome = el('onbProfNome').value.trim();
  if (!nome) throw new Error('Informe o nome do profissional.');
  const escolhidos = [...el('onbBody').querySelectorAll('[data-servico]')].filter(l => l.querySelector('input[type=checkbox]').checked);
  if (!escolhidos.length) throw new Error('Marque ao menos um serviço.');
  const email = el('onbProfEmail') ? el('onbProfEmail').value.trim() : '';
  const prof = await api('/profissionais', { method: 'POST', body: { nome, whatsapp: el('onbProfWhats').value.trim() || undefined, modeloComissao: el('onbProfModelo').value } });
  await api(`/profissionais/${prof.id}/servicos`, { method: 'PUT', body: { servicoIds: escolhidos.map(l => l.dataset.servico) } });
  for (const linha of escolhidos) {
    const v = c => linha.querySelector(`[data-campo="${c}"]`).value.trim();
    const override = {};
    if (v('valor')) override.valorCentavos = centavos(v('valor'));
    if (v('duracao')) override.duracaoMin = Number(v('duracao'));
    if (v('comissao')) override.comissaoPct = Number(v('comissao'));
    if (Object.keys(override).length) await api(`/profissionais/${prof.id}/servicos/${linha.dataset.servico}/override`, { method: 'PATCH', body: override });
  }
  if (email) {
    let unidades = await api('/admin/unidades');
    if (!unidades.some(u => u.ativo !== false)) unidades = [await api('/admin/unidades', { method: 'POST', body: { nome: 'Unidade principal' } })];
    await api('/admin/invites', { method: 'POST', body: { email, role: 'profissional', profissionalId: prof.id, unitIds: unidades.filter(u => u.ativo !== false).map(u => u.id) } });
  }
  await recarregar();
  render();
}
async function salvarEquipe() {
  if (!ctx.status.fases.find(f => f.id === 'equipe').concluida) throw new Error('Adicione ao menos um profissional com serviço.');
}

// ---------- Fase 6: simulação ----------
function parametrosEfetivos(prof, servico) {
  const ov = (prof.overrides || {})[servico.id] || {};
  return { valor: Number(ov.valor_centavos ?? servico.valor_centavos), duracao: Number(ov.duracao_min ?? servico.duracao_min) };
}
function renderSimulacao() {
  const profs = (ctx.catalogo.profissionais || []).filter(p => p.ativo !== false);
  const vinculos = ctx.catalogo.profissional_servicos || [];
  const formas = (ctx.catalogo.formas_pagamento || []).filter(f => f.ativo !== false);
  el('onbBody').innerHTML = `
    <p class="onb-ajuda">Veja como fica a divisão de um atendimento. <b>É só simulação: nada é gravado no caixa.</b></p>
    <div class="field"><label for="onbSimProf">Profissional</label><select id="onbSimProf">${profs.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('')}</select></div>
    <div class="field"><label for="onbSimServ">Serviço</label><select id="onbSimServ"></select></div>
    <div class="field"><label for="onbSimForma">Pagamento</label><select id="onbSimForma">${formas.map(f => `<option value="${escapeHtml(f.code)}">${escapeHtml(f.label)}</option>`).join('')}</select></div>
    <div id="onbSimResultado" class="onb-resultado" aria-live="polite"></div>`;
  const preencherServicos = () => {
    const pid = el('onbSimProf').value;
    const ids = vinculos.filter(v => v.profissional_id === pid).map(v => v.servico_id);
    el('onbSimServ').innerHTML = (ctx.catalogo.servicos || []).filter(s => ids.includes(s.id)).map(s => `<option value="${s.id}">${escapeHtml(s.nome)}</option>`).join('');
  };
  el('onbSimProf').onchange = () => { preencherServicos(); simular(); };
  el('onbSimServ').onchange = simular;
  el('onbSimForma').onchange = simular;
  preencherServicos();
  simular();
}
async function simular() {
  const prof = (ctx.catalogo.profissionais || []).find(p => p.id === el('onbSimProf').value);
  const servico = (ctx.catalogo.servicos || []).find(s => s.id === el('onbSimServ').value);
  const out = el('onbSimResultado');
  if (!prof || !servico) { out.innerHTML = ''; return; }
  const { valor, duracao } = parametrosEfetivos(prof, servico);
  out.innerHTML = '<span class="onb-ajuda">Calculando…</span>';
  try {
    const r = await api('/checkout/preview', { method: 'POST', body: { itens: [{ tipo: 'servico', servicoId: servico.id, profissionalId: prof.id }], payments: [{ formaCode: el('onbSimForma').value, valorCentavos: valor }] } });
    const t = r.totals;
    const linha = (rotulo, v, classe = '') => `<div class="onb-res-linha ${classe}"><span>${escapeHtml(rotulo)}</span><b>${v < 0 ? '− ' : ''}${centsToBRL(Math.abs(v))}</b></div>`;
    out.innerHTML = `
      <div class="onb-ajuda">${escapeHtml(servico.nome)} com ${escapeHtml(prof.nome)} · ${duracao} min</div>
      ${linha('Cliente paga', t.totalRecebidoCentavos)}
      ${linha('Taxa da forma de pagamento', -t.taxaTotalCentavos, 'saida')}
      ${linha(`Comissão de ${prof.nome}`, t.totalComissaoCentavos)}
      ${linha('Fica para o salão', t.receitaEmpresaCentavos, 'liquido')}`;
  } catch (err) {
    out.innerHTML = `<span class="login-erro">${escapeHtml(err.message)}</span>`;
  }
}

const RENDER = { empresa: renderEmpresa, horarios: renderHorarios, pagamentos: renderPagamentos, catalogo: renderCatalogo, equipe: renderEquipe, simulacao: renderSimulacao };
const SALVAR = { empresa: salvarEmpresa, horarios: salvarHorarios, pagamentos: salvarPagamentos, catalogo: salvarCatalogo, equipe: salvarEquipe, simulacao: async () => {} };

async function avancar() {
  const btn = el('btnOnbProximo');
  btn.disabled = true;
  try {
    await SALVAR[ctx.fase]();
    await recarregar();
    if (ctx.fase === 'simulacao') {
      if (!ctx.status.completo) { irPara(ctx.status.proximaFase); throw new Error('Ainda falta concluir esta fase.'); }
      return fechar();
    }
    irPara(proximaDepoisDe(ctx.fase));
  } catch (err) {
    el('onbErro').textContent = err.message || 'Não foi possível salvar.';
  } finally {
    btn.disabled = false;
  }
}

function fechar() {
  el('onboardingScreen').classList.add('hidden');
  const resolver = ctx.resolver;
  ctx = null;
  resolver();
}

// Abre o assistente e resolve quando o gestor conclui ou adia.
export async function abrirOnboarding(fase) {
  if (ctx) return;
  ctx = { presets: await api('/onboarding/presets') };
  await recarregar();
  ctx.fase = fase || ctx.status.proximaFase || 'simulacao';
  el('loadingScreen')?.classList.add('hidden');
  el('onboardingScreen').classList.remove('hidden');
  return new Promise(resolve => {
    ctx.resolver = resolve;
    el('onbProgresso').onclick = ev => { const b = ev.target.closest('[data-fase]'); if (b) irPara(b.dataset.fase); };
    el('onbBody').onclick = ev => {
      const n = ev.target.closest('[data-nicho]');
      if (n) { ctx.nicho = n.dataset.nicho; renderCatalogo(); }
    };
    el('btnOnbProximo').onclick = avancar;
    el('btnOnbVoltar').onclick = () => { const ids = ctx.status.fases.map(f => f.id); irPara(ids[Math.max(ids.indexOf(ctx.fase) - 1, 0)]); };
    el('btnOnbDepois').onclick = () => { try { sessionStorage.setItem(ADIADO_KEY, '1'); } catch { /* sem storage */ } fechar(); };
    render();
  });
}

// No boot: só para quem configura (admin/gestão ou legado) e só se faltar algo.
export async function talvezAbrirOnboarding() {
  if (!sessionRoleIn('admin', 'gestor') || adiado()) return false;
  const status = await api('/onboarding/status');
  if (status.completo) return false;
  await abrirOnboarding(status.proximaFase);
  return true;
}
