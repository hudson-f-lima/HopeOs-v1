// Catálogo de permissões finas (D-032, migration 012). Fonte única da matriz de
// permissões: o servidor decide por aqui, o /me devolve o resultado e a documentação
// (docs/PERMISSOES.md) é conferida contra este arquivo pelo teste do gate.
//
// Cada permissão tem:
//   codigo  'grupo:acao' — o que as rotas exigem (authorize('agenda:criar')).
//   acao    a ação ampla de origem (ACTIONS em rbac.js): vocabulário das credenciais de
//           integração e do token legado, que continuam valendo sem mudança.
//   padrao  o alcance de cada papel: 'total', 'proprio' (só o que é do próprio
//           profissional) ou ausente (sem acesso). É o mínimo necessário de cada papel.
//   nivel   quem pode conceder individualmente (D-032, revisão de 2026-11-15):
//           'operacao'       gerente ou proprietário;
//           'sensivel'       dinheiro ou dado pessoal de colega — só o proprietário;
//           'administracao'  só o proprietário.
//   profissional  true quando pode ser concedida a quem tem papel profissional. O profissional
//           só recebe o que não mexe em valores financeiros críticos (decisão do dono,
//           2026-11-15): ver a agenda de todos e fechar comanda de qualquer profissional.
//   segue   a permissão acompanha o alcance de outra (as ações da agenda seguem o que a
//           pessoa vê: com a agenda de todos, agenda, remarca e cancela para todos). Não é
//           concedida sozinha.
//
// Permissão individual (empresa_memberships.permissoes_extras) só ACRESCENTA: dá alcance
// 'total' à permissão concedida, sem tirar nada do padrão do papel.
const T = 'total';
const P = 'proprio';
const TODOS = { admin: T, gestor: T, recepcao: T, profissional: T };
const OPERACAO = { admin: T, gestor: T, recepcao: T };
const GESTAO = { admin: T, gestor: T };
const OPERACAO_PROPRIO = { admin: T, gestor: T, recepcao: T, profissional: P };
const GESTAO_PROPRIO = { admin: T, gestor: T, profissional: P };

const p = (codigo, grupo, rotulo, acao, padrao, nivel = 'operacao', extra = {}) => Object.freeze({
  codigo, grupo, rotulo, acao, padrao: Object.freeze(padrao), nivel,
  profissional: Boolean(extra.profissional), segue: extra.segue || null, rotuloProfissional: extra.rotuloProfissional || null,
  papeis: extra.papeis || null
});
const SEGUE_AGENDA = { segue: 'agenda:ver' };

const PERMISSOES = Object.freeze([
  p('agenda:ver', 'Agenda', 'Ver a agenda', 'agenda:read', OPERACAO_PROPRIO, 'operacao',
    { profissional: true, rotuloProfissional: 'Agenda de todos (ver, agendar, remarcar e cancelar para qualquer profissional)' }),
  p('agenda:criar', 'Agenda', 'Criar agendamento', 'agenda:write', OPERACAO_PROPRIO, 'operacao', SEGUE_AGENDA),
  p('agenda:encaixar', 'Agenda', 'Encaixar (agendar em horário já ocupado)', 'agenda:write', OPERACAO_PROPRIO, 'operacao', SEGUE_AGENDA),
  p('agenda:editar', 'Agenda', 'Remarcar e mudar a duração', 'agenda:write', OPERACAO_PROPRIO, 'operacao', SEGUE_AGENDA),
  p('agenda:atender', 'Agenda', 'Confirmar, registrar chegada, atender, concluir e marcar falta', 'agenda:write', OPERACAO_PROPRIO, 'operacao', SEGUE_AGENDA),
  p('agenda:cancelar', 'Agenda', 'Cancelar agendamento', 'agenda:write', OPERACAO_PROPRIO, 'operacao', SEGUE_AGENDA),
  p('agenda:lembretes', 'Agenda', 'Lembretes de confirmação por WhatsApp', 'agenda:read', OPERACAO),
  // D-039 (migration 018): série recorrente só pela equipe; o cliente nunca cria série pelo link.
  p('agenda:recorrencia', 'Agenda', 'Criar agendamento recorrente (semanal, quinzenal, mensal)', 'agenda:write', OPERACAO),
  // D-033 (migration 013): escala e disponibilidade.
  p('escala:ver', 'Escala', 'Ver escala e disponibilidade', 'agenda:read', OPERACAO_PROPRIO, 'operacao', SEGUE_AGENDA),
  p('escala:bloquear', 'Escala', 'Bloquear horário e registrar ausência', 'agenda:write', OPERACAO_PROPRIO),
  p('escala:conflitos', 'Escala', 'Decidir sobre agendamentos afetados por mudança de escala', 'agenda:write', OPERACAO),
  p('escala:editar', 'Escala', 'Definir e publicar a escala dos profissionais e horários excepcionais', 'cadastros:write', GESTAO, 'sensivel'),
  p('unidade:horario', 'Escala', 'Horário da unidade, aberturas e fechamentos', 'cadastros:write', GESTAO, 'sensivel'),
  // D-035 (migration 015): alterar várias pessoas de uma vez e modelos de escala.
  p('escala:lote', 'Escala', 'Alterar a escala de várias pessoas de uma vez e aplicar modelos', 'cadastros:write', GESTAO, 'sensivel'),
  p('escala:modelos', 'Escala', 'Criar, editar, duplicar e arquivar modelos de escala', 'cadastros:write', GESTAO, 'sensivel'),
  // D-042 (migration 021): planos de assinatura (Onda A, fase 1). Ver e simular é da operação
  // (a recepção vende); criar e editar mexe em preço e comissão: gestão, sensível.
  p('assinatura:ver', 'Assinaturas', 'Ver planos de assinatura e simular a cobertura', 'cadastros:read', OPERACAO),
  p('assinatura:vender', 'Assinaturas', 'Vender plano ao cliente e registrar o pagamento do ciclo', 'checkout:write', OPERACAO),
  p('assinatura:gerir', 'Assinaturas', 'Pausar, retomar e cancelar assinaturas', 'cadastros:write', GESTAO, 'sensivel'),
  p('planos:editar', 'Assinaturas', 'Criar, editar e arquivar planos de assinatura (preço, comissão e regras de uso)', 'cadastros:write', GESTAO, 'sensivel'),
  p('espera:ver', 'Lista de espera', 'Ver a lista de espera', 'lista_espera:read', OPERACAO),
  p('espera:gerir', 'Lista de espera', 'Incluir e atualizar na lista de espera', 'lista_espera:write', OPERACAO),
  p('comanda:fechar', 'Comanda', 'Simular e fechar comanda', 'checkout:write', OPERACAO_PROPRIO, 'operacao',
    { profissional: true, rotuloProfissional: 'Fechar comanda de qualquer profissional' }),
  p('comanda:historico', 'Comanda', 'Ver comandas fechadas e seus estornos', 'relatorios:full', GESTAO, 'sensivel'),
  p('comanda:estornar', 'Comanda', 'Estornar comanda', 'checkout:estornar', GESTAO, 'sensivel'),
  p('caixa:conferir', 'Caixa', 'Conferir o caixa do dia', 'relatorios:operacional', OPERACAO, 'sensivel'),
  p('caixa:fechar', 'Caixa', 'Fechar o caixa do dia', 'caixa:operar', OPERACAO, 'sensivel'),
  p('caixa:movimentar', 'Caixa', 'Lançar sangria e suprimento', 'caixa:operar', OPERACAO, 'sensivel'),
  p('clientes:ver', 'Clientes', 'Ver clientes (nome)', 'clientes:read', TODOS),
  p('clientes:contato', 'Clientes', 'Ver WhatsApp e observações dos clientes', 'clientes:read', OPERACAO, 'sensivel'),
  p('clientes:criar', 'Clientes', 'Cadastrar cliente novo', 'clientes:write', TODOS),
  p('clientes:editar', 'Clientes', 'Editar clientes já cadastrados', 'clientes:write', OPERACAO, 'sensivel'),
  p('cadastros:ver', 'Cadastros', 'Ver serviços, produtos, profissionais e formas de pagamento', 'cadastros:read', TODOS),
  p('catalogo:editar', 'Cadastros', 'Criar e editar serviços, produtos e profissionais', 'cadastros:write', GESTAO, 'sensivel'),
  p('pagamentos:editar', 'Cadastros', 'Criar e editar formas de pagamento e taxas', 'cadastros:write', GESTAO, 'sensivel'),
  p('estoque:ajustar', 'Cadastros', 'Ajustar estoque', 'estoque:write', GESTAO, 'sensivel'),
  p('painel:operacional', 'Painel', 'Painel da operação (pendências, ocupação, clientes)', 'relatorios:operacional', OPERACAO),
  p('painel:financeiro', 'Painel', 'Painel financeiro, margem e indicadores de agenda e clientes', 'relatorios:full', GESTAO, 'sensivel'),
  p('ganhos:ver', 'Ganhos e metas', 'Ver ganhos e comissões', 'relatorios:proprio', GESTAO_PROPRIO, 'sensivel'),
  p('comissoes:pagar', 'Ganhos e metas', 'Pagar e estornar comissão', 'comissoes:pagar', GESTAO, 'sensivel'),
  p('metas:ver', 'Ganhos e metas', 'Ver metas e a meta do salão', 'metas:read', GESTAO_PROPRIO, 'sensivel'),
  p('metas:definir', 'Ganhos e metas', 'Definir metas', 'metas:write', GESTAO, 'sensivel'),
  p('ranking:ver', 'Ganhos e metas', 'Ver o ranking', 'ranking:read', GESTAO_PROPRIO, 'sensivel'),
  p('desempenho:ver', 'Ganhos e metas', 'Ver indicadores de desempenho', 'desempenho:read', GESTAO_PROPRIO, 'sensivel'),
  p('empresa:configurar', 'Administração', 'Dados da empresa e assistente de configuração', 'cadastros:write', GESTAO, 'administracao'),
  p('equipe:permissoes', 'Administração', 'Conceder e revogar permissões individuais', 'admin', GESTAO, 'administracao'),
  // Regra "ninguém mexe no próprio dinheiro" (decisão do dono, 2026-11-15): o gerente que também
  // atende não paga a própria comissão, não estorna a própria comanda, não muda a própria
  // comissão nem a própria meta. O proprietário liga e desliga isso por gerente com esta permissão.
  p('financeiro:proprio', 'Administração', 'Agir sobre o próprio dinheiro (pagar a própria comissão, estornar a própria comanda, mudar a própria comissão e meta)', 'comissoes:pagar', { admin: T }, 'administracao', { papeis: ['gestor'] })
]);

const POR_CODIGO = new Map(PERMISSOES.map(x => [x.codigo, x]));
const PAPEIS = ['admin', 'gestor', 'recepcao', 'profissional'];
// Quem configura quem: só papéis abaixo do próprio.
const HIERARQUIA = { admin: 4, gestor: 3, recepcao: 2, profissional: 1 };

const permissao = codigo => POR_CODIGO.get(codigo) || null;

function extrasValidos(extras) {
  return (Array.isArray(extras) ? extras : []).filter(c => POR_CODIGO.has(c));
}

// O papel pode receber esta permissão individualmente? (ação da agenda segue a visão; o
// profissional só recebe o que não mexe em dinheiro.)
const receptivel = (role, perm) => !perm.segue && (role !== 'profissional' || perm.profissional) && (!perm.papeis || perm.papeis.includes(role));

// Alcance de um papel + extras numa permissão: 'total' | 'proprio' | null.
function alcance(role, extras, codigo) {
  const perm = POR_CODIGO.get(codigo);
  if (!perm) return null;
  // Extra que o papel atual não pode receber (gravado antes de uma mudança de regra) não vale.
  if (extrasValidos(extras).includes(codigo) && receptivel(role, perm)) return T;
  const base = perm.padrao[role] || null;
  // Ação da agenda acompanha a visão: quem vê a agenda de todos age em todos.
  if (base === P && perm.segue && alcance(role, extras, perm.segue) === T) return T;
  return base;
}

// Mapa { codigo: 'total' | 'proprio' } com tudo o que a pessoa pode.
function permissoesEfetivas(role, extras) {
  const out = {};
  for (const perm of PERMISSOES) {
    const a = alcance(role, extras, perm.codigo);
    if (a) out[perm.codigo] = a;
  }
  return out;
}

// Permissões que alguém pode receber individualmente, por quem quer que conceda.
function concediveisPara(roleAlvo) {
  return PERMISSOES.filter(x => x.padrao[roleAlvo] !== T && receptivel(roleAlvo, x)).map(x => x.codigo);
}

// Limite de autoridade de quem concede (D-032):
// - só configura papéis abaixo do próprio e nunca a si mesmo;
// - só concede o que ele mesmo tem com alcance total;
// - permissão sensível ou de administração, só o administrador concede;
// - ao profissional, só o que não mexe em valores financeiros críticos (campo profissional).
// Sobre quem a pessoa pode mexer: só papéis abaixo do seu, nunca em si mesma.
function motivoAlvo({ ator, alvo }) {
  if (ator.membership_id && ator.membership_id === alvo.id) return 'NAO_PODE_SI_MESMO';
  if (!(HIERARQUIA[ator.role] > HIERARQUIA[alvo.role])) return 'ALVO_FORA_DA_AUTORIDADE';
  return null;
}

function motivoRecusa({ ator, alvo, codigo }) {
  const perm = POR_CODIGO.get(codigo);
  if (!perm) return 'PERMISSAO_DESCONHECIDA';
  const recusaAlvo = motivoAlvo({ ator, alvo });
  if (recusaAlvo) return recusaAlvo;
  if (perm.padrao[alvo.role] === T) return 'JA_INCLUIDA_NO_PAPEL';
  if (perm.segue) return 'SEGUE_OUTRA_PERMISSAO';
  if (alvo.role === 'profissional' && !perm.profissional) return 'NAO_CONCEDIVEL_AO_PROFISSIONAL';
  if (perm.papeis && !perm.papeis.includes(alvo.role)) return 'NAO_CONCEDIVEL_A_ESTE_PAPEL';
  if (perm.nivel !== 'operacao' && ator.role !== 'admin') return 'SO_ADMIN_CONCEDE';
  if (alcance(ator.role, ator.permissoes_extras, codigo) !== T) return 'FORA_DA_PROPRIA_AUTORIDADE';
  return null;
}

// Revogar é mais simples que conceder: basta ter autoridade sobre a pessoa e sobre o nível
// (o gerente não tira o que só o proprietário dá). Assim um extra antigo, que hoje não se
// concederia, sempre pode ser retirado (Red Team D-032, 2ª passada).
function motivoRevogacao({ ator, alvo, codigo }) {
  const perm = POR_CODIGO.get(codigo);
  const recusaAlvo = motivoAlvo({ ator, alvo });
  if (recusaAlvo) return recusaAlvo;
  if (perm && perm.nivel !== 'operacao' && ator.role !== 'admin') return 'SO_ADMIN_CONCEDE';
  return null;
}

module.exports = { PERMISSOES, PAPEIS, HIERARQUIA, permissao, alcance, permissoesEfetivas, concediveisPara, motivoAlvo, motivoRecusa, motivoRevogacao, extrasValidos };
