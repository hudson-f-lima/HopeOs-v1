// Régua de faltas (Onda B, D-009): só ALERTA — nenhuma cobrança é feita aqui
// (sinal via gateway é Onda C, não autorizada).
// Conta as faltas SEGUIDAS mais recentes: um atendimento concluído zera a sequência.
const FINAIS = ['no_show', 'concluido', 'fechado'];

function computeReguaFaltas(agendamentos, { alerta = 2, sinal = 3 } = {}, hoje) {
  const passados = (agendamentos || [])
    .filter(a => FINAIS.includes(a.status) && (!hoje || String(a.data) <= hoje))
    .sort((a, b) => `${b.data} ${b.horario}`.localeCompare(`${a.data} ${a.horario}`));
  let seguidas = 0;
  for (const a of passados) {
    if (a.status !== 'no_show') break;
    seguidas++;
  }
  let nivel = 'ok';
  let mensagem = 'Sem faltas recentes.';
  if (seguidas >= sinal) {
    nivel = 'exigir_sinal';
    mensagem = `${seguidas} faltas seguidas: combine sinal antecipado antes de confirmar (cobrança automática ainda não habilitada).`;
  } else if (seguidas >= alerta) {
    nivel = 'alerta';
    mensagem = `${seguidas} faltas seguidas: confirme o horário com o cliente antes do dia.`;
  } else if (seguidas > 0) {
    nivel = 'tolerada';
    mensagem = 'Uma falta recente (tolerada).';
  }
  return { faltasSeguidas: seguidas, nivel, mensagem, limites: { alerta, sinal } };
}

module.exports = { computeReguaFaltas };
