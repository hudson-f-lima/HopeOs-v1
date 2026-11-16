// Coleções de assinatura usadas no ganho do profissional e no relatório do plano (D-044).
async function dadosDeAssinatura(repo) {
  const f = { empresa_id: repo.empresaId };
  const [planos, assinaturas, cobrancas, usos, usosEstornos] = await Promise.all([
    repo.list('assinatura_planos', f), repo.list('assinaturas', f), repo.list('assinatura_cobrancas', f),
    repo.list('assinatura_usos', f), repo.list('assinatura_usos_estornos', f)
  ]);
  return { planos, assinaturas, cobrancas, usos, usosEstornos };
}
module.exports = { dadosDeAssinatura };
