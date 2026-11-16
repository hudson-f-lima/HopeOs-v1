// Lembrete na agenda do próprio celular do cliente (C2, D-038; auditoria §7, opções A e B).
// - .ics: arquivo de evento com dois alarmes (1 dia e 2 h antes), aberto pelo Calendário do
//   iPhone, Outlook e outros. Gerado aqui, sem servidor, e baixado por um blob local.
// - Google Agenda: link "adicionar evento" já preenchido (o cliente confirma no Google).
// O link pessoal vai na descrição: é por ele que o cliente confirma, cancela ou remarca.
// Nada é enviado a terceiros ao carregar a página; o Google só é aberto se o cliente tocar.
import { apiBaseDaUrl } from './api-base.js';

const doisDigitos = n => String(n).padStart(2, '0');
function utcCompacto(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${doisDigitos(d.getUTCMonth() + 1)}${doisDigitos(d.getUTCDate())}T${doisDigitos(d.getUTCHours())}${doisDigitos(d.getUTCMinutes())}${doisDigitos(d.getUTCSeconds())}Z`;
}
// Texto de propriedade iCalendar (RFC 5545 §3.3.11): barra, ponto e vírgula, vírgula e quebra.
const textoIcs = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Linhas com mais de 75 caracteres são dobradas (continuação começa com espaço).
function dobrar(linha) {
  const partes = [];
  for (let i = 0; i < linha.length; i += 73) partes.push((i ? ' ' : '') + linha.slice(i, i + 73));
  return partes.join('\r\n');
}

export function icsDe(cal, linkPessoal) {
  const descricao = linkPessoal ? `Para confirmar, cancelar ou remarcar: ${linkPessoal}` : '';
  const uid = `${utcCompacto(cal.inicioIso)}-${Math.random().toString(36).slice(2, 10)}@hopeos`;
  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HOPE OS//Agendamento//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcCompacto(new Date().toISOString())}`,
    `DTSTART:${utcCompacto(cal.inicioIso)}`,
    `DTEND:${utcCompacto(cal.fimIso)}`,
    `SUMMARY:${textoIcs(cal.titulo)}`,
    `LOCATION:${textoIcs(cal.local)}`,
    ...(descricao ? [`DESCRIPTION:${textoIcs(descricao)}`, `URL:${linkPessoal}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete do seu horário', 'TRIGGER:-P1D', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Seu horário é daqui a 2 horas', 'TRIGGER:-PT2H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ];
  return `${linhas.map(dobrar).join('\r\n')}\r\n`;
}

export function googleAgendaUrl(cal, linkPessoal) {
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE');
  u.searchParams.set('text', cal.titulo || 'Horário');
  u.searchParams.set('dates', `${utcCompacto(cal.inicioIso)}/${utcCompacto(cal.fimIso)}`);
  if (cal.local) u.searchParams.set('location', cal.local);
  if (linkPessoal) u.searchParams.set('details', `Para confirmar, cancelar ou remarcar: ${linkPessoal}`);
  return u.toString();
}

export function baixarIcs(cal, linkPessoal) {
  const blob = new Blob([icsDe(cal, linkPessoal)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'meu-horario.ics';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// URL do link pessoal na mesma pasta da página atual. Em host local (E2E/dev) leva o ?apiBase=.
export function urlDoLinkPessoal(token, loc = location) {
  const u = new URL('meu-horario.html', loc.href);
  const apiBase = apiBaseDaUrl(loc); // só existe em host local
  if (apiBase) u.searchParams.set('apiBase', apiBase);
  u.hash = `t=${token}`;
  return u.toString();
}
