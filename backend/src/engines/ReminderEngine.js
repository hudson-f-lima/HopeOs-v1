// Lembretes de confirmação (D-011): monta, para um dia, a lista de agendamentos
// ainda não confirmados com o texto pronto e o link wa.me. Não envia nada:
// quem envia é a recepção, pelo próprio WhatsApp (sem fornecedor, sem custo).
// Evidência: lembrete reduz falta de forma modesta e consistente; o envio
// manual pela equipe teve resultado igual ou melhor que o automático
// (docs/audit/AUDITORIA_E_BENCHMARK_2026-11.md).

// Só o que ainda não foi confirmado nem chegou (aguardando = check-in feito).
const PENDENTES = ['agendado'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// Celular BR: DDD + 8/9 dígitos, com ou sem 55. Fora disso não gera link
// (link para número errado é pior que nenhum).
function normalizarWhatsapp(numero) {
  let d = String(numero || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  return `55${d}`;
}

function rotuloDia(data) {
  const [y, m, d] = data.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[dow]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

function textoLembrete({ cliente, servico, profissional, empresa, data, horario }) {
  const ola = primeiroNome(cliente && cliente.nome) ? `Olá, ${primeiroNome(cliente.nome)}!` : 'Olá!';
  const onde = empresa && empresa.nome ? ` no ${empresa.nome}` : '';
  const oque = [servico && servico.nome, profissional && profissional.nome ? `com ${profissional.nome}` : null].filter(Boolean).join(' ');
  return `${ola} Lembrete do seu horário${onde}: ${rotuloDia(data)} às ${horario}${oque ? `, ${oque}` : ''}. ` +
    'Pode confirmar respondendo SIM? Se precisar remarcar, é só avisar por aqui.';
}

function montarLembretes({ data, agendamentos, clientes, servicos, profissionais, empresa }) {
  const porId = lista => new Map((lista || []).map(x => [x.id, x]));
  const cli = porId(clientes); const serv = porId(servicos); const prof = porId(profissionais);
  const doDia = (agendamentos || []).filter(a => a.data === data);
  const itens = doDia
    .filter(a => PENDENTES.includes(a.status))
    .map(a => {
      const horario = String(a.horario || '').slice(0, 5);
      const cliente = cli.get(a.cliente_id) || null;
      const base = {
        agendamentoId: a.id,
        horario,
        status: a.status,
        clienteId: a.cliente_id || null,
        clienteNome: cliente ? cliente.nome : null,
        servicoNome: (serv.get(a.servico_id) || {}).nome || null,
        profissionalId: a.profissional_id,
        profissionalNome: (prof.get(a.profissional_id) || {}).nome || null
      };
      if (!cliente) return { ...base, link: null, motivo: 'sem_cliente' };
      const numero = normalizarWhatsapp(cliente.whatsapp || cliente.telefone);
      if (!numero) return { ...base, link: null, motivo: cliente.whatsapp || cliente.telefone ? 'whatsapp_invalido' : 'sem_whatsapp' };
      const texto = textoLembrete({ cliente, servico: serv.get(a.servico_id), profissional: prof.get(a.profissional_id), empresa, data, horario });
      return { ...base, texto, link: `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, motivo: null };
    })
    .sort((x, y) => x.horario.localeCompare(y.horario));
  return {
    data,
    pendentes: itens.length,
    comLink: itens.filter(i => i.link).length,
    confirmados: doDia.filter(a => a.status === 'confirmado').length,
    itens
  };
}

module.exports = { montarLembretes, normalizarWhatsapp, textoLembrete, PENDENTES };
