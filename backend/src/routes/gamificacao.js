// Metas mensais e ranking (D-019, migration 011). Gestão define as metas; o
// profissional vê as próprias. Ranking: gestão sempre; equipe só se o salão ligar
// `ranking_visivel_equipe`, e sem o valor em reais dos colegas.
const express = require('express');
const { createAppError } = require('../errors');
const { authorize } = require('../auth/rbac');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { computeDesempenho, computeMetas, computeRanking } = require('../engines/insights/gamificacao');

const router = express.Router();
const ALVO_MAX = { faturamento: 1000000000, atendimentos: 100000 }; // R$ 10 mi; 100 mil atendimentos
const CAMPOS_PROIBIDOS = ['empresa_id', 'empresaId', 'created_by', 'updated_by', 'actor_id', 'id'];

function mesValido(v) {
  const mes = String(v || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw createAppError('INVALID_MONTH', 'mes deve ser YYYY-MM.', 422);
  return mes;
}

async function desempenhoDoMes(repo, mes) {
  const filtro = { empresa_id: repo.empresaId };
  const [comandos, comandoItens, estornos, estornoItens, profissionais] = await Promise.all([
    repo.list('comandos', filtro), repo.list('comando_itens', filtro), repo.list('comanda_estornos', filtro), repo.list('comanda_estorno_itens', filtro), repo.list('profissionais', filtro)
  ]);
  return computeDesempenho({ comandos, comandoItens, estornos, estornoItens, profissionais, mes });
}

router.get('/metas', authorize('metas:read'), async (req, res, next) => {
  try {
    const mes = mesValido(req.query.mes);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [desempenho, metas] = await Promise.all([desempenhoDoMes(repo, mes), repo.list('metas', { empresa_id: repo.empresaId, mes })]);
    let lista = computeMetas({ metas, desempenho, mes });
    if (req.authz.own) lista = lista.filter(m => m.profissionalId === req.authz.profissionalId);
    res.json({ ok: true, data: { mes, metas: lista } });
  } catch (err) { next(err); }
});

// Define, altera ou remove (valorAlvo null ou 0) a meta de um profissional no mês.
router.put('/metas', authorize('metas:write'), async (req, res, next) => {
  try {
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    for (const k of Object.keys(b)) {
      if (CAMPOS_PROIBIDOS.includes(k)) throw createAppError('FORBIDDEN_FIELD', `Campo não permitido: ${k}.`, 422, { field: k });
      if (!['profissionalId', 'mes', 'tipo', 'valorAlvo'].includes(k)) throw createAppError('INVALID_FIELD', `Campo desconhecido: ${k}.`, 422, { field: k });
    }
    const mes = mesValido(b.mes);
    if (!['faturamento', 'atendimentos'].includes(b.tipo)) throw createAppError('INVALID_FIELD', 'tipo deve ser faturamento ou atendimentos.', 422, { field: 'tipo' });
    const remover = b.valorAlvo === null || b.valorAlvo === 0;
    if (!remover && (!Number.isInteger(b.valorAlvo) || b.valorAlvo < 1 || b.valorAlvo > ALVO_MAX[b.tipo])) {
      throw createAppError('INVALID_FIELD', `valorAlvo deve ser inteiro entre 1 e ${ALVO_MAX[b.tipo]} (centavos para faturamento).`, 422, { field: 'valorAlvo' });
    }
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [prof] = b.profissionalId ? await repo.list('profissionais', { empresa_id: repo.empresaId, id: String(b.profissionalId) }) : [];
    if (!prof) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.', 404);
    const [atual] = await repo.list('metas', { empresa_id: repo.empresaId, profissional_id: prof.id, mes, tipo: b.tipo });
    if (remover) {
      if (atual) await repo.deleteScoped('metas', atual.id);
      return res.json({ ok: true, data: { profissionalId: prof.id, mes, tipo: b.tipo, alvo: null } });
    }
    const agora = new Date().toISOString();
    const linha = atual
      ? await repo.updateScoped('metas', atual.id, { valor_alvo: b.valorAlvo, updated_by: req.auth.actor_id, updated_at: agora })
      : await repo.insert('metas', { profissional_id: prof.id, mes, tipo: b.tipo, valor_alvo: b.valorAlvo, created_by: req.auth.actor_id, updated_by: req.auth.actor_id });
    res.status(atual ? 200 : 201).json({ ok: true, data: { id: linha.id, profissionalId: prof.id, mes, tipo: b.tipo, alvo: linha.valor_alvo } });
  } catch (err) { next(err); }
});

router.get('/gamificacao/ranking', authorize('ranking:read'), async (req, res, next) => {
  try {
    const mes = mesValido(req.query.mes);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [empresa] = await repo.list('empresas', { id: repo.empresaId });
    const visivelEquipe = Boolean(empresa && empresa.ranking_visivel_equipe);
    // Equipe só vê se o salão ligou. Desligado = resposta normal e vazia (a tela esconde o
    // bloco); não é erro, para não gerar um 403 a cada abertura da aba.
    if (req.authz.own && !visivelEquipe) return res.json({ ok: true, data: { mes, visivelEquipe: false, ranking: [] } });
    const ranking = computeRanking({ desempenho: await desempenhoDoMes(repo, mes), comValores: !req.authz.own, destaqueId: req.authz.own ? req.authz.profissionalId : null });
    res.json({ ok: true, data: { mes, visivelEquipe, ranking } });
  } catch (err) { next(err); }
});

module.exports = { gamificacaoRouter: router };
