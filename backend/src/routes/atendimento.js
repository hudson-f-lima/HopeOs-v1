// Atendimento com vários serviços — consulta de combinações (D-040, Onda 1). Somente leitura:
// nada é gravado aqui. A gravação "tudo ou nada" das etapas é a Onda 2 (migration 019).
//
// POST /api/agenda/combinacoes
//   { data, itens: [{ servicoId, profissionalId? }], horario?, escolha?: [{ servicoId, profissionalId, horario }] }
// Devolve as opções (um profissional; sequência com profissionais diferentes; fracionado com
// espera até o limite), os totais por profissional e, se veio `escolha`, se ela ainda é válida.
// O servidor recalcula preço e duração: nada disso vem do cliente.
const express = require('express');
const { authorize } = require('../auth/rbac');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { createAppError } = require('../errors');
const { env } = require('../config/env');
const clock = require('../config/clock');
const { validateUUID } = require('../validators/cadastros.validator');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { timeToMinutes } = require('../engines/ScheduleEngine');
const { combinar, validarEtapas, livresDoProfissional, precoDe, duracaoDe, minutesToTime, MAX_SERVICOS, ESPERA_MAX_PADRAO_MIN } = require('../engines/AtendimentoEngine');

const router = express.Router();
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const invalido = (field, message) => createAppError('INVALID_FIELD', message, 422, { field });

function esperaMaxDe(empresa) {
  const n = Number(empresa && empresa.atendimento_espera_max_min);
  return Number.isInteger(n) && n >= 0 && n <= 240 && empresa.atendimento_espera_max_min !== null && empresa.atendimento_espera_max_min !== undefined ? n : ESPERA_MAX_PADRAO_MIN;
}

// Contexto do dia para o motor: catálogo ativo, vínculos e espaços livres de cada profissional.
// Usado por esta consulta e, na Onda 2, pela revalidação ao gravar.
async function contextoDoDia(repo, data, { ignorarIds = [] } = {}) {
  const filtro = { empresa_id: repo.empresaId };
  const [empresa, servicos, profissionais, vinculos, agendamentos] = await Promise.all([
    repo.empresaComDisponibilidade(),
    repo.list('servicos', filtro), repo.list('profissionais', filtro), repo.list('profissional_servicos', filtro),
    repo.list('agendamentos', { ...filtro, data })
  ]);
  const ativos = profissionais.filter(p => p.ativo !== false);
  const livresPor = new Map(ativos.map(p => [p.id, livresDoProfissional({ profissional: p, empresa: empresa || {}, data, agendamentos, ignorarIds })]));
  const agora = agoraNoFuso(env.APP_TIMEZONE, clock.agora());
  return {
    empresa: empresa || {}, servicos: servicos.filter(s => s.ativo !== false), profissionais: ativos, vinculos, livresPor,
    esperaMaxMin: esperaMaxDe(empresa), passado: data < agora.data, inicioMinimoMin: data === agora.data ? agora.minuto + 1 : null
  };
}

function validarPedido(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw createAppError('INVALID_PAYLOAD', 'Payload inválido.', 422);
  const { data, itens, horario, escolha } = body;
  if (typeof data !== 'string' || !DATA_RE.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) throw invalido('data', 'data deve ser AAAA-MM-DD.');
  if (!Array.isArray(itens) || !itens.length || itens.length > MAX_SERVICOS) throw invalido('itens', `Informe de 1 a ${MAX_SERVICOS} serviços.`);
  for (const it of itens) {
    validateUUID(it && it.servicoId, 'servicoId');
    if (it.profissionalId !== undefined && it.profissionalId !== null) validateUUID(it.profissionalId, 'profissionalId');
  }
  if (new Set(itens.map(i => i.servicoId)).size !== itens.length) throw invalido('itens', 'O mesmo serviço aparece duas vezes.');
  if (horario !== undefined && horario !== null && (typeof horario !== 'string' || !HORA_RE.test(horario))) throw invalido('horario', 'horario deve ser HH:MM.');
  if (escolha !== undefined && escolha !== null) {
    if (!Array.isArray(escolha) || escolha.length !== itens.length) throw invalido('escolha', 'escolha deve ter uma etapa por serviço.');
    for (const e of escolha) {
      validateUUID(e && e.servicoId, 'escolha.servicoId'); validateUUID(e.profissionalId, 'escolha.profissionalId');
      if (typeof e.horario !== 'string' || !HORA_RE.test(e.horario)) throw invalido('escolha.horario', 'horario deve ser HH:MM.');
    }
  }
  return { data, itens, horario: horario || null, escolha: escolha || null };
}

const etapaPublica = e => ({
  servicoId: e.servico.id, servicoNome: e.servico.nome, profissionalId: e.profissional.id, profissionalNome: e.profissional.nome,
  fixado: e.fixado, inicio: minutesToTime(e.inicioMin), fim: minutesToTime(e.fimMin), duracaoMin: e.duracaoMin,
  precoCentavos: e.precoCentavos, esperaAntesMin: e.esperaAntesMin
});

router.post('/agenda/combinacoes', authorize('agenda:ver'), async (req, res, next) => {
  try {
    const pedido = validarPedido(req.body);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const ctx = await contextoDoDia(repo, pedido.data);
    // Escopo "próprio" (profissional): só combina consigo mesmo.
    const proprio = req.authz && req.authz.own ? (req.authz.profissionalId || req.auth.profissional_id) : null;
    const profissionais = proprio ? ctx.profissionais.filter(p => p.id === proprio) : ctx.profissionais;
    const itens = pedido.itens.map(it => {
      const servico = ctx.servicos.find(s => s.id === it.servicoId);
      if (!servico) throw createAppError('SERVICE_NOT_FOUND', 'Serviço não encontrado ou inativo.', 422, { id: it.servicoId });
      if (it.profissionalId && !profissionais.some(p => p.id === it.profissionalId)) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado ou inativo.', 422, { id: it.profissionalId });
      return { servico, profissionalId: it.profissionalId || null };
    });
    const r = ctx.passado ? { opcoes: [], totaisPorProfissional: [], semCandidato: [] } : combinar({
      itens, profissionais, vinculos: ctx.vinculos, livresPor: ctx.livresPor, esperaMaxMin: ctx.esperaMaxMin,
      inicioMinimoMin: ctx.inicioMinimoMin, horario: pedido.horario
    });
    let escolha = null;
    if (pedido.escolha) {
      const etapas = pedido.escolha.map(e => {
        const servico = ctx.servicos.find(s => s.id === e.servicoId);
        const prof = profissionais.find(p => p.id === e.profissionalId);
        return { servico, prof, profissionalId: e.profissionalId, inicioMin: timeToMinutes(e.horario), duracaoMin: servico && prof ? duracaoDe(servico, prof) : 0 };
      });
      const semCadastro = etapas.map((e, i) => (!e.servico || !e.prof ? { etapa: i, motivo: 'cadastro' } : null)).filter(Boolean);
      const problemas = semCadastro.length || ctx.passado ? semCadastro.concat(ctx.passado ? [{ etapa: 0, motivo: 'passado' }] : [])
        : validarEtapas({ etapas, livresPor: ctx.livresPor, esperaMaxMin: ctx.esperaMaxMin, inicioMinimoMin: ctx.inicioMinimoMin });
      escolha = {
        valida: problemas.length === 0, problemas,
        precoCentavos: etapas.reduce((s, e) => s + (e.servico && e.prof ? precoDe(e.servico, e.prof) : 0), 0),
        duracaoMin: etapas.reduce((s, e) => s + e.duracaoMin, 0)
      };
    }
    res.json({
      ok: true,
      data: {
        data: pedido.data, esperaMaxMin: ctx.esperaMaxMin,
        totaisPorProfissional: r.totaisPorProfissional.map(t => ({ ...t, profissionalNome: (profissionais.find(p => p.id === t.profissionalId) || {}).nome || null })),
        semProfissional: r.semCandidato,
        opcoes: r.opcoes.map(o => ({
          tipo: o.tipo, inicio: minutesToTime(o.inicioMin), fim: minutesToTime(o.fimMin), esperaMin: o.esperaMin,
          tempoTotalMin: o.tempoTotalMin, duracaoMin: o.duracaoMin, precoCentavos: o.precoCentavos, etapas: o.etapas.map(etapaPublica)
        })),
        escolha
      }
    });
  } catch (err) { next(err); }
});

module.exports = { atendimentoRouter: router, contextoDoDia, esperaMaxDe };
