require('dotenv').config();
const { getSupabase } = require('../src/db/supabaseClient');
const { loadDataContract } = require('../src/services/DataContractService');
const { env } = require('../src/config/env');

async function main() {
  const supabase = getSupabase();
  const data = loadDataContract();
  const empresaId = env.DEFAULT_EMPRESA_ID;

  const empresa = { ...data.empresa, id: empresaId };
  await upsert(supabase, 'empresas', [empresa]);

  await upsert(supabase, 'formas_pagamento', data.formasPagamento.map(x => ({ ...x, empresa_id: empresaId })), 'empresa_id,code');
  await upsert(supabase, 'clientes', data.clientes.map(x => ({ ...x, empresa_id: empresaId })));
  await upsert(supabase, 'servicos', data.servicos.map(x => ({ ...x, empresa_id: empresaId })));
  await upsert(supabase, 'produtos', (data.produtos || []).map(x => ({ ...x, empresa_id: empresaId })));
  await upsert(supabase, 'profissionais', data.profissionais.map(x => ({ ...x, empresa_id: empresaId })));
  await upsert(supabase, 'profissional_servicos', data.profissionalServicos.map(x => ({ ...x, empresa_id: empresaId })), 'profissional_id,servico_id');
  await upsert(supabase, 'agendamentos', data.agendamentos.map(x => ({ ...x, empresa_id: empresaId })));

  console.log('Seed concluído a partir de /data/*.json');
}

async function upsert(supabase, table, rows, conflict = 'id') {
  if (!rows || rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: conflict });
  if (error) throw error;
  console.log(`upsert ${table}: ${rows.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
