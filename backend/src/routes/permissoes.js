// Permissões individuais (D-032, migration 012). Proprietário e gerente concedem e revogam,
// para cada pessoa, permissões além do padrão do papel — dentro da própria autoridade
// (backend/src/auth/permissoes.js: motivoRecusa). Cada mudança fica registrada com quem
// fez, para quem e quando. A permissão revogada deixa de valer na próxima requisição:
// o vínculo é relido do banco a cada chamada.
const express = require('express');
const { createAppError } = require('../errors');
const { authorize } = require('../auth/rbac');
const { getIdentityStore } = require('../auth/identityStore');
const { PERMISSOES, PACOTES, permissoesEfetivas, motivoAlvo, motivoRecusa, extrasValidos, permissao } = require('../auth/permissoes');

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ator = req => ({ role: req.auth.role, permissoes_extras: req.auth.permissoes_extras, membership_id: req.auth.membership_id });

// Quais permissões quem pede pode mexer nesta pessoa (conceder ou revogar).
const editaveis = (req, alvo) => PERMISSOES.map(x => x.codigo).filter(codigo => !motivoRecusa({ ator: ator(req), alvo, codigo }));

router.get('/equipe/permissoes', authorize('equipe:permissoes'), async (req, res, next) => {
  try {
    const store = getIdentityStore();
    const membros = (await store.listMembershipsByEmpresa(req.auth.empresa_id)).filter(m => m.status === 'ativo');
    const pessoas = await Promise.all(membros.map(async m => {
      const u = await store.getAppUser(m.user_id);
      const podeEditar = editaveis(req, m);
      return {
        membershipId: m.id,
        nome: (u && u.nome) || null,
        email: (u && u.email) || null,
        role: m.role,
        profissionalId: m.profissional_id || null,
        voce: m.id === req.auth.membership_id,
        permissoesExtras: extrasValidos(m.permissoes_extras),
        efetivas: permissoesEfetivas(m.role, m.permissoes_extras),
        editaveis: podeEditar
      };
    }));
    res.json({
      ok: true,
      data: {
        catalogo: PERMISSOES.map(({ codigo, grupo, rotulo, nivel, padrao }) => ({ codigo, grupo, rotulo, nivel, padrao })),
        pacotes: PACOTES,
        pessoas
      }
    });
  } catch (err) { next(err); }
});

router.put('/equipe/permissoes/:membershipId', authorize('equipe:permissoes'), async (req, res, next) => {
  try {
    const id = String(req.params.membershipId || '');
    if (!UUID.test(id)) throw createAppError('INVALID_FIELD', 'membershipId inválido.', 422, { field: 'membershipId' });
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    for (const k of Object.keys(b)) if (k !== 'permissoes') throw createAppError('INVALID_FIELD', `Campo desconhecido: ${k}.`, 422, { field: k });
    if (!Array.isArray(b.permissoes) || b.permissoes.some(c => typeof c !== 'string')) throw createAppError('INVALID_FIELD', 'permissoes deve ser uma lista de códigos.', 422, { field: 'permissoes' });
    const desconhecidas = b.permissoes.filter(c => !permissao(c));
    if (desconhecidas.length) throw createAppError('UNKNOWN_PERMISSION', `Permissão desconhecida: ${desconhecidas.join(', ')}.`, 422, { desconhecidas });

    const store = getIdentityStore();
    const alvo = await store.getMembership(id);
    if (!alvo || alvo.empresa_id !== req.auth.empresa_id) throw createAppError('MEMBERSHIP_NOT_FOUND', 'Pessoa não encontrada.', 404);
    if (alvo.status !== 'ativo') throw createAppError('MEMBERSHIP_INACTIVE', 'Vínculo inativo.', 409);
    // Fora da autoridade é recusado mesmo sem mudança (pedido vazio também).
    const recusaAlvo = motivoAlvo({ ator: ator(req), alvo });
    if (recusaAlvo) throw createAppError('PERMISSION_GRANT_FORBIDDEN', 'Sem autoridade sobre as permissões desta pessoa.', 403, { motivo: recusaAlvo });

    const antes = extrasValidos(alvo.permissoes_extras);
    const depois = [...new Set(b.permissoes)];
    const mudancas = [...depois.filter(c => !antes.includes(c)), ...antes.filter(c => !depois.includes(c))];
    for (const codigo of mudancas) {
      const motivo = motivoRecusa({ ator: ator(req), alvo, codigo });
      if (motivo) throw createAppError('PERMISSION_GRANT_FORBIDDEN', `Sem autoridade para mudar "${codigo}" desta pessoa.`, 403, { codigo, motivo });
    }
    // Códigos antigos que saíram do catálogo continuam guardados até alguém mexer de novo.
    const legados = (Array.isArray(alvo.permissoes_extras) ? alvo.permissoes_extras : []).filter(c => !permissao(c));
    const r = await store.definirPermissoes({ empresaId: req.auth.empresa_id, membershipId: alvo.id, actorId: req.auth.actor_id, permissoes: [...depois, ...legados] });
    res.json({ ok: true, data: { membershipId: alvo.id, ...r, efetivas: permissoesEfetivas(alvo.role, r.permissoes) } });
  } catch (err) { next(err); }
});

router.get('/equipe/permissoes/:membershipId/historico', authorize('equipe:permissoes'), async (req, res, next) => {
  try {
    const id = String(req.params.membershipId || '');
    if (!UUID.test(id)) throw createAppError('INVALID_FIELD', 'membershipId inválido.', 422, { field: 'membershipId' });
    const store = getIdentityStore();
    const alvo = await store.getMembership(id);
    if (!alvo || alvo.empresa_id !== req.auth.empresa_id) throw createAppError('MEMBERSHIP_NOT_FOUND', 'Pessoa não encontrada.', 404);
    const eventos = await store.listPermissaoEventos(req.auth.empresa_id, alvo.id);
    const nomes = new Map();
    const nomeDe = async uid => { if (!nomes.has(uid)) { const u = await store.getAppUser(uid); nomes.set(uid, (u && u.nome) || null); } return nomes.get(uid); };
    const data = await Promise.all(eventos.map(async e => ({ acao: e.acao, permissao: e.permissao, quando: e.created_at, por: await nomeDe(e.actor_id), para: await nomeDe(e.alvo_user_id) })));
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

module.exports = { permissoesRouter: router };
