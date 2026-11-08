// Herança da comissão de um serviço para um profissional (Onda B, D-009).
// Ordem: ajuste do profissional naquele serviço → modelo de herança do serviço
// (BY_ROLE: cargo do profissional; BY_CATEGORY: categoria do serviço) → comissão
// do próprio serviço. O último degrau sempre existe: nunca há comissão indefinida.
const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

function resolveComissaoPct({ servico, profissional, override = {}, cargos = [], categorias = [] }) {
  const doOverride = num(override.comissao_pct ?? override.comissaoPct);
  if (doOverride !== null) return { pct: doOverride, origem: 'override_profissional' };

  const doServico = num(servico.comissao_pct ?? servico.comissaoPct ?? servico.comissao) ?? 0;
  const modelo = servico.modelo_heranca || servico.modeloHeranca || 'FIXED_SERVICE';

  if (modelo === 'BY_ROLE') {
    const cargo = cargos.find(c => c.id === (profissional.cargo_id ?? profissional.cargoId) && c.ativo !== false);
    if (cargo && num(cargo.comissao_pct) !== null) return { pct: num(cargo.comissao_pct), origem: 'cargo' };
  }
  if (modelo === 'BY_CATEGORY') {
    const categoria = categorias.find(c => c.id === (servico.categoria_id ?? servico.categoriaId) && c.ativo !== false);
    if (categoria && num(categoria.comissao_pct) !== null) return { pct: num(categoria.comissao_pct), origem: 'categoria' };
  }
  return { pct: doServico, origem: 'servico' };
}

module.exports = { resolveComissaoPct };
