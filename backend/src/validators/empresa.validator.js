// Dados da empresa editáveis pelo app (onboarding e Gestão). Lista fechada de
// campos: id/empresa_id nunca vêm do cliente; a empresa é sempre a do req.auth.
const { createAppError } = require('../errors');

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const TEXTOS = ['nome', 'telefone', 'whatsapp', 'endereco', 'cidade'];
const PERMITIDOS = [...TEXTOS, 'horarioPorDia', 'slotPadrao', 'intervaloAlmoco', 'almocoInicio', 'almocoFim'];

const invalido = (field, message) => createAppError('INVALID_FIELD', message, 422, { field });
const minutos = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));

function horarioPorDia(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalido('horarioPorDia', 'horarioPorDia deve ser objeto por dia (dom..sab).');
  const out = {};
  for (const [dia, cfg] of Object.entries(value)) {
    if (!DIAS.includes(dia)) throw invalido('horarioPorDia', `Dia inválido: ${dia}`);
    if (!cfg || typeof cfg !== 'object') throw invalido('horarioPorDia', `Configuração inválida para ${dia}`);
    const ativo = cfg.ativo === true;
    const inicio = String(cfg.inicio || '');
    const fim = String(cfg.fim || '');
    if (ativo && (!HORA.test(inicio) || !HORA.test(fim) || minutos(fim) <= minutos(inicio))) {
      throw invalido('horarioPorDia', `Horário inválido em ${dia}: use HH:MM e fim depois do início.`);
    }
    out[dia] = { ativo, inicio: HORA.test(inicio) ? inicio : '09:00', fim: HORA.test(fim) ? fim : '19:00' };
  }
  return out;
}

function validateUpdateEmpresaPayload(payload = {}) {
  const extra = Object.keys(payload || {}).find(k => !PERMITIDOS.includes(k));
  if (extra) throw createAppError('FORBIDDEN_FIELD', `Campo proibido no payload: ${extra}`, 422, { field: extra });
  const out = {};
  for (const campo of TEXTOS) {
    if (payload[campo] === undefined) continue;
    const v = payload[campo] === null ? null : String(payload[campo]).trim();
    if (campo === 'nome' && !v) throw invalido('nome', 'nome não pode ficar vazio.');
    if (v && v.length > 200) throw invalido(campo, `${campo} muito longo.`);
    out[campo] = v || null;
  }
  if (payload.horarioPorDia !== undefined) out.horario_por_dia = horarioPorDia(payload.horarioPorDia);
  if (payload.slotPadrao !== undefined) {
    const n = Number(payload.slotPadrao);
    if (![10, 15, 20, 30, 45, 60].includes(n)) throw invalido('slotPadrao', 'slotPadrao deve ser 10, 15, 20, 30, 45 ou 60.');
    out.slot_padrao = n;
  }
  if (payload.intervaloAlmoco !== undefined) out.intervalo_almoco = payload.intervaloAlmoco === true;
  for (const [campo, coluna] of [['almocoInicio', 'almoco_inicio'], ['almocoFim', 'almoco_fim']]) {
    if (payload[campo] === undefined) continue;
    if (payload[campo] !== null && !HORA.test(String(payload[campo]))) throw invalido(campo, `${campo} deve ser HH:MM.`);
    out[coluna] = payload[campo];
  }
  if (out.intervalo_almoco && out.almoco_inicio && out.almoco_fim && minutos(out.almoco_fim) <= minutos(out.almoco_inicio)) {
    throw invalido('almocoFim', 'Fim do almoço deve ser depois do início.');
  }
  if (!Object.keys(out).length) throw createAppError('EMPTY_UPDATE', 'Nenhum campo válido para atualizar.', 422);
  out.updated_at = new Date().toISOString();
  return out;
}

module.exports = { validateUpdateEmpresaPayload, DIAS };
