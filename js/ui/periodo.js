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

// Atalhos de cada tipo de campo (D-088). Passado: o que já aconteceu (comandas, estornos, caixa).
// Futuro: planejamento (escala, folga): nada para trás.
export const ROTULOS_ATALHO = {
  hoje: 'Hoje', ontem: 'Ontem', semana: 'Esta semana', mes: 'Este mês', mesant: 'Mês anterior', pers: 'Personalizado',
  amanha: 'Amanhã', semanaToda: 'Esta semana', proxSemana: 'Próxima semana', mesResto: 'Resto do mês', proxMes: 'Próximo mês'
};
export const ATALHOS_POR_TIPO = {
  passado: ['hoje', 'ontem', 'semana', 'mes', 'mesant', 'pers'],
  futuro: ['hoje', 'amanha', 'semanaToda', 'proxSemana', 'mesResto', 'proxMes', 'pers']
};

export function intervaloDoAtalho(atalho, hoje) {
  const [a, m, d] = partes(hoje);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  if (atalho === 'hoje') return { inicio: hoje, fim: hoje };
  if (atalho === 'ontem') { const o = somarDias(hoje, -1); return { inicio: o, fim: o }; }
  if (atalho === 'amanha') { const o = somarDias(hoje, 1); return { inicio: o, fim: o }; }
  if (atalho === 'semanaToda') return { inicio: hoje, fim: somarDias(hoje, 6 - dow) };
  if (atalho === 'proxSemana') { const i = somarDias(hoje, 7 - dow); return { inicio: i, fim: somarDias(i, 6) }; }
  if (atalho === 'mesResto') return { inicio: hoje, fim: paraIso(a, m + 1, 0) };
  if (atalho === 'proxMes') return { inicio: paraIso(a, m + 1, 1), fim: paraIso(a, m + 2, 0) };
  if (atalho === 'semana') return { inicio: somarDias(hoje, -dow), fim: hoje };
  if (atalho === 'mes') return { inicio: paraIso(a, m, 1), fim: hoje };
  if (atalho === 'mesant') return { inicio: paraIso(a, m - 1, 1), fim: paraIso(a, m, 0) };
  return null;
}

export function rotuloPeriodo(inicio, fim) {
  return inicio === fim ? br(inicio) : br(inicio) + ' a ' + br(fim);
}

// Calendário de um mês ('AAAA-MM'). `escolha` = primeiro toque ainda sem o segundo.
// `min`/`max` (D-088): datas fora ficam desligadas. Sem eles, vale o de antes: nada depois de hoje.
export function htmlCalendario(mes, { inicio, fim, escolha, hoje, min = null, max = hoje }) {
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
    dias += `<button type="button" class="${cls.join(' ')}" data-dia="${dia}"${dia > max || (min && dia < min) ? ' disabled' : ''} aria-label="${dd} de ${MESES[mm - 1]}"${dia >= ini && dia <= fi ? ' aria-pressed="true"' : ''}>${dd}</button>`;
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

// Seletor de período reutilizável (D-088): atalhos, resumo e o calendário de dois toques, como o das
// Comandas. `tipo` escolhe os atalhos e os limites (passado: até hoje; futuro: de hoje a +92 dias).
// `aoMudar({inicio, fim})` só é chamado quando o intervalo fica completo (o primeiro toque espera o segundo).
export function criarSeletorPeriodo(raiz, { tipo = 'passado', hoje, aoMudar, rotulo = 'Período' }) {
  const chaves = ATALHOS_POR_TIPO[tipo] || ATALHOS_POR_TIPO.passado;
  let atalho = chaves[0];
  let periodo = intervaloDoAtalho(atalho, hoje());
  let calMes = null;
  let escolha = null;
  const limites = () => (tipo === 'futuro' ? { min: hoje(), max: somarDias(hoje(), MAX_DIAS_PERIODO - 1) } : { min: null, max: hoje() });
  function desenhar() {
    const chips = chaves.map(k => `<button type="button" class="chip per-atalho${k === atalho ? ' selected' : ''}" data-atalho="${k}" aria-pressed="${k === atalho}">${escapeHtml(ROTULOS_ATALHO[k])}</button>`).join('');
    const n = diasNoIntervalo(periodo.inicio, periodo.fim);
    const resumo = escolha ? 'A partir de ' + rotuloPeriodo(escolha, escolha) + '…' : rotuloPeriodo(periodo.inicio, periodo.fim) + (n > 1 ? ' · ' + n + ' dias' : '');
    const cal = atalho === 'pers'
      ? htmlCalendario(calMes || periodo.fim.slice(0, 7), { inicio: periodo.inicio, fim: periodo.fim, escolha, hoje: hoje(), ...limites() })
      : '';
    raiz.innerHTML = `<div class="per-atalhos" role="group" aria-label="${escapeHtml(rotulo)}">${chips}</div><p class="per-resumo" role="status">${escapeHtml(resumo)}</p>${cal}`;
  }
  function definir(r) { periodo = r; escolha = null; desenhar(); aoMudar && aoMudar({ ...periodo }); }
  raiz.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-atalho], [data-dia], [data-cal-nav]');
    if (!b || b.disabled || !raiz.contains(b)) return;
    if (b.dataset.atalho) {
      atalho = b.dataset.atalho; escolha = null;
      if (atalho === 'pers') { calMes = periodo.fim.slice(0, 7); desenhar(); return; }
      definir(intervaloDoAtalho(atalho, hoje()));
      return;
    }
    if (b.dataset.calNav) { calMes = mesSeguinte(calMes, Number(b.dataset.calNav)); desenhar(); return; }
    const dia = b.dataset.dia;
    if (!escolha) { escolha = dia; desenhar(); return; }
    let [ini, fim] = [escolha, dia].sort();
    if (diasNoIntervalo(ini, fim) > MAX_DIAS_PERIODO) fim = somarDias(ini, MAX_DIAS_PERIODO - 1);
    definir({ inicio: ini, fim });
  });
  desenhar();
  return {
    periodo: () => ({ ...periodo }),
    voltarAoInicio() { atalho = chaves[0]; escolha = null; periodo = intervaloDoAtalho(atalho, hoje()); desenhar(); }
  };
}
