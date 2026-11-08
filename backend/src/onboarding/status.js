// Progresso do assistente derivado dos dados reais (sem coluna de estado):
// retoma do mesmo ponto em qualquer aparelho e nunca diverge do cadastro.
const FASES = [
  { id: 'empresa', titulo: 'Dados do estabelecimento' },
  { id: 'horarios', titulo: 'Horário de funcionamento' },
  { id: 'pagamentos', titulo: 'Formas de pagamento' },
  { id: 'catalogo', titulo: 'Serviços' },
  { id: 'equipe', titulo: 'Equipe' },
  { id: 'simulacao', titulo: 'Simulação de atendimento' }
];

const ativo = r => r && r.ativo !== false;

function calcularStatus({ empresa, formas, servicos, profissionais, vinculos }) {
  const e = empresa || {};
  const diasAbertos = Object.values(e.horario_por_dia || {}).filter(d => d && d.ativo).length;
  const servicosAtivos = (servicos || []).filter(ativo);
  const profsAtivos = (profissionais || []).filter(ativo);
  const profsComServico = profsAtivos.filter(p => (vinculos || []).some(v => v.profissional_id === p.id));
  const feito = {
    empresa: Boolean(e.nome && String(e.nome).trim() && (e.whatsapp || e.telefone)),
    horarios: diasAbertos > 0,
    pagamentos: (formas || []).filter(ativo).length > 0,
    catalogo: servicosAtivos.length > 0,
    equipe: profsComServico.length > 0
  };
  // A simulação só pede que o resto exista: ela usa /checkout/preview e não grava nada.
  feito.simulacao = feito.catalogo && feito.equipe && feito.pagamentos;
  const fases = FASES.map(f => ({ ...f, concluida: feito[f.id] }));
  const pendente = fases.find(f => !f.concluida);
  return {
    fases,
    proximaFase: pendente ? pendente.id : null,
    completo: !pendente,
    resumo: { diasAbertos, servicos: servicosAtivos.length, profissionais: profsAtivos.length, profissionaisComServico: profsComServico.length }
  };
}

module.exports = { FASES, calcularStatus };
