const fs = require('fs');
const path = require('path');
const assert = require('assert');

const initSql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/001_init.sql'), 'utf8').toLowerCase().replace(/\s+/g, ' ');
const rpcSql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/003_lock_rpc_permissions.sql'), 'utf8').toLowerCase().replace(/\s+/g, ' ');

function mustContain(label, source, fragment) {
  assert(source.includes(fragment.toLowerCase()), `${label} ausente`);
  console.log(`✓ ${label}`);
}

mustContain('13.1 tabela produtos nasce na migration 001', initSql, 'create table if not exists produtos');
mustContain('13.2 comando_itens tem tipo servico/produto', initSql, "tipo text not null check (tipo in ('servico','produto'))");
mustContain('13.3 comando_itens referencia produto_id', initSql, 'produto_id uuid null references produtos(id)');
mustContain('13.4 constraint check_item_type existe', initSql, 'constraint check_item_type check');
mustContain('13.5 produto_estoque_movimentos nasce na migration 001', initSql, 'create table if not exists produto_estoque_movimentos');
mustContain('13.6 comandos separa servicos_liquidos_centavos', initSql, 'servicos_liquidos_centavos int not null default 0');
mustContain('13.7 comandos separa produtos_liquidos_centavos', initSql, 'produtos_liquidos_centavos int not null default 0');
mustContain('13.8 comandos separa itens_liquidos_centavos', initSql, 'itens_liquidos_centavos int not null default 0');
mustContain('13.9 RPC mapeia produtos_liquidos_centavos', rpcSql, 'produtos_liquidos_centavos');
mustContain('13.10 RPC mapeia itens_liquidos_centavos', rpcSql, 'itens_liquidos_centavos');
mustContain('13.11 RPC atualiza estoque na mesma transação', rpcSql, 'update produtos set estoque_atual = v_saldo_posterior');
mustContain('13.12 RPC grava movimento de estoque', rpcSql, 'insert into produto_estoque_movimentos');

console.log('\nSchema Polymorphic Gate: 12/12 checks verdes.');
