import { api } from './api.js';
import { startOfWeek, todayStr, weekDates } from './utils.js';

export const stateBus = new EventTarget();

export const state = {
  catalog: { clientes: [], servicos: [], produtos: [], profissionais: [], formas_pagamento: [] },
  currentWeekStart: startOfWeek(todayStr()),
  weekAgenda: {},
  currentPayload: null,
  currentPreview: null,
  agendamentoIdParaCheckout: null,
  reagendarAlvoId: null,
  activeTab: 'agenda',
  dragging: null,
  resizing: null,
  selectedDay: todayStr(),
  activeProfFilter: null, // null = "Todos"
  insights: {
    occupancy: null,
    margin: null,
    cashflow: null,
    retention: null,
    attach: null,
    loading: false,
    error: null,
    updatedAt: null
  },

  // V1.3 Checkout Premium
  checkoutTab: 'servicos', // ou 'produtos'
  tip: 0, // em centavos
  splitEnabled: false,
  splits: [{ id: 's1', method: '', amount: '' }],
  cart: {
    servicos: [], // [{ servicoId, profissionalId, ... }]
    produtos: [], // [{ produtoId, quantidade, ... }]
  },
};

export const PROF_COLORS = ['#16a34a', '#f59e0b', '#dc2626', '#2563eb', '#7c3aed', '#0891b2', '#db2777'];

export function activeProfissionais() {
  return (state.catalog.profissionais || []).filter(p => p.ativo !== false);
}

export function profColor(profId) {
  const idx = activeProfissionais().findIndex(p => p.id === profId);
  return idx === -1 ? 'var(--md-outline)' : PROF_COLORS[idx % PROF_COLORS.length];
}

export function findClienteNome(id) {
  const c = state.catalog.clientes.find(x => x.id === id);
  return c ? c.nome : 'Sem cliente';
}

export function findServicoNome(id) {
  const s = state.catalog.servicos.find(x => x.id === id);
  return s ? s.nome : '—';
}

export function findProfissionalNome(id) {
  const p = state.catalog.profissionais.find(x => x.id === id);
  return p ? p.nome : '—';
}

export function findAgendaItemById(id) {
  for (const dateStr of Object.keys(state.weekAgenda)) {
    const found = (state.weekAgenda[dateStr] || []).find(i => i.id === id);
    if (found) return found;
  }
  return null;
}

export function computeEndTime(item) {
  const [h, m] = String(item.horario).slice(0, 5).split(':').map(Number);
  const duracao = item.duracao_min || 30;
  const totalMin = h * 60 + m + duracao;
  return String(Math.floor(totalMin / 60) % 24).padStart(2, '0') + ':' + String(totalMin % 60).padStart(2, '0');
}

export async function loadCatalog() {
  state.catalog = await api('/catalog');
  stateBus.dispatchEvent(new CustomEvent('catalog:updated', { detail: state.catalog }));
}

export async function loadWeekAgenda() {
  const dates = weekDates(state.currentWeekStart);
  const results = await Promise.all(dates.map(d => api('/agenda?data=' + encodeURIComponent(d)).catch(() => [])));
  state.weekAgenda = {};
  dates.forEach((d, i) => { state.weekAgenda[d] = results[i]; });
  stateBus.dispatchEvent(new CustomEvent('agenda:updated', { detail: state.weekAgenda }));
}
