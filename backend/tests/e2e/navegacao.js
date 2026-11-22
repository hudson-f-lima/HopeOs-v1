// Navegação comum dos E2E (D-061). O menu do app (Agenda, Comandas, Painel, Gestão e a conta no
// avatar) mudou várias vezes e cada mudança quebrava um teste por arquivo. Todo teste que precisa
// chegar a Gestão ou à Conta passa por aqui: quem mexe no menu ajusta este arquivo, não 20.
const GESTAO_ABERTA = '#tab-gestao:not(.hidden)';
const CONTA_ABERTA = '#sheetConta[open]';

// Vai para a aba Gestão e espera ela aparecer.
async function irParaGestao(p) {
  await p.click('#navGestao');
  await p.waitForSelector(GESTAO_ABERTA);
}

// Abre a Conta (avatar) e espera o painel.
async function irParaConta(p) {
  await p.click('#navAvatar');
  await p.waitForSelector(CONTA_ABERTA);
}

// Sai da sessão: abre a Conta se o "Sair" ainda não estiver à vista.
async function sairDaConta(p) {
  if (!(await p.isVisible('#btnLogout'))) await irParaConta(p);
  await p.click('#btnLogout');
}

module.exports = { irParaGestao, irParaConta, sairDaConta, GESTAO_ABERTA, CONTA_ABERTA };
