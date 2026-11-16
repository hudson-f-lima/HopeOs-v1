// Gestão → Planos (assinatura, Onda A fase 1; D-042, migration 021). Lista, cria, edita e arquiva
// planos; simula "e se o assinante viesse neste dia, com este profissional?". O servidor valida e
// decide tudo; esta tela só mostra e envia. Ver e simular: assinatura:ver. Editar: planos:editar.
import { api } from '../api.js';
import { state, sessionPode } from '../state.js';
import { escapeHtml, showBanner, centsToBRL } from '../utils.js';

const el = id => document.getElementById(id);
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PERIODO = { mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
const VENC = { base_contratacao: 'Na data da contratação', base_contratacao_fixa: 'Na data da contratação (fixa)', data_fixa: 'Dia fixo do mês' };
const COMISSAO = { rateio: 'Rateio: % do valor do plano dividido pelos atendimentos do ciclo', tabela: 'Comissão normal do serviço (tabela)', fixo_por_uso: 'Valor fixo por atendimento' };
const FORA = {
  bloquear: 'Cobrar o valor cheio e não gastar uso (padrão)',
  cobrar_percentual_consumir: 'Cobrar uma % do serviço e gastar 1 uso',
  cobrar_percentual_sem_consumir: 'Cobrar uma % do serviço sem gastar uso',
  cobertura_total: 'Cobrir normalmente (só avisar)'
};
const SITUACAO = { coberto: 'Coberto pelo plano', fora_da_regra: 'Fora da regra do plano', nao_coberto: 'Serviço fora do plano', limite_atingido: 'Limite do ciclo atingido' };
let planos = [];
let editando = null; // null = fechado; {} = novo; plano = edição

const servicos = () => (state.catalog.servicos || []).filter(s => s.ativo !== false);
const profissionais = () => (state.catalog.profissionais || []).filter(p => p.ativo !== false);
const nomeServico = id => { const s = (state.catalog.servicos || []).find(x => x.id === id); return s ? s.nome : 'Serviço removido'; };
const opcoes = (mapa, sel) => Object.entries(mapa).map(([v, t]) => '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + escapeHtml(t) + '</option>').join('');
const reais = v => (v === null || v === undefined || v === '' ? '' : (Number(v) / 100).toFixed(2).replace('.', ','));
const centavos = txt => { const n = Number(String(txt || '').trim().replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const numOuNulo = v => (String(v).trim() === '' ? null : Number(v));

function resumoItem(i) {
  const partes = [nomeServico(i.servicoId)];
  partes.push(i.limitePorCiclo ? i.limitePorCiclo + ' por ciclo' : 'ilimitado');
  if (i.descontoPercentual < 100) partes.push(i.descontoPercentual + '% de desconto');
  if (i.diasSemana) partes.push(i.diasSemana.map(d => DIAS[d]).join('/'));
  if (i.horarioInicio) partes.push(i.horarioInicio + '–' + i.horarioFim);
  if (i.intervaloMinDias) partes.push('a cada ' + i.intervaloMinDias + ' dia(s)');
  return partes.join(' · ');
}

function resumoFora(f) {
  if (f.acao === 'bloquear') return 'Fora da regra: cobra o valor cheio';
  const pct = f.percentual === null ? '' : f.percentual + '% ';
  const base = f.acao === 'cobertura_total' ? 'Fora da regra: cobre e avisa'
    : 'Fora da regra: cobra ' + pct + (f.acao === 'cobrar_percentual_consumir' ? 'e gasta 1 uso' : 'sem gastar uso');
  return base + (f.tetoCiclo !== null ? ' (até ' + f.tetoCiclo + ' por ciclo)' : '') + (f.exigeAprovacao ? ' · exige aprovação' : '');
}

function cardPlano(p) {
  const pode = sessionPode('planos:editar');
  const profs = p.profissionais.length ? p.profissionais.map(id => { const x = (state.catalog.profissionais || []).find(y => y.id === id); return x ? x.nome : '?'; }).join(', ') : 'todos';
  return '<article class="card plano-card" data-plano="' + escapeHtml(p.id) + '" style="margin-bottom:10px;">' +
    '<h3 class="m-0">' + escapeHtml(p.nome) + (p.arquivado ? ' <span class="badge">arquivado</span>' : '') + '</h3>' +
    '<p class="body-sm">' + escapeHtml(centsToBRL(p.precoCentavos) + ' · ' + PERIODO[p.periodicidade] + ' · ' + (p.cobranca === 'recorrente' ? 'cobrança recorrente' : 'cobrança manual')) + '</p>' +
    '<ul class="body-sm" style="margin:4px 0 4px 18px;">' + p.itens.map(i => '<li>' + escapeHtml(resumoItem(i)) + '</li>').join('') + '</ul>' +
    '<p class="body-sm text-tertiary">' + escapeHtml('Profissionais: ' + profs) + '</p>' +
    '<p class="body-sm text-tertiary">' + escapeHtml(resumoFora(p.foraDaRegra)) + '</p>' +
    '<p class="body-sm text-tertiary">' + escapeHtml('Comissão: ' + (p.comissao.regra === 'rateio' ? 'rateio de ' + p.comissao.percentual + '% do valor do plano' : p.comissao.regra === 'fixo_por_uso' ? centsToBRL(p.comissao.fixaCentavos) + ' por atendimento' : 'tabela do serviço')) + '</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">' +
      '<button class="btn" type="button" data-plano-acao="simular">Simular</button>' +
      (pode && !p.arquivado ? '<button class="btn" type="button" data-plano-acao="editar">Editar</button><button class="btn danger" type="button" data-plano-acao="arquivar">Arquivar</button>' : '') +
    '</div><div class="plano-simulador hidden"></div></article>';
}

function linhaItem(i, idx) {
  const it = i || { descontoPercentual: 100 };
  return '<fieldset class="plano-item" data-idx="' + idx + '" style="border:1px solid var(--md-outline-variant,#ccc);border-radius:8px;padding:8px;margin-bottom:8px;">' +
    '<div class="field"><label>Serviço</label><select data-c="servicoId"><option value="">Escolha…</option>' +
      servicos().map(s => '<option value="' + escapeHtml(s.id) + '"' + (s.id === it.servicoId ? ' selected' : '') + '>' + escapeHtml(s.nome) + '</option>').join('') + '</select></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<div class="field"><label>Desconto %</label><input data-c="descontoPercentual" inputmode="decimal" value="' + escapeHtml(String(it.descontoPercentual ?? 100)) + '" style="width:80px"/></div>' +
      '<div class="field"><label>Usos por ciclo</label><input data-c="limitePorCiclo" inputmode="numeric" placeholder="ilimitado" value="' + escapeHtml(String(it.limitePorCiclo ?? '')) + '" style="width:100px"/></div>' +
      '<div class="field"><label>Dias mín. entre usos</label><input data-c="intervaloMinDias" inputmode="numeric" placeholder="—" value="' + escapeHtml(String(it.intervaloMinDias ?? '')) + '" style="width:100px"/></div>' +
    '</div>' +
    '<p class="body-sm" style="margin:4px 0;">Dias em que vale (nenhum marcado = todos)</p><div style="display:flex;gap:6px;flex-wrap:wrap;">' +
      DIAS.map((d, n) => '<label class="filter-inline"><input type="checkbox" data-dia="' + n + '"' + (it.diasSemana && it.diasSemana.includes(n) ? ' checked' : '') + '/> ' + d + '</label>').join('') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;"><div class="field"><label>Das</label><input type="time" data-c="horarioInicio" value="' + escapeHtml(it.horarioInicio || '') + '"/></div>' +
      '<div class="field"><label>Até</label><input type="time" data-c="horarioFim" value="' + escapeHtml(it.horarioFim || '') + '"/></div></div>' +
    '<button class="btn danger" type="button" data-item-remover="' + idx + '">Remover serviço</button></fieldset>';
}

function formulario(p) {
  const x = p && p.id ? p : { nome: '', precoCentavos: null, periodicidade: 'mensal', tipoVencimento: 'base_contratacao', diaVencimento: null, cobranca: 'manual', disponivelVenda: true, toleranciaDias: 7,
    comissao: { regra: 'rateio', percentual: 50, fixaCentavos: null }, foraDaRegra: { acao: 'bloquear', percentual: null, tetoCiclo: null, exigeAprovacao: false }, itens: [{ descontoPercentual: 100 }], profissionais: [] };
  return '<form id="formPlano" class="card" novalidate style="margin-bottom:12px;">' +
    '<h3 class="m-0">' + (x.id ? 'Editar plano' : 'Novo plano') + '</h3>' +
    '<div class="field"><label for="planoNome">Nome</label><input id="planoNome" maxlength="80" value="' + escapeHtml(x.nome) + '"/></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;"><div class="field"><label for="planoPreco">Preço (R$)</label><input id="planoPreco" inputmode="decimal" placeholder="94,90" value="' + escapeHtml(reais(x.precoCentavos)) + '" style="width:110px"/></div>' +
      '<div class="field"><label for="planoPeriodo">Periodicidade</label><select id="planoPeriodo">' + opcoes(PERIODO, x.periodicidade) + '</select></div>' +
      '<div class="field"><label for="planoTolerancia">Tolerância de atraso (dias)</label><input id="planoTolerancia" inputmode="numeric" value="' + escapeHtml(String(x.toleranciaDias)) + '" style="width:80px"/></div></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;"><div class="field"><label for="planoVenc">Vencimento</label><select id="planoVenc">' + opcoes(VENC, x.tipoVencimento) + '</select></div>' +
      '<div class="field' + (x.tipoVencimento === 'data_fixa' ? '' : ' hidden') + '" id="planoDiaBox"><label for="planoDia">Dia (1 a 28)</label><input id="planoDia" inputmode="numeric" value="' + escapeHtml(String(x.diaVencimento ?? '')) + '" style="width:70px"/></div>' +
      '<div class="field"><label for="planoCobranca">Cobrança</label><select id="planoCobranca">' + opcoes({ manual: 'Manual (o salão cobra)', recorrente: 'Recorrente (cartão; fornecedor a definir)' }, x.cobranca) + '</select></div></div>' +
    '<label class="filter-inline"><input type="checkbox" id="planoVenda"' + (x.disponivelVenda ? ' checked' : '') + '/> Disponível para venda</label>' +
    '<h4>Serviços do plano</h4><div id="planoItens">' + x.itens.map((i, n) => linhaItem(i, n)).join('') + '</div>' +
    '<button class="btn" type="button" id="btnPlanoItem">+ Serviço</button>' +
    '<h4>Profissionais que atendem pelo plano</h4><p class="body-sm text-tertiary">Nenhum marcado = todos.</p><div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      profissionais().map(pr => '<label class="filter-inline"><input type="checkbox" data-prof="' + escapeHtml(pr.id) + '"' + (x.profissionais.includes(pr.id) ? ' checked' : '') + '/> ' + escapeHtml(pr.nome) + '</label>').join('') + '</div>' +
    '<h4>Comissão</h4><div class="field"><select id="planoComRegra">' + opcoes(COMISSAO, x.comissao.regra) + '</select></div>' +
      '<div class="field' + (x.comissao.regra === 'rateio' ? '' : ' hidden') + '" id="planoComPctBox"><label for="planoComPct">% do valor do plano</label><input id="planoComPct" inputmode="decimal" value="' + escapeHtml(String(x.comissao.percentual ?? '')) + '" style="width:80px"/></div>' +
      '<div class="field' + (x.comissao.regra === 'fixo_por_uso' ? '' : ' hidden') + '" id="planoComFixoBox"><label for="planoComFixo">Valor por atendimento (R$)</label><input id="planoComFixo" inputmode="decimal" value="' + escapeHtml(reais(x.comissao.fixaCentavos)) + '" style="width:110px"/></div>' +
    '<h4>Quando o cliente usa fora da regra</h4><p class="body-sm text-tertiary">Dia, horário, profissional ou intervalo fora do que o plano permite. O limite do ciclo não entra aqui: esgotado, cobra cheio.</p>' +
      '<div class="field"><select id="planoForaAcao">' + opcoes(FORA, x.foraDaRegra.acao) + '</select></div>' +
      '<div id="planoForaExtra" class="' + (x.foraDaRegra.acao === 'bloquear' ? 'hidden' : '') + '"><div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<div class="field' + (x.foraDaRegra.acao.startsWith('cobrar') ? '' : ' hidden') + '" id="planoForaPctBox"><label for="planoForaPct">% do serviço</label><input id="planoForaPct" inputmode="decimal" value="' + escapeHtml(String(x.foraDaRegra.percentual ?? '')) + '" style="width:80px"/></div>' +
        '<div class="field"><label for="planoForaTeto">Máximo por ciclo</label><input id="planoForaTeto" inputmode="numeric" placeholder="sem máximo" value="' + escapeHtml(String(x.foraDaRegra.tetoCiclo ?? '')) + '" style="width:110px"/></div></div>' +
        '<label class="filter-inline"><input type="checkbox" id="planoForaAprov"' + (x.foraDaRegra.exigeAprovacao ? ' checked' : '') + '/> Exige liberação de quem pode aprovar</label></div>' +
    '<p class="body-sm" id="planoMsg" role="alert"></p>' +
    '<div style="display:flex;gap:8px;"><button class="btn btn-primary" type="submit" id="btnPlanoSalvar">Salvar</button><button class="btn" type="button" id="btnPlanoCancelar">Cancelar</button></div></form>';
}

function render() {
  const c = el('planosConteudo');
  const lista = planos.length ? planos.map(cardPlano).join('') : '<p class="body-sm text-tertiary">Nenhum plano ainda.</p>';
  c.innerHTML = (sessionPode('planos:editar') && editando === null ? '<button class="btn btn-primary" type="button" id="btnPlanoNovo" style="margin-bottom:10px;">+ Novo plano</button>' : '') +
    (editando !== null ? formulario(editando) : '') + lista;
}

function lerItens() {
  return [...document.querySelectorAll('#planoItens .plano-item')].map(f => {
    const v = c => f.querySelector('[data-c="' + c + '"]').value;
    const dias = [...f.querySelectorAll('[data-dia]')].filter(x => x.checked).map(x => Number(x.dataset.dia));
    return {
      servicoId: v('servicoId'), descontoPercentual: Number(String(v('descontoPercentual')).replace(',', '.')),
      limitePorCiclo: numOuNulo(v('limitePorCiclo')), intervaloMinDias: numOuNulo(v('intervaloMinDias')),
      diasSemana: dias.length ? dias : null, horarioInicio: v('horarioInicio') || null, horarioFim: v('horarioFim') || null
    };
  });
}

async function salvar(ev) {
  ev.preventDefault();
  const acao = el('planoForaAcao').value;
  const regra = el('planoComRegra').value;
  const body = {
    nome: el('planoNome').value, precoCentavos: centavos(el('planoPreco').value), periodicidade: el('planoPeriodo').value,
    tipoVencimento: el('planoVenc').value, diaVencimento: numOuNulo(el('planoDia').value), cobranca: el('planoCobranca').value,
    disponivelVenda: el('planoVenda').checked, toleranciaDias: numOuNulo(el('planoTolerancia').value),
    comissao: { regra, percentual: regra === 'rateio' ? numOuNulo(el('planoComPct').value.replace(',', '.')) : null, fixaCentavos: regra === 'fixo_por_uso' ? centavos(el('planoComFixo').value) : null },
    foraDaRegra: { acao, percentual: acao.startsWith('cobrar') ? numOuNulo(el('planoForaPct').value.replace(',', '.')) : null,
      tetoCiclo: acao === 'bloquear' ? null : numOuNulo(el('planoForaTeto').value), exigeAprovacao: acao !== 'bloquear' && el('planoForaAprov').checked },
    itens: lerItens(),
    profissionais: [...document.querySelectorAll('#formPlano [data-prof]')].filter(x => x.checked).map(x => x.dataset.prof)
  };
  if (!Number.isFinite(body.precoCentavos)) { el('planoMsg').textContent = 'Preço inválido.'; return; }
  el('btnPlanoSalvar').disabled = true;
  try {
    const id = editando && editando.id;
    await api(id ? '/assinaturas/planos/' + encodeURIComponent(id) : '/assinaturas/planos', { method: id ? 'PUT' : 'POST', body });
    editando = null;
    showBanner('Plano salvo.', 'ok');
    await carregarPlanos();
  } catch (err) {
    el('planoMsg').textContent = err.message;
    el('btnPlanoSalvar').disabled = false;
  }
}

function simuladorHtml(p) {
  const hoje = new Date().toLocaleDateString('en-CA');
  return '<form class="plano-sim" novalidate style="margin-top:8px;"><div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<div class="field"><label>Serviço</label><select data-s="servicoId">' + servicos().map(s => '<option value="' + escapeHtml(s.id) + '"' + (p.itens[0] && p.itens[0].servicoId === s.id ? ' selected' : '') + '>' + escapeHtml(s.nome) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Profissional</label><select data-s="profissionalId">' + profissionais().map(pr => '<option value="' + escapeHtml(pr.id) + '">' + escapeHtml(pr.nome) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Dia</label><input type="date" data-s="data" value="' + hoje + '"/></div>' +
    '<div class="field"><label>Hora</label><input type="time" data-s="horario" value="10:00"/></div>' +
    '<div class="field"><label>Usos já feitos no ciclo</label><input data-s="usosNoCiclo" inputmode="numeric" value="0" style="width:70px"/></div>' +
    '<div class="field"><label>Fora da regra no ciclo</label><input data-s="foraDaRegraNoCiclo" inputmode="numeric" value="0" style="width:70px"/></div></div>' +
    '<button class="btn btn-primary" type="submit">Simular</button><p class="body-sm plano-sim-resultado" role="status"></p></form>';
}

async function simular(form, id) {
  const v = c => form.querySelector('[data-s="' + c + '"]').value;
  const out = form.querySelector('.plano-sim-resultado');
  try {
    const r = await api('/assinaturas/planos/' + encodeURIComponent(id) + '/simular', { method: 'POST', body: {
      servicoId: v('servicoId'), profissionalId: v('profissionalId'), data: v('data'), horario: v('horario'),
      usosNoCiclo: Number(v('usosNoCiclo')) || 0, foraDaRegraNoCiclo: Number(v('foraDaRegraNoCiclo')) || 0 } });
    out.textContent = (SITUACAO[r.situacao] || r.situacao) + ': cobra ' + centsToBRL(r.cobrarCentavos) + ' de ' + centsToBRL(r.precoTabelaCentavos) +
      (r.consomeUso ? ', gasta 1 uso' : ', não gasta uso') + (r.exigeAprovacao ? ', exige liberação' : '') + '.' +
      (r.motivos.length ? ' ' + r.motivos.map(m => m.texto).join(' ') : '');
  } catch (err) { out.textContent = err.message; }
}

async function onClick(ev) {
  const t = ev.target;
  if (t.id === 'btnPlanoNovo') { editando = {}; render(); return; }
  if (t.id === 'btnPlanoCancelar') { editando = null; render(); return; }
  if (t.id === 'btnPlanoItem') {
    const box = el('planoItens');
    box.insertAdjacentHTML('beforeend', linhaItem(null, box.children.length));
    return;
  }
  if (t.dataset.itemRemover !== undefined) {
    if (document.querySelectorAll('#planoItens .plano-item').length > 1) t.closest('.plano-item').remove();
    else el('planoMsg').textContent = 'O plano precisa de ao menos um serviço.';
    return;
  }
  const acao = t.dataset.planoAcao;
  if (!acao) return;
  const card = t.closest('[data-plano]');
  const p = planos.find(x => x.id === card.dataset.plano);
  if (acao === 'editar') { editando = p; render(); el('formPlano').scrollIntoView({ block: 'start' }); }
  if (acao === 'arquivar') {
    if (!window.confirm('Arquivar este plano? Ele sai da lista e não pode mais ser vendido.')) return;
    try { await api('/assinaturas/planos/' + encodeURIComponent(p.id) + '/arquivar', { method: 'POST' }); showBanner('Plano arquivado.', 'ok'); await carregarPlanos(); }
    catch (err) { showBanner(err.message, 'error'); }
  }
  if (acao === 'simular') {
    const box = card.querySelector('.plano-simulador');
    if (box.classList.toggle('hidden')) return;
    box.innerHTML = simuladorHtml(p);
  }
}

function onChange(ev) {
  const t = ev.target;
  if (t.id === 'planoVenc') el('planoDiaBox').classList.toggle('hidden', t.value !== 'data_fixa');
  if (t.id === 'planoComRegra') {
    el('planoComPctBox').classList.toggle('hidden', t.value !== 'rateio');
    el('planoComFixoBox').classList.toggle('hidden', t.value !== 'fixo_por_uso');
  }
  if (t.id === 'planoForaAcao') {
    el('planoForaExtra').classList.toggle('hidden', t.value === 'bloquear');
    el('planoForaPctBox').classList.toggle('hidden', !t.value.startsWith('cobrar'));
  }
}

export async function carregarPlanos() {
  if (!sessionPode('assinatura:ver')) return;
  try { planos = await api('/assinaturas/planos'); render(); }
  catch (err) { el('planosConteudo').textContent = err.message; }
}

export function initPlanos() {
  if (!sessionPode('assinatura:ver')) return;
  el('subtabBtnPlanos')?.classList.remove('hidden');
  el('subtabBtnPlanos')?.addEventListener('click', carregarPlanos);
  const c = el('planosConteudo');
  c.addEventListener('click', onClick);
  c.addEventListener('change', onChange);
  c.addEventListener('submit', ev => {
    if (ev.target.id === 'formPlano') return salvar(ev);
    if (ev.target.classList.contains('plano-sim')) { ev.preventDefault(); simular(ev.target, ev.target.closest('[data-plano]').dataset.plano); }
  });
}
