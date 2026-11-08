// Dados da empresa editáveis pelo app (onboarding e Gestão). Lista fechada de
// campos: id/empresa_id nunca vêm do cliente; a empresa é sempre a do req.auth.
const { createAppError } = require('../errors');

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const TEXTOS = ['nome', 'telefone', 'whatsapp', 'endereco', 'cidade'];
const PERMITIDOS = [...TEXTOS, 'horarioPorDia', 'slotPadrao', 'intervaloAlmoco', 'almocoInicio', 'almocoFim',
  'cnpj', 'razaoSocial', 'salaoParceiro', 'bufferMin', 'reguaAlertaFaltas', 'reguaSinalFaltas'];

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

// CNPJ: 14 dígitos com os dois dígitos verificadores corretos (aceita máscara).
function cnpjValido(digitos) {
  if (!/^\d{14}$/.test(digitos) || /^(\d)\1{13}$/.test(digitos)) return false;
  const dv = base => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const resto = [...base].reduce((acc, d, i) => acc + Number(d) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(digitos.slice(0, 12));
  const d2 = dv(digitos.slice(0, 12) + d1);
  return digitos.endsWith(`${d1}${d2}`);
}

function inteiro(value, field, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw invalido(field, `${field} deve ser inteiro entre ${min} e ${max}.`);
  return n;
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
  if (payload.cnpj !== undefined) {
    if (payload.cnpj === null || String(payload.cnpj).trim() === '') out.cnpj = null;
    else {
      const digitos = String(payload.cnpj).replace(/\D/g, '');
      if (!cnpjValido(digitos)) throw invalido('cnpj', 'CNPJ inválido: confira os 14 dígitos.');
      out.cnpj = digitos;
    }
  }
  if (payload.razaoSocial !== undefined) {
    const v = payload.razaoSocial === null ? '' : String(payload.razaoSocial).trim();
    if (v.length > 200) throw invalido('razaoSocial', 'razaoSocial muito longa.');
    out.razao_social = v || null;
  }
  if (payload.salaoParceiro !== undefined) out.salao_parceiro = payload.salaoParceiro === true;
  if (payload.bufferMin !== undefined) {
    const n = Number(payload.bufferMin);
    if (![0, 5, 10, 15].includes(n)) throw invalido('bufferMin', 'bufferMin deve ser 0, 5, 10 ou 15.');
    out.buffer_min = n;
  }
  if (payload.reguaAlertaFaltas !== undefined) out.regua_alerta_faltas = inteiro(payload.reguaAlertaFaltas, 'reguaAlertaFaltas', 1, 19);
  if (payload.reguaSinalFaltas !== undefined) out.regua_sinal_faltas = inteiro(payload.reguaSinalFaltas, 'reguaSinalFaltas', 2, 20);
  if (out.regua_alerta_faltas !== undefined && out.regua_sinal_faltas !== undefined && out.regua_sinal_faltas <= out.regua_alerta_faltas) {
    throw invalido('reguaSinalFaltas', 'A falta que pede sinal deve vir depois da que gera alerta.');
  }
  if (out.intervalo_almoco && out.almoco_inicio && out.almoco_fim && minutos(out.almoco_fim) <= minutos(out.almoco_inicio)) {
    throw invalido('almocoFim', 'Fim do almoço deve ser depois do início.');
  }
  if (!Object.keys(out).length) throw createAppError('EMPTY_UPDATE', 'Nenhum campo válido para atualizar.', 422);
  out.updated_at = new Date().toISOString();
  return out;
}

module.exports = { validateUpdateEmpresaPayload, cnpjValido, DIAS };
