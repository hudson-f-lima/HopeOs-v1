// Cargos e categorias de serviço (Onda B, migration 008, D-009).
// Base da herança de comissão: ver engines/CommissionResolver.js.
const express = require('express');
const { createAppError } = require('../errors');
const { authorize } = require('../auth/rbac');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { validateUUID, validateCargoPayload, validateCategoriaPayload } = require('../validators/cadastros.validator');

const router = express.Router();

function crud(path, table, validate, rotulo, codigo) {
  const duplicado = err => {
    if (err && err.code === '23505') return createAppError(`${codigo}_EXISTS`, `Já existe ${rotulo} com este nome.`, 409);
    return err;
  };
  const nomeRepetido = async (repo, nome, ignorarId) => {
    const existentes = await repo.list(table, { empresa_id: repo.empresaId });
    return existentes.some(r => r.id !== ignorarId && r.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  };

  router.get(path, authorize('cadastros:ver'), async (req, res, next) => {
    try {
      const repo = new SupabaseRepository(req.auth.empresa_id);
      res.json({ ok: true, data: await repo.list(table, { empresa_id: repo.empresaId }) });
    } catch (err) { next(err); }
  });

  router.post(path, authorize('catalogo:editar'), async (req, res, next) => {
    try {
      const payload = validate(req.body);
      const repo = new SupabaseRepository(req.auth.empresa_id);
      if (await nomeRepetido(repo, payload.nome)) throw createAppError(`${codigo}_EXISTS`, `Já existe ${rotulo} com este nome.`, 409);
      res.status(201).json({ ok: true, data: await repo.insertScoped(table, payload) });
    } catch (err) { next(duplicado(err)); }
  });

  router.patch(`${path}/:id`, authorize('catalogo:editar'), async (req, res, next) => {
    try {
      const id = validateUUID(req.params.id, 'id');
      const payload = validate(req.body, { parcial: true });
      const repo = new SupabaseRepository(req.auth.empresa_id);
      if (!(await repo.getByIdScoped(table, id))) throw createAppError(`${codigo}_NOT_FOUND`, `${rotulo} não encontrado(a).`, 404);
      if (payload.nome && await nomeRepetido(repo, payload.nome, id)) throw createAppError(`${codigo}_EXISTS`, `Já existe ${rotulo} com este nome.`, 409);
      res.json({ ok: true, data: await repo.updateScoped(table, id, payload) });
    } catch (err) { next(duplicado(err)); }
  });
}

crud('/cargos', 'cargos', validateCargoPayload, 'cargo', 'CARGO');
crud('/categorias', 'servico_categorias', validateCategoriaPayload, 'categoria', 'CATEGORIA');

// Cargo/categoria referenciados precisam ser da empresa do req.auth (o banco
// também garante por trigger; aqui o erro sai claro antes de gravar).
async function assertRefsDaEmpresa(repo, payload) {
  if (payload.cargo_id && !(await repo.getByIdScoped('cargos', payload.cargo_id))) {
    throw createAppError('CARGO_NOT_FOUND', 'Cargo não encontrado nesta empresa.', 422, { cargoId: payload.cargo_id });
  }
  if (payload.categoria_id && !(await repo.getByIdScoped('servico_categorias', payload.categoria_id))) {
    throw createAppError('CATEGORIA_NOT_FOUND', 'Categoria não encontrada nesta empresa.', 422, { categoriaId: payload.categoria_id });
  }
}

module.exports = { estruturaRouter: router, assertRefsDaEmpresa };
