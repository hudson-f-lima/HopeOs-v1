require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getSupabase } = require('../src/db/supabaseClient');
const { env } = require('../src/config/env');

const rootDir = path.resolve(__dirname, '../..');
const empresaId = env.DEFAULT_EMPRESA_ID || '00000000-0000-0000-0000-000000000001';

// Função para gerar UUID determinístico a partir de uma string
function deterministicUUID(input) {
  const hash = crypto.createHash('sha256').update(String(input).trim().toLowerCase()).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// Converte valores monetários BRL (ex: "65,00" ou 45) para centavos (inteiro)
function parseBrlToCents(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Math.round(val * 100);
  const clean = String(val)
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

// Converte percentuais (ex: "10.00%" ou 8) para float
function parsePercent(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const clean = String(val).replace('%', '').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

// Converte para inteiro seguro
function parseIntOrZero(val) {
  if (val === undefined || val === null || val === '') return 0;
  const num = parseInt(val, 10);
  return isNaN(num) ? 0 : num;
}

// Remove registros com IDs duplicados
function filterDuplicates(rows) {
  const seen = new Set();
  return rows.filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

async function upsertBatch(supabase, table, rows, conflict = 'id') {
  if (!rows || rows.length === 0) return;
  
  // Realiza o upsert em blocos de 100 registros para evitar sobrecarga da requisição
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: conflict });
    if (error) {
      console.error(`Erro ao fazer upsert na tabela ${table}:`, error.message);
      throw error;
    }
  }
  console.log(`✓ ${table}: ${rows.length} registros inseridos/atualizados.`);
}

async function main() {
  const supabase = getSupabase();
  console.log('Iniciando importação das planilhas XLSX...');
  console.log(`Empresa ID padrão: ${empresaId}`);

  // 1. IMPORTAR CLIENTES
  const fileClientes = path.join(rootDir, 'clientes_05072026062603.xlsx');
  let clientesDb = [];
  let totalClientesPlanilha = 0;
  if (fs.existsSync(fileClientes)) {
    const workbook = XLSX.readFile(fileClientes);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    
    const mapped = rows
      .filter(r => r.Nome && String(r.Nome).trim())
      .map(r => {
        const nome = String(r.Nome).trim();
        return {
          id: deterministicUUID(`cliente-${nome}`),
          empresa_id: empresaId,
          nome,
          whatsapp: r.Celular ? String(r.Celular).trim() : null,
          observacoes: r.Obs ? String(r.Obs).trim() : null,
          faltas: 0,
          ativo: true
        };
      });
    
    totalClientesPlanilha = mapped.length;
    clientesDb = filterDuplicates(mapped);
    await upsertBatch(supabase, 'clientes', clientesDb);
  } else {
    console.warn(`Aviso: Arquivo de clientes não encontrado em ${fileClientes}`);
  }

  // 2. IMPORTAR PRODUTOS
  const fileEstoque = path.join(rootDir, 'AppBarber  Estoque.xlsx');
  let produtosDb = [];
  if (fs.existsSync(fileEstoque)) {
    const workbook = XLSX.readFile(fileEstoque);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const mapped = rows
      .filter(r => r['Descrição'] && String(r['Descrição']).trim())
      .map((r, idx) => {
        const nome = String(r['Descrição']).trim();
        return {
          id: deterministicUUID(`produto-${nome}`),
          empresa_id: empresaId,
          nome,
          sku: r.Marca ? `PROD-${deterministicUUID(nome).slice(0, 8)}` : `PROD-${idx}`,
          categoria: r.Categoria ? String(r.Categoria).trim() : 'Revenda',
          custo_centavos: parseBrlToCents(r['Valor Profissional']),
          preco_venda_centavos: parseBrlToCents(r['Valor (R$ )']),
          estoque_atual: parseIntOrZero(r.Qtde),
          estoque_minimo: 0,
          comissao_pct: parsePercent(r['Comissão']),
          modelo_comissao: 'dividido', // Definido pelo usuário como padrão
          controla_estoque: true,
          ativo: true
        };
      });

    produtosDb = filterDuplicates(mapped);
    await upsertBatch(supabase, 'produtos', produtosDb);
  } else {
    console.warn(`Aviso: Arquivo de estoque não encontrado em ${fileEstoque}`);
  }

  // 3. IMPORTAR PROFISSIONAIS
  const fileProfissionais = path.join(rootDir, 'AppBarber  Profissionais.xlsx');
  let profissionaisDb = [];
  if (fs.existsSync(fileProfissionais)) {
    const workbook = XLSX.readFile(fileProfissionais);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const mapped = rows
      .filter(r => r['Nome Completo'] && String(r['Nome Completo']).trim())
      .map(r => {
        const nome = String(r['Nome Completo']).trim();
        return {
          id: deterministicUUID(`profissional-${nome}`),
          empresa_id: empresaId,
          nome,
          whatsapp: r.Celular ? String(r.Celular).trim() : null,
          modelo_comissao: 'dividido', // Definido pelo usuário como padrão
          horario: '{}',
          overrides: '{}',
          ativo: true
        };
      });

    profissionaisDb = filterDuplicates(mapped);
    await upsertBatch(supabase, 'profissionais', profissionaisDb);
  } else {
    console.warn(`Aviso: Arquivo de profissionais não encontrado em ${fileProfissionais}`);
  }

  // 4. IMPORTAR SERVIÇOS
  const fileServicos = path.join(rootDir, 'AppBarber  Serviços.xlsx');
  let servicosDb = [];
  if (fs.existsSync(fileServicos)) {
    const workbook = XLSX.readFile(fileServicos);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const mapped = rows
      .filter(r => r['Descrição'] && String(r['Descrição']).trim())
      .map(r => {
        const nome = String(r['Descrição']).trim();
        const tempo = parseIntOrZero(r.Tempo) || 30;
        return {
          id: deterministicUUID(`servico-${nome}`),
          empresa_id: empresaId,
          nome,
          categoria: r.Categoria ? String(r.Categoria).trim() : 'Sem categoria',
          valor_centavos: parseBrlToCents(r.Valor),
          duracao_min: tempo,
          slot_min: tempo,
          comissao_pct: parsePercent(r['Comissão']),
          ativo: true
        };
      });

    servicosDb = filterDuplicates(mapped);
    await upsertBatch(supabase, 'servicos', servicosDb);
  } else {
    console.warn(`Aviso: Arquivo de serviços não encontrado em ${fileServicos}`);
  }

  // 5. VÍNCULO DE PROFISSIONAIS E SERVIÇOS (profissional_servicos)
  // Gera o produto cartesiano (todos os profissionais vinculados a todos os serviços) para habilitar o checkout
  if (profissionaisDb.length > 0 && servicosDb.length > 0) {
    console.log('Gerando vínculos profissional_servicos...');
    const links = [];
    for (const prof of profissionaisDb) {
      for (const serv of servicosDb) {
        links.push({
          empresa_id: empresaId,
          profissional_id: prof.id,
          servico_id: serv.id
        });
      }
    }
    await upsertBatch(supabase, 'profissional_servicos', links, 'profissional_id,servico_id');
  }

  console.log('\n======================================');
  console.log('IMPORTAÇÃO CONCLUÍDA COM SUCESSO! 🎉');
  console.log(`Clientes (únicos): ${clientesDb.length} (de ${totalClientesPlanilha} na planilha)`);
  console.log(`Produtos (únicos): ${produtosDb.length}`);
  console.log(`Profissionais (únicos): ${profissionaisDb.length}`);
  console.log(`Serviços (únicos): ${servicosDb.length}`);
  console.log('======================================');
}

main().catch(err => {
  console.error('Erro crítico na importação:', err);
  process.exit(1);
});
