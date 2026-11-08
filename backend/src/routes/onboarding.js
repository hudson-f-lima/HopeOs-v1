// Assistente de configuração (Onda A, D-008) e dados da empresa.
// Sem migration: usa empresas/servicos/formas_pagamento/profissionais existentes.
const express = require('express');
const { createAppError } = require('../errors');
const { authorize } = require('../auth/rbac');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { validateUpdateEmpresaPayload } = require('../validators/empresa.validator');
const { validateCreateServicoPayload, validateCreateFormaPagamentoPayload } = require('../validators/cadastros.validator');
const { listarPresets } = require('../onboarding/presets');
const { calcularStatus } = require('../onboarding/status');

const router = express.Router();
const MAX_ITENS = 50;

const CAMPOS_EMPRESA = ['id', 'nome', 'telefone', 'whatsapp', 'endereco', 'cidade', 'horario_por_dia', 'slot_padrao', 'intervalo_almoco', 'almoco_inicio', 'almoco_fim'];

async function carregarEmpresa(repo) {
  const empresa = (await repo.list('empresas', { id: repo.empresaId }))[0];
  if (!empresa) throw createAppError('EMPRESA_NOT_FOUND', 'Empresa não cadastrada no banco. Veja o passo 7 do runbook.', 404);
  return empresa;
}

function publica(empresa) {
  return Object.fromEntries(CAMPOS_EMPRESA.map(c => [c, empresa[c] ?? null]));
}

function itens(body) {
  const lista = body && body.itens;
  if (!Array.isArray(lista) || !lista.length) throw createAppError('ITEMS_REQUIRED', 'Informe itens[].', 422);
  if (lista.length > MAX_ITENS) throw createAppError('TOO_MANY_ITEMS', `No máximo ${MAX_ITENS} itens por vez.`, 422);
  return lista;
}

router.get('/empresa', authorize('cadastros:read'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: publica(await carregarEmpresa(repo)) });
  } catch (err) { next(err); }
});

router.patch('/empresa', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const patch = validateUpdateEmpresaPayload(req.body);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    await carregarEmpresa(repo);
    res.json({ ok: true, data: publica(await repo.updateEmpresa(patch)) });
  } catch (err) { next(err); }
});

router.get('/onboarding/status', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtro = { empresa_id: repo.empresaId };
    const [empresa, formas, servicos, profissionais, vinculos] = await Promise.all([
      carregarEmpresa(repo),
      repo.list('formas_pagamento', filtro),
      repo.list('servicos', filtro),
      repo.list('profissionais', filtro),
      repo.list('profissional_servicos', filtro)
    ]);
    res.json({ ok: true, data: calcularStatus({ empresa, formas, servicos, profissionais, vinculos }) });
  } catch (err) { next(err); }
});

router.get('/onboarding/presets', authorize('cadastros:write'), (req, res) => {
  res.json({ ok: true, data: listarPresets() });
});

// Cria os serviços escolhidos; repetir o mesmo nome não duplica (idempotente).
router.post('/onboarding/servicos', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const payloads = itens(req.body).map(validateCreateServicoPayload);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const existentes = new Set((await repo.list('servicos', { empresa_id: repo.empresaId })).map(s => s.nome.trim().toLowerCase()));
    const criados = [];
    const ignorados = [];
    for (const p of payloads) {
      const chave = p.nome.trim().toLowerCase();
      if (existentes.has(chave)) { ignorados.push(p.nome); continue; }
      existentes.add(chave);
      criados.push(await repo.insertScoped('servicos', p));
    }
    res.status(201).json({ ok: true, data: { criados, ignorados } });
  } catch (err) { next(err); }
});

// Cria as formas de pagamento escolhidas; código já existente é mantido como está.
router.post('/onboarding/formas', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const payloads = itens(req.body).map(validateCreateFormaPagamentoPayload);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const existentes = new Set((await repo.list('formas_pagamento', { empresa_id: repo.empresaId })).map(f => f.code));
    const criadas = [];
    const ignoradas = [];
    for (const p of payloads) {
      if (existentes.has(p.code)) { ignoradas.push(p.code); continue; }
      existentes.add(p.code);
      criadas.push(await repo.createFormaPagamento(p));
    }
    res.status(201).json({ ok: true, data: { criadas, ignoradas } });
  } catch (err) { next(err); }
});

module.exports = { onboardingRouter: router };
