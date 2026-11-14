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
//   nivel   'operacao' | 'gestao' | 'administracao'. Só o administrador concede
//           permissões de administração.
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

const p = (codigo, grupo, rotulo, acao, padrao, nivel = 'operacao') => Object.freeze({ codigo, grupo, rotulo, acao, padrao: Object.freeze(padrao), nivel });

const PERMISSOES = Object.freeze([
  p('agenda:ver', 'Agenda', 'Ver a agenda', 'agenda:read', OPERACAO_PROPRIO),
  p('agenda:criar', 'Agenda', 'Criar agendamento', 'agenda:write', OPERACAO_PROPRIO),
  p('agenda:encaixar', 'Agenda', 'Encaixar (agendar em horário já ocupado)', 'agenda:write', OPERACAO_PROPRIO),
  p('agenda:editar', 'Agenda', 'Remarcar e mudar a duração', 'agenda:write', OPERACAO_PROPRIO),
  p('agenda:atender', 'Agenda', 'Confirmar, registrar chegada, atender, concluir e marcar falta', 'agenda:write', OPERACAO_PROPRIO),
  p('agenda:cancelar', 'Agenda', 'Cancelar agendamento', 'agenda:write', OPERACAO_PROPRIO),
  p('espera:ver', 'Lista de espera', 'Ver a lista de espera', 'lista_espera:read', OPERACAO),
  p('espera:gerir', 'Lista de espera', 'Incluir e atualizar na lista de espera', 'lista_espera:write', OPERACAO),
  p('comanda:fechar', 'Comanda', 'Simular e fechar comanda', 'checkout:write', OPERACAO_PROPRIO),
  p('comanda:historico', 'Comanda', 'Ver comandas fechadas e seus estornos', 'relatorios:full', GESTAO, 'gestao'),
  p('comanda:estornar', 'Comanda', 'Estornar comanda', 'checkout:estornar', GESTAO, 'gestao'),
  p('caixa:conferir', 'Caixa', 'Conferir o caixa do dia', 'relatorios:operacional', OPERACAO),
  p('caixa:fechar', 'Caixa', 'Fechar o caixa do dia', 'caixa:operar', OPERACAO),
  p('caixa:movimentar', 'Caixa', 'Lançar sangria e suprimento', 'caixa:operar', OPERACAO),
  p('clientes:ver', 'Clientes', 'Ver clientes', 'clientes:read', TODOS),
  p('clientes:editar', 'Clientes', 'Cadastrar e editar clientes', 'clientes:write', OPERACAO),
  p('cadastros:ver', 'Cadastros', 'Ver serviços, produtos, profissionais e formas de pagamento', 'cadastros:read', TODOS),
  p('catalogo:editar', 'Cadastros', 'Criar e editar serviços, produtos e profissionais', 'cadastros:write', GESTAO, 'gestao'),
  p('pagamentos:editar', 'Cadastros', 'Criar e editar formas de pagamento e taxas', 'cadastros:write', GESTAO, 'gestao'),
  p('estoque:ajustar', 'Cadastros', 'Ajustar estoque', 'estoque:write', GESTAO, 'gestao'),
  p('painel:operacional', 'Painel', 'Painel da operação (pendências, ocupação, clientes)', 'relatorios:operacional', OPERACAO),
  p('painel:financeiro', 'Painel', 'Painel financeiro, margem e indicadores de agenda e clientes', 'relatorios:full', GESTAO, 'gestao'),
  p('ganhos:ver', 'Ganhos e metas', 'Ver ganhos e comissões', 'relatorios:proprio', GESTAO_PROPRIO),
  p('comissoes:pagar', 'Ganhos e metas', 'Pagar e estornar comissão', 'comissoes:pagar', GESTAO, 'gestao'),
  p('metas:ver', 'Ganhos e metas', 'Ver metas e a meta do salão', 'metas:read', GESTAO_PROPRIO),
  p('metas:definir', 'Ganhos e metas', 'Definir metas', 'metas:write', GESTAO, 'gestao'),
  p('ranking:ver', 'Ganhos e metas', 'Ver o ranking', 'ranking:read', GESTAO_PROPRIO),
  p('desempenho:ver', 'Ganhos e metas', 'Ver indicadores de desempenho', 'desempenho:read', GESTAO_PROPRIO),
  p('empresa:configurar', 'Administração', 'Dados da empresa e assistente de configuração', 'cadastros:write', GESTAO, 'administracao'),
  p('equipe:permissoes', 'Administração', 'Conceder e revogar permissões individuais', 'admin', GESTAO, 'administracao')
]);

const POR_CODIGO = new Map(PERMISSOES.map(x => [x.codigo, x]));
const PAPEIS = ['admin', 'gestor', 'recepcao', 'profissional'];
// Quem configura quem: só papéis abaixo do próprio.
const HIERARQUIA = { admin: 4, gestor: 3, recepcao: 2, profissional: 1 };

// Pacote "Recepção": o que a recepção tem por padrão e o profissional não tem por inteiro.
const PACOTES = Object.freeze({
  recepcao: Object.freeze({
    rotulo: 'Recepção',
    permissoes: Object.freeze(PERMISSOES.filter(x => x.padrao.recepcao === T && x.padrao.profissional !== T).map(x => x.codigo))
  })
});

const permissao = codigo => POR_CODIGO.get(codigo) || null;

function extrasValidos(extras) {
  return (Array.isArray(extras) ? extras : []).filter(c => POR_CODIGO.has(c));
}

// Alcance de um papel + extras numa permissão: 'total' | 'proprio' | null.
function alcance(role, extras, codigo) {
  const perm = POR_CODIGO.get(codigo);
  if (!perm) return null;
  if (extrasValidos(extras).includes(codigo)) return T;
  return perm.padrao[role] || null;
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

// Permissões que alguém pode receber individualmente: as que o papel dela não tem por inteiro.
function concediveisPara(roleAlvo) {
  return PERMISSOES.filter(x => x.padrao[roleAlvo] !== T).map(x => x.codigo);
}

// Limite de autoridade de quem concede (D-032):
// - só configura papéis abaixo do próprio e nunca a si mesmo;
// - só concede o que ele mesmo tem com alcance total;
// - permissão de administração, só o administrador concede.
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
  if (perm.nivel === 'administracao' && ator.role !== 'admin') return 'SO_ADMIN_CONCEDE';
  if (alcance(ator.role, ator.permissoes_extras, codigo) !== T) return 'FORA_DA_PROPRIA_AUTORIDADE';
  return null;
}

module.exports = { PERMISSOES, PACOTES, PAPEIS, HIERARQUIA, permissao, alcance, permissoesEfetivas, concediveisPara, motivoAlvo, motivoRecusa, extrasValidos };
