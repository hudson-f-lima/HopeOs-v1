require('dotenv').config();
const { getSupabase } = require('../src/db/supabaseClient');

const args = process.argv.slice(2);
const hasForceFlag = args.includes('--force') || args.includes('-f');

async function main() {
  if (!hasForceFlag) {
    console.error('⚠️  Este script apaga TODOS os dados financeiros (comandas, pagamentos, etc.) do banco de produção.');
    console.error('   Nenhum dado será recuperável após execução.');
    console.error('');
    console.error('   Execute com a flag --force para confirmar:');
    console.error('   node scripts/clear-test-data.js --force');
    process.exit(1);
  }

  const supabase = getSupabase();

  console.log('⚠️  Iniciando limpeza de dados de teste (operação irreversível)...');

  // As tabelas dependentes devem ser limpas antes por causa de chaves estrangeiras
  const tablesToClear = [
    'comando_itens',
    'comando_pagamentos',
    'comando_gorjetas',
    'caixa_movimentos',
    'produto_estoque_movimentos',
    'comandos',
    'agendamento_eventos',
    'agendamentos'
  ];

  for (const table of tablesToClear) {
    console.log(`Limpando tabela: ${table}...`);
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Deleta tudo de forma segura
    if (error) {
      console.error(`Erro ao limpar ${table}:`, error.message);
      throw error;
    }
  }

  console.log('Limpeza concluída com sucesso!');
}

main().catch(err => {
  console.error('Erro na execução do script:', err);
  process.exit(1);
});
