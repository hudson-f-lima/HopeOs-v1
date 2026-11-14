// Gera docs/PERMISSOES.md a partir do catálogo (backend/src/auth/permissoes.js), para a
// matriz documentada nunca divergir da implementada. O permissoes-gate compara os dois.
// Uso: node backend/scripts/gerar-matriz-permissoes.js --escrever
const fs = require('fs');
const path = require('path');
const { PERMISSOES, PACOTES } = require('../src/auth/permissoes');

const ALCANCE = { total: 'Sim', proprio: 'Só o próprio' };
const QUEM = { operacao: 'Proprietário ou gerente', gestao: 'Proprietário ou gerente', administracao: 'Só o proprietário' };
const celula = v => ALCANCE[v] || '—';

function gerarMatriz() {
  const grupos = [...new Set(PERMISSOES.map(p => p.grupo))];
  const linhas = [
    '# Matriz de permissões',
    '',
    '> Gerado de `backend/src/auth/permissoes.js` por `node backend/scripts/gerar-matriz-permissoes.js --escrever`. Não editar à mão: o `permissoes-gate` reprova se este arquivo divergir do código (D-032).',
    '',
    '## Como funciona',
    '- Cada papel tem o **mínimo necessário** abaixo. "Só o próprio" = só os agendamentos, comandas e números do próprio profissional.',
    '- **Permissão individual** só acrescenta: dá a permissão por inteiro a uma pessoa, sem tirar nada do papel dela.',
    '- **Quem concede:** o proprietário e o gerente, só para papéis abaixo do seu e nunca para si; só o que eles mesmos têm por inteiro; permissões de administração, só o proprietário. Revogar segue a mesma regra.',
    '- Cada concessão e revogação fica registrada com quem fez, para quem e quando. Revogada, a permissão deixa de valer na próxima ação (o servidor relê o vínculo a cada pedido).',
    '- O servidor decide tudo; a tela só mostra o que o servidor permite (`/api/auth/me` devolve as permissões efetivas).',
    '- Equipe, convites, papéis e integrações (`/api/admin`) continuam só do proprietário e não são concedíveis.',
    '',
    '## Matriz',
    ''
  ];
  for (const g of grupos) {
    linhas.push(`### ${g}`, '', '| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede |', '|---|---|---|---|---|---|---|');
    for (const p of PERMISSOES.filter(x => x.grupo === g)) {
      linhas.push(`| ${p.rotulo} | \`${p.codigo}\` | ${celula(p.padrao.admin)} | ${celula(p.padrao.gestor)} | ${celula(p.padrao.recepcao)} | ${celula(p.padrao.profissional)} | ${QUEM[p.nivel]} |`);
    }
    linhas.push('');
  }
  linhas.push('## Pacote "Recepção"', '', 'Atalho na tela de Equipe para dar a um profissional tudo o que a recepção tem por padrão e ele não tem por inteiro:', '');
  for (const c of PACOTES.recepcao.permissoes) linhas.push(`- \`${c}\` — ${PERMISSOES.find(p => p.codigo === c).rotulo}`);
  linhas.push('', 'O profissional mantém ganhos, metas e desempenho só dele.', '');
  linhas.push('## Integrações e token legado', '', 'Continuam pela ação ampla de origem de cada permissão (ex.: `agenda:criar` → `agenda:write`), sem mudança nas credenciais existentes.', '');
  return linhas.join('\n');
}

module.exports = { gerarMatriz };

if (require.main === module) {
  const destino = path.join(__dirname, '../../docs/PERMISSOES.md');
  if (process.argv.includes('--escrever')) { fs.writeFileSync(destino, gerarMatriz()); console.log(`escrito: ${destino}`); }
  else process.stdout.write(gerarMatriz());
}
