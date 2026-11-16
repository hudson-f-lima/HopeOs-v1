# Assinatura — Onda A: plano de execução (2026-11-16)

**Estado:** plano; nenhum código. Migration 021 já autorizada (D-038); precisa de linha em `supabase/migrations.lock` e decisão própria. **Merge na `main` aplica a migration em produção.**

**Entradas:** [`ASSINATURAS_DESENHO.md`](ASSINATURAS_DESENHO.md) (§4, uso fora da regra), [`APPBARBER_ASSINATURAS_PACOTES_LEITURA_2026-11-16.md`](APPBARBER_ASSINATURAS_PACOTES_LEITURA_2026-11-16.md), [`ASSINATURAS_PACOTES_BENCHMARK_2026-11-16.md`](ASSINATURAS_PACOTES_BENCHMARK_2026-11-16.md).

## Decisões do dono que valem aqui
1. Uso fora da regra: política configurável por plano (bloquear, cobrar X% e consumir, cobrar X% sem consumir, cobertura total); teto por ciclo; aprovação opcional; padrão de plano novo = bloquear; regra de cada plano **configurável pelo gestor**.
2. Comissão do uso fora da regra: comissão padrão do serviço sobre o valor cobrado, fora do rateio.
3. Cliente avisado antes de confirmar (link do cliente).
4. Estorno: reverte tudo por lançamento contrário; só valor com permissão e motivo; depois do fechamento do ciclo o uso não volta.
5. Tolerância de inadimplência 7 dias, cancelamento no fim do ciclo, usos não acumulam, fornecedor depois (D-038, desenho §11).

## Em aberto (bloqueia só a fase 3)
- **Rateio da comissão do plano** (os 9 planos do AppBarber usam 50% do valor do clube dividido pelos serviços): incluir na Onda A com teste de reconciliação contra as "comissões geradas" do AppBarber? Recomendação: sim, por quantidade de serviços, evoluindo para tempo se a reconciliação apontar.
- Quantos pacotes o salão vende por mês (prioridade dos pacotes).

## Fases (um PR por fase; cada uma com gate SQL e offline, e controle negativo)
| Fase | Entrega | Migration |
|---|---|---|
| **1. Planos e restrições** — **entregue (D-042)** | Plano, itens (desconto %, usos, dias da semana por item), profissionais permitidos (vazio = todos), política de uso fora da regra, tolerância. Telas de gestão. Permissões `planos:editar`, `assinatura:ver`. | 021 (tabelas, RLS que nega tudo ao anon/authenticated, escrita só por função) |
| **2. Assinantes e uso** — **entregue (D-043, PR #37)** | Assinatura (cliente + plano + ciclo), usos imutáveis, estados (pendente, ativa, inadimplente, suspensa, pausada, cancelada), "coberto (2 de 4)" na agenda, cobertura na comanda (item a R$ 0 ou a X%), estorno com devolução de uso. Permissão `assinatura:vender`, `assinatura:gerir`. | mesma 021 ou 022 (a decidir; cada uma exige autorização) |
| **3. Comissão e margem** | Comissão do uso coberto e do uso fora da regra; rateio no fechamento do ciclo (se aprovado); margem por plano. | só se a fase exigir |
| **4. Aviso ao cliente** | Link do cliente mostra o preço e o uso antes de confirmar um dia fora da regra. | não |

## Riscos
- **Dinheiro e comissão:** erro gera reclamação da equipe. Mitigação: ledger imutável, teste de reconciliação, simulador de margem.
- **Comanda é o caminho crítico** (`checkout_close`): a cobertura entra por função própria, sem alterar o fechamento existente além do estritamente necessário, com teste de regressão do caixa.
- **Migração de assinantes do AppBarber** é a Onda D, não esta.

## Critérios de aceite da Onda A
Comanda de assinante gera uso e valor certos; limite e restrição bloqueiam ou cobram conforme a política do plano; estorno devolve uso e valor; comissão do uso coberto e fora da regra confere com o cálculo manual; margem por plano bate; tudo sem cobrança automática.
