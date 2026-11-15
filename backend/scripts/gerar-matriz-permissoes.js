// Gera docs/PERMISSOES.md a partir do catálogo (backend/src/auth/permissoes.js), para a
// matriz documentada nunca divergir da implementada. O permissoes-gate compara os dois.
// Uso: node backend/scripts/gerar-matriz-permissoes.js --escrever
const fs = require('fs');
const path = require('path');
const { PERMISSOES } = require('../src/auth/permissoes');

const ALCANCE = { total: 'Sim', proprio: 'Só o próprio' };
const QUEM = { operacao: 'Proprietário ou gerente', sensivel: 'Só o proprietário (sensível)', administracao: 'Só o proprietário' };
const aoProfissional = p => (p.segue ? `Segue \`${p.segue}\`` : p.profissional ? 'Sim' : 'Não');
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
    '- **Quem concede:** o proprietário e o gerente, só para papéis abaixo do seu e nunca para si, e só o que eles mesmos têm por inteiro. Permissões **sensíveis** (dinheiro ou dado pessoal de colega ou de cliente) e de **administração**, só o proprietário. Revogar segue a mesma regra.',
    '- **Profissional:** só recebe o que não mexe em valores financeiros críticos — a **agenda de todos** e **fechar comanda de qualquer profissional**. Caixa, estorno, comissão, preços, estoque, painel financeiro, contato de clientes e números de colegas nunca são concedidos ao profissional.',
    '- **Agenda:** as ações (agendar, encaixar, remarcar, atender, cancelar) seguem a visão da agenda: com a agenda própria valem só nos próprios horários; com a agenda de todos, para qualquer profissional. Não se concedem sozinhas.',
    '- **Clientes:** todos veem o nome e cadastram cliente novo; WhatsApp e observações só quem tem `clientes:contato`. Lembretes por WhatsApp só com `agenda:lembretes`; o profissional vê os próprios horários a confirmar, sem contato.',
    '- **Mudar o papel ou desativar** a pessoa tira as permissões individuais, com registro na trilha.',
    '- Cada concessão e revogação fica registrada com quem fez, para quem e quando. Revogada, a permissão deixa de valer na próxima ação (o servidor relê o vínculo a cada pedido).',
    '- O servidor decide tudo; a tela só mostra o que o servidor permite (`/api/me` devolve as permissões efetivas).',
    '- Equipe, convites, papéis e integrações (`/api/admin`) continuam só do proprietário e não são concedíveis.',
    '',
    '## Matriz',
    ''
  ];
  for (const g of grupos) {
    linhas.push(`### ${g}`, '', '| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede | Concedível ao profissional |', '|---|---|---|---|---|---|---|---|');
    for (const p of PERMISSOES.filter(x => x.grupo === g)) {
      linhas.push(`| ${p.rotulo} | \`${p.codigo}\` | ${celula(p.padrao.admin)} | ${celula(p.padrao.gestor)} | ${celula(p.padrao.recepcao)} | ${celula(p.padrao.profissional)} | ${QUEM[p.nivel]} | ${aoProfissional(p)} |`);
    }
    linhas.push('');
  }
  linhas.push('## O que o profissional pode receber', '');
  for (const p of PERMISSOES.filter(x => x.profissional)) linhas.push(`- \`${p.codigo}\` — ${p.rotuloProfissional || p.rotulo}`);
  linhas.push('', 'Ganhos, metas e desempenho continuam só dele. Para cobrir o caixa, a pessoa precisa do papel Recepção.', '');
  linhas.push('## Integrações e token legado', '', 'Continuam pela ação ampla de origem de cada permissão (ex.: `agenda:criar` → `agenda:write`), sem mudança nas credenciais existentes.', '');
  return linhas.join('\n');
}

module.exports = { gerarMatriz };

if (require.main === module) {
  const destino = path.join(__dirname, '../../docs/PERMISSOES.md');
  if (process.argv.includes('--escrever')) { fs.writeFileSync(destino, gerarMatriz()); console.log(`escrito: ${destino}`); }
  else process.stdout.write(gerarMatriz());
}
