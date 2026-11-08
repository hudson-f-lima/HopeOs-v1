// Cardápios iniciais por nicho para o assistente de configuração.
// São SUGESTÕES editáveis (preço, duração e comissão variam por cidade e salão),
// não dados de mercado. Comissões seguem a proposta aprovada na Onda A:
// barbeiro 50%, cabeleireiro 45%, manicure 60%, estética 70%.
const NICHOS = {
  barbearia: {
    nome: 'Barbearia',
    servicos: [
      { nome: 'Corte masculino', categoria: 'Cabelo', duracaoMin: 30, valorCentavos: 5000, comissaoPct: 50 },
      { nome: 'Barba', categoria: 'Barba', duracaoMin: 30, valorCentavos: 4000, comissaoPct: 50 },
      { nome: 'Corte + barba', categoria: 'Combo', duracaoMin: 60, valorCentavos: 8000, comissaoPct: 50 },
      { nome: 'Pezinho', categoria: 'Cabelo', duracaoMin: 15, valorCentavos: 2000, comissaoPct: 50 },
      { nome: 'Sobrancelha na navalha', categoria: 'Barba', duracaoMin: 15, valorCentavos: 2000, comissaoPct: 50 },
      { nome: 'Barboterapia com toalha quente', categoria: 'Barba', duracaoMin: 30, valorCentavos: 4500, comissaoPct: 50 }
    ]
  },
  salao_feminino: {
    nome: 'Salão feminino',
    servicos: [
      { nome: 'Corte feminino', categoria: 'Cabelo', duracaoMin: 60, valorCentavos: 9000, comissaoPct: 45 },
      { nome: 'Escova', categoria: 'Cabelo', duracaoMin: 45, valorCentavos: 6000, comissaoPct: 45 },
      { nome: 'Coloração', categoria: 'Química', duracaoMin: 120, valorCentavos: 18000, comissaoPct: 45 },
      { nome: 'Hidratação', categoria: 'Tratamento', duracaoMin: 45, valorCentavos: 8000, comissaoPct: 45 },
      { nome: 'Manicure', categoria: 'Unhas', duracaoMin: 40, valorCentavos: 3500, comissaoPct: 60 },
      { nome: 'Pedicure', categoria: 'Unhas', duracaoMin: 50, valorCentavos: 4000, comissaoPct: 60 }
    ]
  },
  estetica: {
    nome: 'Estética / spa',
    servicos: [
      { nome: 'Limpeza de pele', categoria: 'Facial', duracaoMin: 60, valorCentavos: 14000, comissaoPct: 70 },
      { nome: 'Design de sobrancelha', categoria: 'Facial', duracaoMin: 30, valorCentavos: 4500, comissaoPct: 70 },
      { nome: 'Massagem relaxante', categoria: 'Corporal', duracaoMin: 60, valorCentavos: 12000, comissaoPct: 70 },
      { nome: 'Drenagem linfática', categoria: 'Corporal', duracaoMin: 60, valorCentavos: 13000, comissaoPct: 70 },
      { nome: 'Depilação de buço', categoria: 'Depilação', duracaoMin: 15, valorCentavos: 2000, comissaoPct: 70 }
    ]
  }
};

// Cargos padrão (migration 008). Modelo da taxa: "dividido" = taxa sai antes da
// comissão; "bruto_staff" = profissional assume a taxa (ex.: freelancer de estética).
const CARGOS = [
  { nome: 'Barbeiro', comissaoPct: 50, modeloComissao: 'dividido' },
  { nome: 'Cabeleireiro', comissaoPct: 45, modeloComissao: 'dividido' },
  { nome: 'Manicure', comissaoPct: 60, modeloComissao: 'dividido' },
  { nome: 'Esteticista', comissaoPct: 70, modeloComissao: 'bruto_staff' }
];

// Taxas de exemplo: confira as do seu contrato com a operadora antes de usar.
const FORMAS_PAGAMENTO = [
  { code: 'dinheiro', label: 'Dinheiro', taxaPct: 0, diasRecebimento: 0 },
  { code: 'pix', label: 'Pix', taxaPct: 0, diasRecebimento: 0 },
  { code: 'debito', label: 'Cartão de débito', taxaPct: 1.99, diasRecebimento: 1 },
  { code: 'credito', label: 'Cartão de crédito', taxaPct: 4.99, diasRecebimento: 30 }
];

const HORARIO_PADRAO = {
  dom: { ativo: false, inicio: '09:00', fim: '19:00' },
  seg: { ativo: false, inicio: '09:00', fim: '19:00' },
  ter: { ativo: true, inicio: '09:00', fim: '19:00' },
  qua: { ativo: true, inicio: '09:00', fim: '19:00' },
  qui: { ativo: true, inicio: '09:00', fim: '19:00' },
  sex: { ativo: true, inicio: '09:00', fim: '19:00' },
  sab: { ativo: true, inicio: '08:00', fim: '18:00' }
};

// Serviços dos presets herdam a comissão do cargo de quem atende (BY_ROLE);
// sem cargo, vale a comissão do próprio serviço (mesmo número do preset).
function listarPresets() {
  return {
    nichos: Object.entries(NICHOS).map(([id, n]) => ({ id, nome: n.nome, servicos: n.servicos.map(sv => ({ ...sv, modeloHeranca: 'BY_ROLE' })) })),
    formasPagamento: FORMAS_PAGAMENTO,
    horarioPadrao: HORARIO_PADRAO,
    cargos: CARGOS
  };
}

module.exports = { NICHOS, FORMAS_PAGAMENTO, HORARIO_PADRAO, CARGOS, listarPresets };
