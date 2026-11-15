// Relatórios de leitura sem migration (D-016):
// - /relatorios/meus-ganhos: o profissional vê a própria comissão e gorjeta do mês
//   (fecha o limite "relatórios próprios do profissional" da ADR-005). Gestão vê qualquer um.
// - /relatorios/servicos-prestados: linhas do mês para o contador (apoio à NFS-e, que
//   o sistema NÃO emite).
const express = require('express');
const { createAppError } = require('../errors');
const { authorize, assertOwn } = require('../auth/rbac');
const { computeGanhos, listServicosPrestados } = require('../engines/insights/ganhos');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');

const router = express.Router();

function mesValido(query) {
  const mes = String(query.mes || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw createAppError('INVALID_MONTH', 'mes deve ser YYYY-MM.', 422);
  return mes;
}

router.get('/relatorios/meus-ganhos', authorize('ganhos:ver'), async (req, res, next) => {
  try {
    const mes = mesValido(req.query);
    const profissionalId = req.authz.own ? req.authz.profissionalId : String(req.query.profissionalId || '');
    if (!profissionalId) throw createAppError('PROFESSIONAL_REQUIRED', 'Informe profissionalId.', 422);
    assertOwn(req, profissionalId);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtro = { empresa_id: repo.empresaId };
    const [profissionais, comandos, comandoItens, gorjetas, estornos, estornoItens, estornoGorjetas] = await Promise.all([
      repo.list('profissionais', { ...filtro, id: profissionalId }), repo.list('comandos', filtro), repo.list('comando_itens', filtro), repo.list('comando_gorjetas', filtro),
      repo.list('comanda_estornos', filtro), repo.list('comanda_estorno_itens', filtro), repo.list('comanda_estorno_gorjetas', filtro)
    ]);
    // Profissional de outra empresa (ou inexistente) = 404: não confirma que o id existe.
    if (!profissionais[0]) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.', 404);
    res.json({ ok: true, data: { ...computeGanhos({ comandos, comandoItens, gorjetas, estornos, estornoItens, estornoGorjetas, profissionalId, mes }), nome: profissionais[0].nome } });
  } catch (err) { next(err); }
});

router.get('/relatorios/servicos-prestados', authorize('painel:financeiro'), async (req, res, next) => {
  try {
    const mes = mesValido(req.query);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtro = { empresa_id: repo.empresaId };
    const [comandos, comandoItens, profissionais, estornos, estornoItens] = await Promise.all([
      repo.list('comandos', filtro), repo.list('comando_itens', filtro), repo.list('profissionais', filtro),
      repo.list('comanda_estornos', filtro), repo.list('comanda_estorno_itens', filtro)
    ]);
    res.json({ ok: true, data: listServicosPrestados({ comandos, comandoItens, profissionais, estornos, estornoItens, mes }) });
  } catch (err) { next(err); }
});

module.exports = { relatoriosRouter: router };
