require('dotenv').config();
const { getSupabase } = require('../src/db/supabaseClient');

async function main() {
  const supabase = getSupabase();

  console.log('Iniciando limpeza de dados de teste...');

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
