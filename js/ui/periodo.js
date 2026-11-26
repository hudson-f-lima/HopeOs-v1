// Período de consulta (D-082): atalhos de um toque e calendário de dois toques (primeiro e último dia),
// como no extrato do banco. Só cálculo e HTML; quem usa (Comandas) decide o que fazer com o intervalo.
// Datas em 'AAAA-MM-DD'. A semana começa no domingo, como a agenda. O servidor limita a 92 dias.
import { escapeHtml } from '../utils.js';

export const MAX_DIAS_PERIODO = 92;
export const ATALHOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['mesant', 'Mês anterior'], ['pers', 'Personalizado']];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const partes = iso => String(iso).slice(0, 10).split('-').map(Number);
const paraIso = (a, m, d) => { const x = new Date(Date.UTC(a, m - 1, d)); return x.toISOString().slice(0, 10); };
export const somarDias = (iso, n) => { const [a, m, d] = partes(iso); return paraIso(a, m, d + n); };
export const diasNoIntervalo = (inicio, fim) => Math.round((Date.parse(fim + 'T00:00:00Z') - Date.parse(inicio + 'T00:00:00Z')) / 864e5) + 1;
const br = iso => { const [, m, d] = partes(iso); return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0'); };

export function intervaloDoAtalho(atalho, hoje) {
  const [a, m, d] = partes(hoje);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  if (atalho === 'hoje') return { inicio: hoje, fim: hoje };
  if (atalho === 'ontem') { const o = somarDias(hoje, -1); return { inicio: o, fim: o }; }
  if (atalho === 'semana') return { inicio: somarDias(hoje, -dow), fim: hoje };
  if (atalho === 'mes') return { inicio: paraIso(a, m, 1), fim: hoje };
  if (atalho === 'mesant') return { inicio: paraIso(a, m - 1, 1), fim: paraIso(a, m, 0) };
  return null;
}

export function rotuloPeriodo(inicio, fim) {
  return inicio === fim ? br(inicio) : br(inicio) + ' a ' + br(fim);
}

// Calendário de um mês ('AAAA-MM'). `escolha` = primeiro toque ainda sem o segundo.
export function htmlCalendario(mes, { inicio, fim, escolha, hoje }) {
  const [a, m] = mes.split('-').map(Number);
  const prim = paraIso(a, m, 1);
  const comeco = somarDias(prim, -new Date(Date.UTC(a, m - 1, 1)).getUTCDay());
  const ini = escolha || inicio; const fi = escolha || fim;
  let dias = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<span class="per-dw" aria-hidden="true">${x}</span>`).join('');
  for (let i = 0; i < 42; i++) {
    const dia = somarDias(comeco, i);
    const [, mm, dd] = partes(dia);
    const cls = ['per-dia'];
    if (mm !== m) cls.push('fora');
    if (dia === hoje) cls.push('hoje');
    if (dia === ini) cls.push('ini');
    if (dia === fi) cls.push('fim');
    if (dia > ini && dia < fi) cls.push('meio');
    dias += `<button type="button" class="${cls.join(' ')}" data-dia="${dia}"${dia > hoje ? ' disabled' : ''} aria-label="${dd} de ${MESES[mm - 1]}"${dia >= ini && dia <= fi ? ' aria-pressed="true"' : ''}>${dd}</button>`;
  }
  return `<div class="per-cal" role="group" aria-label="Escolher período">
    <div class="per-cal-h"><button type="button" data-cal-nav="-1" aria-label="Mês anterior">‹</button><b>${escapeHtml(MESES[m - 1])} de ${a}</b><button type="button" data-cal-nav="1" aria-label="Próximo mês">›</button></div>
    <div class="per-cal-g">${dias}</div>
    <p class="per-cal-dica" role="status">${escolha ? 'Agora toque no último dia.' : 'Toque no primeiro dia e depois no último.'}</p>
  </div>`;
}

export function mesSeguinte(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  return paraIso(a, m + n, 1).slice(0, 7);
}
