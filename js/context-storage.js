// Preferências operacionais nunca atravessam usuário/empresa no mesmo aparelho.
// Contexto ausente não ganha uma chave global de fallback.
export function chaveDoContexto(base, sessao) {
  if (!sessao || sessao.principal !== 'user' || !sessao.user_id || !sessao.empresa_id) return null;
  return `${base}:${encodeURIComponent(sessao.user_id)}:${encodeURIComponent(sessao.empresa_id)}`;
}
