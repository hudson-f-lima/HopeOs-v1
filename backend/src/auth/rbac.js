// Matriz de autorização da ADR-005. Uma ação por grupo de rotas.
// principal user → role da membership; integration → scope com o mesmo nome;
// legacy (API_ACCESS_TOKEN, transição) → tudo menos administração.
const { createAppError } = require('../errors');

const ALL = ['admin', 'gestor', 'recepcao', 'profissional'];
const OPERACAO = ['admin', 'gestor', 'recepcao'];
const GESTAO = ['admin', 'gestor'];

// own: papéis cujo acesso é restrito ao próprio profissional (escopo "Próprio").
const ACTIONS = {
  'cadastros:read': { roles: ALL },
  'cadastros:write': { roles: GESTAO },
  'clientes:read': { roles: ALL },
  'clientes:write': { roles: OPERACAO },
  'agenda:read': { roles: ALL, own: ['profissional'] },
  'agenda:write': { roles: ALL, own: ['profissional'] },
  'checkout:write': { roles: ALL, own: ['profissional'] },
  'estoque:write': { roles: GESTAO },
  'lista_espera:read': { roles: OPERACAO },
  'lista_espera:write': { roles: OPERACAO },
  'relatorios:operacional': { roles: OPERACAO },
  'relatorios:full': { roles: GESTAO },
  admin: { roles: ['admin'], userOnly: true }
};

function forbidden(code, message, details) {
  return createAppError(code, message, 403, details);
}

function authorizeAuth(auth, action) {
  const rule = ACTIONS[action];
  if (!rule) throw new Error(`Ação RBAC desconhecida: ${action}`);
  if (!auth) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);

  if (auth.principal_type === 'legacy') {
    if (rule.userOnly) throw forbidden('USER_PRINCIPAL_REQUIRED', 'Ação exige login de usuário administrador.');
    return { own: false, profissionalId: null };
  }
  if (auth.principal_type === 'integration') {
    if (rule.userOnly) throw forbidden('USER_PRINCIPAL_REQUIRED', 'Integrações não executam ações administrativas.');
    if (!auth.scopes.includes(action)) throw forbidden('INSUFFICIENT_SCOPE', `Scope necessário: ${action}`, { scope: action });
    return { own: false, profissionalId: null };
  }
  if (auth.principal_type === 'user') {
    if (!rule.roles.includes(auth.role)) throw forbidden('INSUFFICIENT_ROLE', 'Papel sem permissão para esta ação.', { action, role: auth.role });
    const own = Boolean(rule.own && rule.own.includes(auth.role));
    if (own && !auth.profissional_id) {
      throw forbidden('PROFESSIONAL_LINK_REQUIRED', 'Usuário profissional sem vínculo ao cadastro de profissional.');
    }
    return { own, profissionalId: own ? auth.profissional_id : null };
  }
  throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
}

function authorize(action) {
  if (!ACTIONS[action]) throw new Error(`Ação RBAC desconhecida: ${action}`);
  return (req, res, next) => {
    try {
      req.authz = authorizeAuth(req.auth, action);
      next();
    } catch (err) { next(err); }
  };
}

// Escopo "Próprio": o recurso precisa pertencer ao profissional do usuário.
function assertOwn(req, profissionalId) {
  if (req.authz && req.authz.own && profissionalId !== req.authz.profissionalId) {
    throw forbidden('NOT_OWN_RESOURCE', 'Recurso de outro profissional.');
  }
}

module.exports = { ACTIONS, authorize, authorizeAuth, assertOwn };
