// Regras do plano de assinatura (Onda A, fase 1; D-042, migration 021). Puro: sem banco, sem relógio.
//
// avaliarUso() responde, para um atendimento de um assinante: está coberto? quanto cobrar? consome
// um uso do ciclo? precisa de aprovação? e por quê. A fase 2 usa esta mesma função na agenda e na
// comanda; na fase 1 ela alimenta o simulador da tela de planos.
//
// Ordem das regras:
//   1. Serviço fora do plano → não coberto (cobra o valor de tabela, não consome).
//   2. Limite do ciclo esgotado → não coberto (é limite, não se contorna pela política).
//   3. Restrições do item/plano (dia da semana, faixa de horário, profissional, intervalo mínimo):
//      se alguma falhar, vale a política "fora da regra" do plano, escolhida pelo gestor:
//        bloquear                       → cobra o valor de tabela, não consome (padrão);
//        cobrar_percentual_consumir     → cobra X% da tabela e consome 1 uso;
//        cobrar_percentual_sem_consumir → cobra X% da tabela, não consome;
//        cobertura_total                → cobre como se estivesse na regra (só avisa).
//      Com teto por ciclo atingido, volta a "bloquear". Uma política por plano: várias
//      restrições violadas ao mesmo tempo não somam.
//   4. Tudo certo → coberto: cobra o que o desconto do item não cobre e consome 1 uso.
// Valores em centavos inteiros; percentual arredondado ao centavo (metade para cima).

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const ACOES = ['bloquear', 'cobrar_percentual_consumir', 'cobrar_percentual_sem_consumir', 'cobertura_total'];

const minutos = h => { const [a, b] = String(h || '').slice(0, 5).split(':').map(Number); return a * 60 + b; };
const pct = (centavos, percentual) => Math.round((Number(centavos) * Number(percentual)) / 100);
const diaDaSemana = data => new Date(`${data}T12:00:00Z`).getUTCDay();
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

// Preço de tabela do serviço com o ajuste do profissional, como no resto do sistema.
function precoDeTabela(servico, profissional) {
  const o = (profissional && profissional.overrides && servico && profissional.overrides[servico.id]) || {};
  const v = [o.valor_centavos, o.valorCentavos, servico && servico.valor_centavos].find(x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x) >= 0);
  return v === undefined ? 0 : Number(v);
}

function restricoesVioladas({ item, profissionaisPermitidos, uso, ultimoUsoData }) {
  const motivos = [];
  if (Array.isArray(item.dias_semana) && item.dias_semana.length && !item.dias_semana.map(Number).includes(diaDaSemana(uso.data))) {
    motivos.push({ codigo: 'dia_da_semana', texto: `O plano não cobre ${DIAS[diaDaSemana(uso.data)]}; vale ${item.dias_semana.map(d => DIAS[d]).join(', ')}.` });
  }
  if (item.horario_inicio && item.horario_fim) {
    const m = minutos(uso.horario);
    if (m < minutos(item.horario_inicio) || m >= minutos(item.horario_fim)) {
      motivos.push({ codigo: 'horario', texto: `O plano cobre das ${String(item.horario_inicio).slice(0, 5)} às ${String(item.horario_fim).slice(0, 5)}.` });
    }
  }
  if (Array.isArray(profissionaisPermitidos) && profissionaisPermitidos.length && !profissionaisPermitidos.includes(uso.profissionalId)) {
    motivos.push({ codigo: 'profissional', texto: 'Este profissional não atende pelo plano.' });
  }
  if (item.intervalo_min_dias && ultimoUsoData) {
    const passados = diasEntre(ultimoUsoData, uso.data);
    if (passados < Number(item.intervalo_min_dias)) {
      motivos.push({ codigo: 'intervalo', texto: `O plano pede ${item.intervalo_min_dias} dia(s) entre usos; o último foi há ${passados}.` });
    }
  }
  return motivos;
}

// plano: linha de assinatura_planos; itens: linhas do plano; profissionaisPermitidos: ids (vazio = todos)
// uso: { servicoId, profissionalId, data 'AAAA-MM-DD', horario 'HH:MM' }
// historico: { usosNoCiclo (deste serviço), foraDaRegraNoCiclo (do assinante), ultimoUsoData (deste serviço) }
function avaliarUso({ plano, itens, profissionaisPermitidos = [], uso, historico = {}, precoTabelaCentavos }) {
  const tabela = Math.max(0, Number(precoTabelaCentavos) || 0);
  const item = (itens || []).find(i => i.servico_id === uso.servicoId);
  const base = { precoTabelaCentavos: tabela, motivos: [], exigeAprovacao: false };
  if (!item) {
    return { ...base, situacao: 'nao_coberto', coberto: false, cobrarCentavos: tabela, consomeUso: false,
      motivos: [{ codigo: 'servico_fora_do_plano', texto: 'Serviço não incluído no plano.' }] };
  }
  const usados = Number(historico.usosNoCiclo) || 0;
  const limite = item.limite_por_ciclo === null || item.limite_por_ciclo === undefined ? null : Number(item.limite_por_ciclo);
  const usoDoCiclo = limite === null ? { usados, limite: null } : { usados, limite };
  if (limite !== null && usados >= limite) {
    return { ...base, situacao: 'limite_atingido', coberto: false, cobrarCentavos: tabela, consomeUso: false, usoDoCiclo,
      motivos: [{ codigo: 'limite', texto: `Limite do ciclo atingido (${usados} de ${limite}).` }] };
  }
  const cobertoCentavos = tabela - pct(tabela, item.desconto_percentual === undefined ? 100 : item.desconto_percentual);
  const motivos = restricoesVioladas({ item, profissionaisPermitidos, uso, ultimoUsoData: historico.ultimoUsoData });
  if (!motivos.length) {
    return { ...base, situacao: 'coberto', coberto: true, cobrarCentavos: cobertoCentavos, consomeUso: true, usoDoCiclo };
  }
  const acao = ACOES.includes(plano.fora_regra_acao) ? plano.fora_regra_acao : 'bloquear';
  const teto = plano.fora_regra_teto_ciclo === null || plano.fora_regra_teto_ciclo === undefined ? null : Number(plano.fora_regra_teto_ciclo);
  const foraNoCiclo = Number(historico.foraDaRegraNoCiclo) || 0;
  if (acao !== 'bloquear' && teto !== null && foraNoCiclo >= teto) {
    return { ...base, situacao: 'fora_da_regra', acao: 'bloquear', coberto: false, cobrarCentavos: tabela, consomeUso: false, usoDoCiclo,
      motivos: [...motivos, { codigo: 'teto_fora_da_regra', texto: `Já foram ${foraNoCiclo} uso(s) fora da regra neste ciclo (máximo ${teto}).` }] };
  }
  const exigeAprovacao = acao !== 'bloquear' && Boolean(plano.fora_regra_exige_aprovacao);
  if (acao === 'cobertura_total') {
    return { ...base, situacao: 'fora_da_regra', acao, coberto: true, cobrarCentavos: cobertoCentavos, consomeUso: true, usoDoCiclo, motivos, exigeAprovacao };
  }
  if (acao === 'bloquear') {
    return { ...base, situacao: 'fora_da_regra', acao, coberto: false, cobrarCentavos: tabela, consomeUso: false, usoDoCiclo, motivos };
  }
  const cobrar = pct(tabela, plano.fora_regra_percentual);
  return { ...base, situacao: 'fora_da_regra', acao, coberto: false, cobrarCentavos: cobrar,
    consomeUso: acao === 'cobrar_percentual_consumir', usoDoCiclo, motivos, exigeAprovacao };
}

module.exports = { avaliarUso, precoDeTabela, restricoesVioladas, ACOES, DIAS };
