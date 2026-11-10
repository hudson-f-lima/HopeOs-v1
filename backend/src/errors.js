function createAppError(code, message, statusCode = 422, details = null) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  if (details) err.details = details;
  return err;
}

// RPCs Postgres (produto_estoque_ajuste, produto_criar_com_estoque, profissional_servicos_replace,
// profissional_servico_override_set) sinalizam violacao de regra de negocio com
// `raise exception ... using errcode = 'P0001'`. O cliente supabase-js repassa esse erro sem
// statusCode, entao sem este mapeamento ele cairia como 500 generico mesmo sendo um bloqueio
// de negocio esperado (ex: estoque negativo) — visto ao vivo no smoke test contra o Supabase real.
const POSTGRES_BUSINESS_ERROR_CODE = 'P0001';

function mapErrorForResponse(err) {
  const hasAppStatus = Boolean(err && (err.statusCode || err.status));
  let statusCode = (err && (err.statusCode || err.status)) || 500;
  let code = (err && err.code) || 'INTERNAL_ERROR';
  const message = (err && err.message) || 'Erro interno';

  if (!hasAppStatus && err && err.code === POSTGRES_BUSINESS_ERROR_CODE) {
    statusCode = 422;
    code = 'BUSINESS_RULE_VIOLATION';
  }

  // Erro inesperado (sem status de aplicação): a mensagem pode trazer nome de tabela,
  // coluna ou detalhe do banco. O cliente recebe texto genérico; o detalhe fica no log,
  // localizável pelo requestId.
  if (statusCode >= 500 && !hasAppStatus) {
    return { statusCode, body: { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente de novo; se continuar, informe o código ao suporte.', details: null } } };
  }

  return {
    statusCode,
    body: {
      ok: false,
      error: {
        code,
        message,
        details: (err && err.details) || null
      }
    }
  };
}

module.exports = { createAppError, mapErrorForResponse };
