// Calendário do mês reutilizável (D-050): agenda (navegação) e Escalas (gestão). Mostra, por dia,
// o estado da unidade (aberta, fechada, horário especial, sem expediente), quantos agendamentos e
// quantos CONFLITOS (agendamento fora da disponibilidade, que ficou por decisão "manter" ou
// encaixe). Tudo vem do servidor (/disponibilidade/mes); aqui só desenha. Estado com símbolo e
// rótulo para leitor de tela, não só cor. Opcional: escolher datas não consecutivas.
import { api } from '../api.js';
import { escapeHtml, todayStr } from '../utils.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const ESTADO = {
  aberta: { s: '', rotulo: 'aberto' },
  especial: { s: '★', rotulo: 'horário especial' },
  fechada: { s: '✕', rotulo: 'fechado' },
  sem_horario: { s: '–', rotulo: 'sem expediente' }
};
const somaMes = (m, n) => { const [a, b] = m.split('-').map(Number); return new Date(Date.UTC(a, b - 1 + n, 1)).toISOString().slice(0, 7); };

// opts: { filtro() → ids|null, selecionado() → 'AAAA-MM-DD', podeEscolher, aoTocarDia(data),
//         aoAplicarDatas(datas[]), textoAplicar }
export function montarCalendario(raiz, opts = {}) {
  let mes = ((opts.selecionado && opts.selecionado()) || todayStr()).slice(0, 7);
  let dados = null; let escolhendo = false; const escolhidas = new Set(); let seq = 0;
  raiz.classList.add('agm');
  raiz.innerHTML = `
    <div class="agm-topo">
      <button class="agm-nav" type="button" data-cal="ant" aria-label="Mês anterior">‹</button>
      <b class="agm-titulo" aria-live="polite">—</b>
      <button class="agm-nav" type="button" data-cal="prox" aria-label="Próximo mês">›</button>
    </div>
    <div class="agm-grade" data-cal="grade"></div>
    <p class="agm-legenda">★ especial · ✕ fechado · – sem expediente · ⚠ conflito · nº = agendamentos</p>
    ${opts.podeEscolher ? `<div class="agm-rodape"><button class="agm-chip" type="button" data-cal="escolher" aria-pressed="false">Escolher datas</button>
      <span class="agm-escolha-txt" aria-live="polite"></span>
      <button class="agm-chip agm-aplicar hidden" type="button" data-cal="aplicar">${escapeHtml(opts.textoAplicar || 'Aplicar…')}</button></div>` : ''}`;
  const q = sel => raiz.querySelector(sel);

  async function carregar() {
    const n = ++seq;
    const filtro = opts.filtro ? opts.filtro() : null;
    q('[data-cal="grade"]').setAttribute('aria-busy', 'true');
    try {
      const r = await api('/disponibilidade/mes?mes=' + mes + (filtro ? '&profissionalIds=' + encodeURIComponent(filtro.join(',')) : ''));
      if (n !== seq) return;
      dados = r;
    } catch (err) {
      if (n === seq) q('[data-cal="grade"]').innerHTML = '<p class="body-sm" role="alert">' + escapeHtml(err.message) + '</p>';
      return;
    } finally { q('[data-cal="grade"]').removeAttribute('aria-busy'); }
    desenhar();
  }

  function desenhar() {
    const [a, b] = mes.split('-').map(Number);
    q('.agm-titulo').textContent = MESES[b - 1] + ' ' + a;
    const primeiro = new Date(Date.UTC(a, b - 1, 1)).getUTCDay();
    const hoje = todayStr(); const sel = opts.selecionado ? opts.selecionado() : null;
    const vazios = Array.from({ length: primeiro }, () => '<span class="agm-vazio" aria-hidden="true"></span>').join('');
    const dias = (dados ? dados.dias : []).map(d => {
      const e = ESTADO[d.unidade] || ESTADO.aberta;
      const partes = [Number(d.data.slice(8, 10)) + ' de ' + MESES[b - 1].toLowerCase(), e.rotulo];
      if (d.agendamentos) partes.push(d.agendamentos + ' agendamento(s)');
      if (d.conflitos) partes.push(d.conflitos + ' conflito(s)');
      if (d.ausencias) partes.push(d.ausencias + ' ausência(s) ou bloqueio(s)');
      if (d.motivo) partes.push(d.motivo);
      const marcado = escolhendo && escolhidas.has(d.data);
      const cls = ['agm-dia', 'agm-' + d.unidade, d.data === sel ? 'agm-sel' : '', d.data === hoje ? 'agm-hoje' : '', marcado ? 'agm-marcado' : '', d.conflitos ? 'agm-tem-conflito' : '', d.ausencias ? 'agm-tem-ausencia' : ''].filter(Boolean).join(' ');
      return '<button type="button" class="' + cls + '" data-agm-dia="' + d.data + '" aria-label="' + escapeHtml(partes.join(', ')) + '"' + (escolhendo ? ' aria-pressed="' + marcado + '"' : '') + '>'
        + '<span class="agm-num">' + Number(d.data.slice(8, 10)) + '</span>'
        + '<span class="agm-est" aria-hidden="true">' + e.s + (d.ausencias ? '<i class="agm-aus">•</i>' : '') + '</span>'
        + (d.agendamentos ? '<span class="agm-qtd" aria-hidden="true">' + d.agendamentos + '</span>' : '')
        + (d.conflitos ? '<span class="agm-conf" aria-hidden="true">⚠' + d.conflitos + '</span>' : '')
        + '</button>';
    }).join('');
    q('[data-cal="grade"]').innerHTML = SEMANA.map(s => '<span class="agm-sem" aria-hidden="true">' + s + '</span>').join('') + vazios + dias;
    if (opts.podeEscolher) {
      q('[data-cal="escolher"]').textContent = escolhendo ? 'Cancelar escolha' : 'Escolher datas';
      q('[data-cal="escolher"]').setAttribute('aria-pressed', String(escolhendo));
      q('.agm-escolha-txt').textContent = escolhendo ? (escolhidas.size ? escolhidas.size + ' data(s)' : 'toque nas datas') : '';
      q('[data-cal="aplicar"]').classList.toggle('hidden', !escolhendo || !escolhidas.size);
    }
  }

  raiz.addEventListener('click', ev => {
    const acao = ev.target.closest('[data-cal]');
    const diaBtn = ev.target.closest('[data-agm-dia]');
    if (diaBtn) {
      const d = diaBtn.dataset.agmDia;
      if (escolhendo) { if (escolhidas.has(d)) escolhidas.delete(d); else escolhidas.add(d); desenhar(); return; }
      if (opts.aoTocarDia) Promise.resolve(opts.aoTocarDia(d)).then(() => desenhar());
      return;
    }
    if (!acao) return;
    const a = acao.dataset.cal;
    if (a === 'ant') { mes = somaMes(mes, -1); carregar(); }
    if (a === 'prox') { mes = somaMes(mes, 1); carregar(); }
    if (a === 'escolher') { escolhendo = !escolhendo; escolhidas.clear(); desenhar(); }
    if (a === 'aplicar' && escolhidas.size && opts.aoAplicarDatas) opts.aoAplicarDatas([...escolhidas].sort());
  });

  return {
    mesAtual: () => mes,
    recarregar: carregar,
    paraMesDe(data) { mes = String(data).slice(0, 7); return carregar(); },
    limparEscolha() { escolhendo = false; escolhidas.clear(); if (dados) desenhar(); }
  };
}
