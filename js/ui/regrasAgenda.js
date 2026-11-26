// Gestão → Regras da agenda (D-049, migration 024). O salão escolhe as regras; o servidor aplica:
// na recepção a regra AVISA e deixa seguir (a exceção vai para o histórico do horário); no link
// online ela BLOQUEIA. O prazo de cancelamento é um só: vale para o link, para o aviso ao cancelar
// e para a confiabilidade do cliente. Serviços podem ter prazo e antecedência próprios (Cadastros).
import { api } from '../api.js';
import { sessionPode } from '../state.js';
import { escapeHtml, showBanner } from '../utils.js';
import { carregarRegras } from './agendaCard.js';

const el = id => document.getElementById(id);
const horas = m => (m === 0 ? 'Até o horário' : m % 60 === 0 ? `${m / 60} h antes` : `${m} min antes`);
const opcoes = (lista, atual, rotulo) => {
  const valores = lista.includes(atual) || atual === null ? lista : [...lista, atual].sort((a, b) => (a ?? -1) - (b ?? -1));
  return valores.map(v => `<option value="${v === null ? '' : v}"${v === atual ? ' selected' : ''}>${escapeHtml(rotulo(v))}</option>`).join('');
};
// Política de sugestão (D-054, migration 025): regras explicáveis; nada é reservado e a
// recepção sempre pode ver todos os horários livres.
const POLITICAS = [['', 'Padrão (como antes)'], ['flexivel', 'Flexível'], ['equilibrada', 'Equilibrada'], ['compacta', 'Compacta']];
const DICA_POLITICA = {
  '': 'Os horários partem de cada janela livre, na duração do serviço (recepção, profissional e link). A recepção vê primeiro os encaixes ideais; o link mostra todos.',
  flexivel: 'Oferece todo horário livre, na recepção e no link. Mais escolha para o cliente; a agenda pode ficar com buracos.',
  equilibrada: 'Só horários que não deixam uma sobra menor que o menor serviço (tempo que ninguém consegue usar). Se o dia ficar sem nenhum, oferece os encaixes ideais.',
  compacta: 'Só os encaixes ideais: colados no início, no fim ou em outro horário, com a menor sobra. Agenda mais cheia e sem buracos; menos opções no link.'
};
const campo = (id, rotulo, html, dica) => `<div class="field"><label for="${id}">${escapeHtml(rotulo)}</label><select id="${id}">${html}</select>${dica ? `<p class="body-sm text-tertiary">${escapeHtml(dica)}</p>` : ''}</div>`;

function render(e) {
  const v = k => (e[k] === undefined ? null : e[k]);
  el('regrasConteudo').innerHTML = `
    <form id="formRegras" novalidate>
      <h3 class="esc-sub">Cancelamento</h3>
      ${campo('rgPrazo', 'Prazo para cancelar sem penalidade', opcoes([0, 60, 120, 180, 240, 720, 1440, 2880], v('online_cancelamento_prazo_min') ?? 120, horas),
        'Vale para o link do cliente, para o aviso ao cancelar na recepção e para a confiabilidade. Cancelar antes do prazo não é falta.')}
      <h3 class="esc-sub">Sugestão de horários</h3>
      <div class="field"><label for="rgPolitica">Como a agenda sugere horários</label><select id="rgPolitica">${POLITICAS.map(([val, rot]) => `<option value="${val}"${(v('agenda_politica') || '') === val ? ' selected' : ''}>${escapeHtml(rot)}</option>`).join('')}</select>
        <p class="body-sm text-tertiary" id="rgPoliticaDica">${escapeHtml(DICA_POLITICA[v('agenda_politica') || ''])}</p></div>
      <h3 class="esc-sub">Recepção (avisa e deixa seguir)</h3>
      ${campo('rgJanela', 'Agendar até quantos dias à frente', opcoes([null, 30, 60, 90, 180, 365], v('agenda_janela_dias_recepcao'), x => (x === null ? 'Sem limite' : `${x} dias`)))}
      ${campo('rgMaxFuturos', 'Horários futuros por cliente', opcoes([null, 1, 2, 3, 4, 5, 6, 8, 10], v('agenda_max_futuros_recepcao'), x => (x === null ? 'Sem limite' : String(x))))}
      ${campo('rgIntervalo', 'Intervalo mínimo no mesmo serviço', opcoes([null, 3, 7, 10, 14, 21, 30], v('agenda_intervalo_min_dias'), x => (x === null ? 'Desligado' : `${x} dias`)),
        'Evita marcar o mesmo serviço duas vezes perto demais (engano ou duplicata). No link online, bloqueia.')}
      <h3 class="esc-sub">Chegada, atrasos e faltas</h3>
      <div class="field"><label for="rgChegada">Marcar "Cliente chegou"</label><select id="rgChegada">
        <option value="sim"${v('agenda_usa_chegada') === false ? '' : ' selected'}>Sim, a recepção marca a chegada</option>
        <option value="nao"${v('agenda_usa_chegada') === false ? ' selected' : ''}>Não, inicia o atendimento direto</option></select>
        <p class="body-sm text-tertiary">Vale para toda a equipe. Sem marcar a chegada, o card não avisa atraso: todo cliente pareceria atrasado.</p></div>
      ${campo('rgAtraso', 'Avisar atraso no card depois de', opcoes([0, 5, 10, 15, 20, 30], v('agenda_atraso_alerta_min') ?? 15, x => (x === 0 ? 'Desligado' : `${x} min`)),
        'O card mostra "atrasado" e destaca o no-show. Nada é marcado sozinho.')}
      ${campo('rgReguaAlerta', 'Alerta de faltas a partir de', opcoes([1, 2, 3, 4, 5], v('regua_alerta_faltas') ?? 2, x => `${x} falta(s) seguida(s)`))}
      ${campo('rgReguaSinal', 'Pedir sinal (e bloquear o link) a partir de', opcoes([2, 3, 4, 5, 6], v('regua_sinal_faltas') ?? 3, x => `${x} faltas seguidas`))}
      <p class="body-sm text-tertiary">Por serviço (ex.: química com 24 h de antecedência e 48 h de prazo): Cadastros → Serviços.</p>
      <p class="body-sm" id="rgMsg" role="alert"></p>
      <button class="btn btn-primary" type="submit" id="btnRegrasSalvar">Salvar regras</button>
    </form>`;
}

const num = id => (el(id).value === '' ? null : Number(el(id).value));

async function salvar(ev) {
  ev.preventDefault();
  el('rgMsg').textContent = '';
  const body = {
    cancelamentoPrazoMin: num('rgPrazo'),
    agendaJanelaDiasRecepcao: num('rgJanela'),
    agendaMaxFuturosRecepcao: num('rgMaxFuturos'),
    agendaIntervaloMinDias: num('rgIntervalo'),
    agendaAtrasoAlertaMin: num('rgAtraso'),
    agendaUsaChegada: el('rgChegada').value !== 'nao',
    agendaPolitica: el('rgPolitica').value || null,
    reguaAlertaFaltas: num('rgReguaAlerta'),
    reguaSinalFaltas: num('rgReguaSinal')
  };
  const b = el('btnRegrasSalvar'); b.disabled = true;
  try {
    render(await api('/empresa', { method: 'PATCH', body }));
    await carregarRegras(true);
    showBanner('Regras da agenda salvas.', 'ok');
  } catch (err) {
    el('rgMsg').textContent = err.message;
  } finally { const x = el('btnRegrasSalvar'); if (x) x.disabled = false; }
}

export async function carregarRegrasAgenda() {
  if (!sessionPode('empresa:configurar')) return;
  // Sem formulário velho enquanto busca (D-084): mexer nele e a resposta chegar depois apagava a escolha.
  el('regrasConteudo').innerHTML = '<p class="body-sm text-tertiary" role="status">Carregando as regras…</p>';
  try { render(await api('/empresa')); } catch (err) { el('regrasConteudo').textContent = err.message; }
}

export function initRegrasAgenda() {
  if (!sessionPode('empresa:configurar') || !el('subtabBtnRegras')) return;
  el('subtabBtnRegras').classList.remove('hidden');
  el('subtabBtnRegras').addEventListener('click', carregarRegrasAgenda);
  el('regrasConteudo').addEventListener('submit', ev => { if (ev.target.id === 'formRegras') salvar(ev); });
  el('regrasConteudo').addEventListener('change', ev => { if (ev.target.id === 'rgPolitica') el('rgPoliticaDica').textContent = DICA_POLITICA[ev.target.value]; });
}
