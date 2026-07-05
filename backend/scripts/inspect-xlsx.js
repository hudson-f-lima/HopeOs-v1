const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '../..');

const files = [
  'clientes_05072026062603.xlsx',
  'AppBarber  Estoque.xlsx',
  'AppBarber  Profissionais.xlsx',
  'AppBarber  Serviços.xlsx'
];

for (const file of files) {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`);
    continue;
  }

  console.log('\n======================================');
  console.log(`INSPECIONANDO ARQUIVO: ${file}`);
  console.log('======================================');

  try {
    const workbook = XLSX.readFile(filePath);
    console.log(`Planilhas encontradas: ${workbook.SheetNames.join(', ')}`);

    for (const sheetName of workbook.SheetNames) {
      console.log(`\nPlanilha: ${sheetName}`);
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      console.log(`Total de linhas: ${data.length}`);
      if (data.length > 0) {
        console.log('Exemplo das primeiras 2 linhas:');
        console.log(JSON.stringify(data.slice(0, 2), null, 2));
      } else {
        console.log('Planilha vazia.');
      }
    }
  } catch (err) {
    console.error(`Erro ao ler ${file}:`, err.message);
  }
}
