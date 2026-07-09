# PLANO TÉCNICO DE APROFUNDAMENTO DE CADASTROS (V1.5)
**Status:** DRAFT ONLY / NÃO EXECUTÁVEL (Zero Migration V1.4 em vigor)
**Objetivo:** Evoluir a arquitetura do banco e as APIs para suportar cadastros profundos e relacionamentos ricos, alinhado à visão do KortexOS 5.1.

---

## 1. Clientes
**Problema atual:** Schema raso (`nome`, `telefone`).
**Evolução (V1.5 / KortexOS 5.1):**
- Adição de campos de contato e perfil (`email`, `data_nascimento`, `cpf`, `genero`).
- Adição de campos de endereço estruturado (opcional).
- Metadados de negócio (ex: `aceita_marketing`, `notas_internas`).
- Relacionamento: Histórico consolidado derivado apenas do Ledger, mas cache/materialized views podem ser explorados no futuro.

## 2. Profissionais
**Problema atual:** Schema raso (`nome`, `telefone`).
**Evolução (V1.5 / KortexOS 5.1):**
- Perfil rico: `avatar_url`, `cor_hex` (para a agenda), `email`.
- Controle de agenda: `permite_agendamento_online`, `intervalo_padrao`, limites de horário e escalas de trabalho em tabela dedicada (`profissional_horarios`).
- **Overrides:** Migrar da atual coluna JSONB para um modelo relacional (ver seção Overrides).

## 3. Serviços
**Problema atual:** Descrição básica, comissão e preço.
**Evolução (V1.5 / KortexOS 5.1):**
- Organização: `categoria_id` (nova tabela `servico_categorias`).
- Vitrine: `descricao_rica`, `imagem_url`, `tags`.
- Operacional: `tempo_setup`, `tempo_limpeza` (além da duração base).

## 4. Produtos
**Problema atual:** Modelagem já é a mais madura (`sku`, `codigo_barras`, controle de margem via catálogo).
**Evolução (V1.5 / KortexOS 5.1):**
- Manter a evolução atual como padrão ouro de validação.
- Expandir metadados visuais (imagem) e categorização (`categoria_produto_id`).
- Lote e validade (se aplicável ao negócio).

## 5. Matriz Serviço × Profissional (Pivot Rico)
**Problema atual:** Tabela `profissional_servicos` funciona apenas como chave de relacionamento (M:N).
**Evolução (V1.5 / KortexOS 5.1):**
- A tabela `profissional_servicos` deve virar o centro operacional, concentrando a especialização de cada profissional.
- Estrutura:
  - `profissional_id` (FK)
  - `servico_id` (FK)
  - `ativo` (boolean, default true)
  - `criado_em`, `atualizado_em`

## 6. Overrides (Fim do JSONB)
**Problema atual:** Overrides de preço, tempo e comissão vivem em uma coluna `overrides` (JSONB) dentro de `profissionais`. Difícil consulta, quebra integridade relacional.
**Evolução (V1.5 / KortexOS 5.1):**
- Migrar os dados do JSONB para colunas nativas no pivot rico (`profissional_servicos`):
  - `preco_override_centavos` (bigint, nullable)
  - `comissao_pct_override` (numeric, nullable)
  - `duracao_minutos_override` (integer, nullable)
- A RPC de checkout deverá buscar as condições operacionais a partir dessa tabela relacional e não mais desempacotando JSONB.

## 7. Estoque e Auditoria
**Problema atual:** Ajuste de estoque via RPC funciona, mas perde o rastro de *quem* ajustou (falta actor) e não protege contra retentativas (falta idempotência no POST de ajuste manual).
**Evolução (V1.5 / KortexOS 5.1):**
- Atualizar a RPC de `ajuste_estoque` para exigir:
  - `actor_id` (quem realizou a alteração).
  - `idempotency_key` (garantir que um double-tap ou retry de rede não debite duas vezes).
  - `motivo_ajuste` (ENUM: `entrada_compra`, `quebra`, `vencimento`, `balanco`, etc).
- Tabela `produto_estoque_movimentos` já prevê campos textuais, devendo evoluir para schema validado de motivo e autor.

---

## Próximos Passos (Gate de Execução)
*Nenhuma das alterações acima pode ser executada sem autorização explícita do Owner.*
1. Revisar e aprovar modelo relacional.
2. Escrever draft da Migration (`007_kortex_deep_entities.sql`).
3. Atualizar Data Models no Node e rotas afetadas (`/api/profissionais`, `/api/servicos`).
4. Re-validar a UI de frontend com a nova estrutura e novos campos de contato/descrição.
