// Cobertura do plano de assinatura na comanda (Onda A, fase 2; D-043, migration 022).
//
// A tela marca, em cada serviço, qual assinatura usar (item.assinaturaId). O servidor decide o resto
// com a mesma regra da consulta de cobertura: situação do pagamento, limite do ciclo, restrições e a
// política "fora da regra" do plano. Nunca confia em valor vindo da tela.
//   - Coberto: o item entra com o preço que o desconto do plano não cobre (normalmente R$ 0) e gera
//     um uso. Comissão do item = % do serviço sobre o valor cobrado (R$ 0 → 0); o rateio do ciclo é a fase 3.
//   - Fora da regra com cobrança de X%: o item entra com X% da tabela; comissão normal sobre esse valor
//     (decisão do dono); gera um uso (consumindo ou não, conforme o plano), que conta no teto.
//   - Bloqueada, limite esgotado, serviço fora do plano ou política "bloquear": o item entra com o preço
//     cheio, sem uso, e a resposta diz por quê.
// Os usos são gravados na mesma transação do fechamento (checkout_close_assinatura).
const { createAppError } = require('../errors');
const { pode } = require('../auth/rbac');
const { avaliarUso, precoDeTabela } = require('../engines/AssinaturaRegrasEngine');
const { situacao, historicoDoCiclo } = require('../engines/AssinaturaCicloEngine');

const APLICA = new Set(['cobrar_percentual_consumir', 'cobrar_percentual_sem_consumir', 'cobertura_total']);

async function aplicarAssinaturas({ repo, auth, actorId = null, payload, resolved, dia, horario }) {
  const pedidos = (payload.itens || []).map((it, i) => ({ it, i })).filter(x => x.it && x.it.assinaturaId);
  if (!pedidos.length) return { usos: [], itens: [] };
  const clienteId = payload.clienteId || payload.cliente_id;
  if (!clienteId) throw createAppError('ASSINATURA_SEM_CLIENTE', 'Escolha o cliente para usar o plano.', 422);
  const [assinaturas, planos, itensPlano, profsPlano, cobrancas, usos, estornos, servicos, profissionais] = await Promise.all([
    repo.list('assinaturas', { empresa_id: repo.empresaId, cliente_id: clienteId }),
    repo.list('assinatura_planos', { empresa_id: repo.empresaId }),
    repo.list('assinatura_plano_itens', { empresa_id: repo.empresaId }),
    repo.list('assinatura_plano_profissionais', { empresa_id: repo.empresaId }),
    repo.list('assinatura_cobrancas', { empresa_id: repo.empresaId }),
    repo.list('assinatura_usos', { empresa_id: repo.empresaId }),
    repo.list('assinatura_usos_estornos', { empresa_id: repo.empresaId }),
    repo.list('servicos', { empresa_id: repo.empresaId }),
    repo.list('profissionais', { empresa_id: repo.empresaId })
  ]);
  const estornados = new Set(estornos.map(e => e.uso_id));
  // Usos desta mesma comanda contam para o limite, o teto e o intervalo dos itens seguintes.
  const extras = [];
  const resultado = [];
  const gravar = [];
  for (const { it, i } of pedidos) {
    const item = resolved.itens[i];
    if (!item || item.tipo !== 'servico') throw createAppError('ASSINATURA_SO_SERVICO', `Item ${i + 1}: o plano cobre só serviços.`, 422, { itemIndex: i });
    const a = assinaturas.find(x => x.id === it.assinaturaId);
    if (!a) throw createAppError('ASSINATURA_DE_OUTRO_CLIENTE', `Item ${i + 1}: assinatura não encontrada para este cliente.`, 422, { itemIndex: i });
    const plano = planos.find(p => p.id === a.plano_id);
    const sit = situacao({ assinatura: a, plano, cobrancas: cobrancas.filter(c => c.assinatura_id === a.id), hoje: dia });
    const servico = servicos.find(s => s.id === item.servicoId);
    const profissional = profissionais.find(p => p.id === item.profissionalId);
    const tabela = precoDeTabela(servico, profissional);
    let r;
    if (!sit.podeUsar || !sit.cicloAtual) {
      r = { situacao: 'bloqueada', coberto: false, cobrarCentavos: tabela, consomeUso: false, motivos: [{ codigo: 'assinatura_' + sit.estado, texto: sit.texto }] };
    } else {
      const doPlano = usos.filter(u => u.assinatura_id === a.id).concat(extras.filter(u => u.assinatura_id === a.id));
      const historico = historicoDoCiclo({ usos: doPlano, estornados, cicloInicio: sit.cicloAtual.inicio, servicoId: item.servicoId });
      r = avaliarUso({ plano, itens: itensPlano.filter(x => x.plano_id === plano.id), profissionaisPermitidos: profsPlano.filter(x => x.plano_id === plano.id).map(x => x.profissional_id),
        uso: { servicoId: item.servicoId, profissionalId: item.profissionalId, data: dia, horario }, historico, precoTabelaCentavos: tabela });
    }
    const aplica = r.situacao === 'coberto' || (r.situacao === 'fora_da_regra' && APLICA.has(r.acao));
    if (aplica && r.exigeAprovacao && !pode(auth, 'assinatura:gerir')) {
      throw createAppError('APROVACAO_NECESSARIA', `Item ${i + 1}: o uso fora da regra deste plano precisa ser liberado pela gestão.`, 403, { itemIndex: i });
    }
    if (aplica) {
      const cobrar = Math.max(0, Math.min(tabela, r.cobrarCentavos));
      Object.assign(item, { precoUnitarioCentavos: cobrar, totalVendaCentavos: cobrar, valorBrutoCentavos: cobrar, lucroBrutoCentavos: cobrar });
      const uso = {
        assinaturaId: a.id, servicoId: item.servicoId, profissionalId: item.profissionalId, precoUnitarioCentavos: cobrar,
        cicloInicio: sit.cicloAtual.inicio, tipo: r.situacao === 'coberto' ? 'coberto' : 'fora_da_regra', consomeUso: Boolean(r.consomeUso),
        valorTabelaCentavos: tabela, valorCobradoCentavos: cobrar, acao: r.acao || null, motivos: r.motivos || [],
        aprovadoPor: r.exigeAprovacao ? actorId : null
      };
      gravar.push(uso);
      extras.push({ id: 'nesta-comanda-' + i, assinatura_id: a.id, ciclo_inicio: uso.cicloInicio, servico_id: uso.servicoId, data: dia, tipo: uso.tipo, consome_uso: uso.consomeUso });
    }
    resultado.push({ itemIndex: i, assinaturaId: a.id, planoNome: plano.nome, aplicada: aplica, situacao: r.situacao, acao: r.acao || null,
      precoTabelaCentavos: tabela, cobrarCentavos: aplica ? Math.min(tabela, r.cobrarCentavos) : tabela, consomeUso: aplica && Boolean(r.consomeUso),
      usoDoCiclo: r.usoDoCiclo || null, motivos: r.motivos || [], aviso: sit.estado === 'atrasada' ? sit.texto : null });
  }
  return { usos: gravar, itens: resultado };
}

module.exports = { aplicarAssinaturas };
