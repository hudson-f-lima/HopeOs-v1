// E2E manual (Playwright/Chromium) do assistente de configuração.
// Requer: DEV_EMPRESA_VAZIA=1 node backend/scripts/dev-memory-api.js  +  PWA em :5599.
// Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/onboarding.e2e.js
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
const API = 'http://127.0.0.1:3399';
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const shot = name => require('path').join(require('os').tmpdir(), `hopeos-onb-${name}.png`);

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text()); });
  const fase = async () => (await p.textContent('#onbTitulo')).trim();
  const proximo = async () => { await p.click('#btnOnbProximo'); await p.waitForTimeout(700); };

  await p.goto(BASE);
  await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'admin@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#onboardingScreen:not(.hidden)', { timeout: 15000 });
  console.log('ABRIU EM:', await fase());

  // Fase 1 — validação e dados
  await p.fill('#onbNome', 'Barbearia Teste'); await proximo();
  console.log('SEM TELEFONE:', await p.textContent('#onbErro'));
  await p.fill('#onbWhats', '11988887777');
  await p.fill('#onbCnpj', '11.222.333/0001-82'); await proximo();
  console.log('CNPJ ERRADO:', await p.textContent('#onbErro'));
  await p.fill('#onbCnpj', '11.222.333/0001-81'); await p.check('#onbParceiro'); await proximo();
  console.log('FASE:', await fase());
  // Fase 2 — horários padrão + grade 15 + almoço
  await p.selectOption('#onbSlot', '15'); await p.selectOption('#onbBuffer', '10'); await p.check('#onbAlmoco'); await proximo();
  console.log('FASE:', await fase());
  // Fase 3 — formas padrão, ajusta taxa do crédito
  await p.fill('[data-code="credito"] [data-campo="taxa"]', '3.5');
  console.log('CARGOS OFERECIDOS:', await p.locator('[data-cargo]').count());
  await proximo();
  console.log('FASE:', await fase());
  // Fase 4 — cardápio de barbearia
  await p.screenshot({ path: shot('catalogo') });
  await proximo();
  console.log('FASE:', await fase());
  // Fase 5 — avançar sem equipe é bloqueado; cadastra Robson com exceção no corte
  await proximo();
  console.log('SEM EQUIPE:', await p.textContent('#onbErro'));
  await p.fill('#onbProfNome', 'Robson'); await p.fill('#onbProfWhats', '11977776666');
  await p.selectOption('#onbProfCargo', { label: 'Barbeiro (50%)' });
  console.log('MODELO PELO CARGO:', await p.inputValue('#onbProfModelo'));
  const corte = p.locator('[data-servico]', { hasText: 'Corte masculino' }).first();
  await corte.locator('summary').click();
  await corte.locator('[data-campo="valor"]').fill('70');
  await corte.locator('[data-campo="duracao"]').fill('45');
  await p.click('#onbProfForm button[type=submit]'); await p.waitForTimeout(1200);
  console.log('EQUIPE:', (await p.locator('.onb-equipe b').allTextContents()).join(', '), '| link WhatsApp:', await p.locator('.onb-equipe a').count());
  await proximo();
  console.log('FASE:', await fase());
  // Fase 6 — simulação
  await p.selectOption('#onbSimServ', { label: 'Corte masculino' }); await p.selectOption('#onbSimForma', 'credito'); await p.waitForTimeout(1000);
  console.log('SIMULAÇÃO:', (await p.textContent('#onbSimResultado')).replace(/\s+/g, ' ').trim());
  await p.screenshot({ path: shot('simulacao') });
  const comandosAntes = (await db('comandos')).length;
  await proximo();
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 });
  console.log('APP ABERTO:', await p.isVisible('#appRoot'), '| assistente fechado:', !(await p.isVisible('#onboardingScreen')));

  const empresa = (await db('empresas'))[0];
  const robson = (await db('profissionais')).find(x => x.nome === 'Robson');
  const servicos = await db('servicos');
  const corteId = servicos.find(s => s.nome === 'Corte masculino').id;
  console.log('BANCO:', JSON.stringify({
    empresa: [empresa.nome, empresa.whatsapp, empresa.slot_padrao, empresa.intervalo_almoco, empresa.cnpj, empresa.salao_parceiro, empresa.buffer_min],
    cargos: (await db('cargos')).map(c => `${c.nome}:${c.comissao_pct}:${c.modelo_comissao}`),
    robsonCargo: ((await db('cargos')).find(c => c.id === robson.cargo_id) || {}).nome,
    corteHeranca: servicos.find(s => s.nome === 'Corte masculino').modelo_heranca,
    categorias: (await db('servico_categorias')).map(c => c.nome),
    diasAbertos: Object.values(empresa.horario_por_dia).filter(d => d.ativo).length,
    formas: (await db('formas_pagamento')).map(f => `${f.code}:${f.taxa_pct}`),
    servicos: servicos.length,
    robsonCorte: robson.overrides[corteId],
    comandosGravados: (await db('comandos')).length - comandosAntes
  }));
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1; // erro de console/página reprova o E2E (CI)
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
