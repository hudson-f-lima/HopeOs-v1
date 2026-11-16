// Lembretes Push Gate (C5, D-041, migration 020). Parte pura (janelas, elegibilidade, mensagem,
// endereços permitidos), serviço de envio com o web-push trocado por um espião, canais
// WhatsApp/SMS desligados e as rotas do cliente (HTTP real, banco em memória).
// "Agora" nas rotas: 2026-11-10 09:00 em São Paulo. O horário de teste é 2026-11-11 11:00 local
// (14:00Z): d1 abre em 2026-11-10T14:00Z e fecha em 2026-11-11T02:00Z; h2 vai de 12:00Z a 13:30Z.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-push-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const Module = require('module');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
const { criarAcesso, hashToken } = require('../src/services/AcessoAgendamento');
const L = require('../src/notifications/lembretes');
const { criarCanais, registrarProvedor, limparProvedores } = require('../src/notifications/canais');
const { executar } = require('../src/notifications/ServicoLembretes');
const publico = require('../src/routes/publicBooking');
const { app } = require('../src/app');

const AGORA = new Date('2026-11-10T12:00:00Z');
const A = env.DEFAULT_EMPRESA_ID;
const B = 'e0000000-0000-4000-8000-0000000000bb';
const CORTE = 'b0000000-0000-4000-8000-0000000000a1';
const ANA = 'a0000000-0000-4000-8000-0000000000a1';
const CLI = 'd0000000-0000-4000-8000-0000000000a1';
const dia = { ativo: true, inicio: '09:00', fim: '18:00' };
const semana = { dom: dia, seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: dia };
const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';
const assinatura = (endpoint = FCM) => ({ endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } });

const db = installMemoryBackend({
  empresas: [
    { id: A, nome: 'Salão Alfa', whatsapp: '11911112222', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0, online_slug: 'salao-alfa', online_ativo: true, lembretes_push_ativo: true, razao_social: 'Alfa', privacidade_contato: 'a@a.test' },
    { id: B, nome: 'Salão Beta', horario_por_dia: semana, slot_padrao: 30 }
  ],
  servicos: [{ id: CORTE, empresa_id: A, nome: 'Corte', valor_centavos: 5000, duracao_min: 30, ativo: true }],
  profissionais: [{ id: ANA, empresa_id: A, nome: 'Ana', ativo: true, horario: semana, overrides: {} }],
  profissional_servicos: [{ empresa_id: A, profissional_id: ANA, servico_id: CORTE }],
  clientes: [{ id: CLI, empresa_id: A, nome: 'Cliente Segredo', whatsapp: '11977776666', ativo: true }],
  agendamentos: [], agendamento_acessos: [], agendamento_push: [], agendamento_lembretes: [], agendamento_eventos: []
});
clock.definirRelogio(() => AGORA);
publico.setRelogioParaTestes(() => AGORA);
Object.assign(env, { VAPID_PUBLIC_KEY: 'BPUBLICA'.padEnd(87, 'x'), VAPID_PRIVATE_KEY: 'privada-de-teste', VAPID_SUBJECT: 'mailto:teste@example.test', PUBLIC_BOOKING_LINKS: '',
  PUBLIC_BOOKING_RATE_LINK_MAX: 1000, PUBLIC_BOOKING_RATE_GET_MAX: 1000, PUBLIC_BOOKING_RATE_POST_IP_MAX: 1000 });

// Espião no lugar do web-push.
const enviados = [];
let comportamento = () => null; // (endpoint) => null (ok) | { statusCode } (falha)
const webpushFalso = {
  async sendNotification(sub, payload, opts) {
    const falha = comportamento(sub.endpoint);
    if (falha) { const e = new Error('push falhou'); Object.assign(e, falha); throw e; }
    enviados.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), opts });
  }
};
const canais = () => criarCanais({ env, webpush: webpushFalso });
const hhmm = '11:00';
let seq = 0;
async function horario({ data = '2026-11-11', hora = hhmm, status = 'agendado' } = {}) {
  seq += 1;
  const repo = new SupabaseRepository(A);
  const ag = await repo.insert('agendamentos', { id: `90000000-0000-4000-8000-0000000002${String(seq).padStart(2, '0')}`, cliente_id: CLI, servico_id: CORTE, profissional_id: ANA, data, horario: `${hora}:00`, duracao_min: 30, valor_centavos: 5000, status });
  const token = await criarAcesso(repo, ag, { timeZone: env.APP_TIMEZONE, agora: AGORA });
  const acesso = db.agendamento_acessos.find(a => a.token_hash === hashToken(token));
  return { ag, token, acesso };
}
async function assinar(acesso, { criadaEm = '2026-11-10T12:00:00.000Z', endpoint = FCM } = {}) {
  const hash = require('crypto').createHash('sha256').update(endpoint).digest('hex');
  return new SupabaseRepository(A).insert('agendamento_push', { acesso_id: acesso.id, endpoint_hash: hash, assinatura: assinatura(endpoint), falhas: 0, created_at: criadaEm, updated_at: criadaEm });
}
const rodar = (iso, extra = {}) => executar({ canais: extra.canais || canais(), env, agora: new Date(iso), ...extra });
const zerar = () => { enviados.length = 0; comportamento = () => null; db.agendamento_push.length = 0; db.agendamento_lembretes.length = 0; db.agendamentos.length = 0; db.agendamento_acessos.length = 0; db.empresas[0].lembretes_push_ativo = true; };

let base;
function request(method, urlPath, { body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = payload !== null ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {};
    const req = http.request(base + urlPath, { method, headers }, res => {
      let txt = ''; res.on('data', c => { txt += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(txt); } catch (_) {} resolve({ status: res.statusCode, data, raw: txt }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const push = (token, extra) => request('POST', '/api/public/meu-agendamento/push', { body: { token, ...extra } });

const tests = [];
const test = (n, f) => tests.push({ n, f });
const INICIO = Date.parse('2026-11-11T14:00:00Z');

test('L01 janelas: d1 de 24 h a 12 h antes; h2 de 2 h a 30 min antes; fora delas nada', () => {
  const na = iso => L.tiposNaJanela(Date.parse(iso), INICIO);
  assert.deepStrictEqual(na('2026-11-10T13:59:59Z'), [], 'antes da janela do d1');
  assert.deepStrictEqual(na('2026-11-10T14:00:00Z'), ['d1']);
  assert.deepStrictEqual(na('2026-11-11T01:59:59Z'), ['d1']);
  assert.deepStrictEqual(na('2026-11-11T02:00:00Z'), [], 'entre as janelas');
  assert.deepStrictEqual(na('2026-11-11T12:00:00Z'), ['h2']);
  assert.deepStrictEqual(na('2026-11-11T13:29:59Z'), ['h2']);
  assert.deepStrictEqual(na('2026-11-11T13:30:00Z'), [], 'faltando 30 min não avisa mais');
  assert.deepStrictEqual(na('2026-11-11T14:00:01Z'), [], 'depois do horário');
});

test('L02 elegibilidade: só recebe quem ligou o push antes de a janela abrir', () => {
  assert.strictEqual(L.assinaturaValeParaTipo(Date.parse('2026-11-10T13:59:00Z'), INICIO, 'd1'), true);
  assert.strictEqual(L.assinaturaValeParaTipo(Date.parse('2026-11-10T14:00:00Z'), INICIO, 'd1'), false, 'ligou quando a janela abriu');
  assert.strictEqual(L.assinaturaValeParaTipo(Date.parse('2026-11-11T11:00:00Z'), INICIO, 'h2'), true);
  assert.strictEqual(L.assinaturaValeParaTipo(Date.parse('2026-11-11T12:30:00Z'), INICIO, 'h2'), false);
});

test('L03 mensagem: serviço, salão, dia e hora; sem preço nem nome do cliente', () => {
  const d1 = L.montarMensagem({ tipo: 'd1', salaoNome: 'Salão Alfa', servicoNome: 'Corte', data: '2026-11-11', horario: '11:00:00' });
  assert.deepStrictEqual([d1.titulo, d1.corpo], ['Lembrete do seu horário', 'Corte em Salão Alfa, 11/11 às 11:00.']);
  const h2 = L.montarMensagem({ tipo: 'h2', salaoNome: 'Salão Alfa', servicoNome: 'Corte', data: '2026-11-11', horario: '11:00' });
  assert.strictEqual(h2.corpo, 'Corte em Salão Alfa, hoje às 11:00.');
  assert.ok(!/R\$|\d{2,},\d{2}|Segredo/.test(d1.corpo + h2.corpo));
});

test('L04 SSRF: só servidores de push conhecidos, em https, sem credenciais nem porta estranha', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://wns2-par02p.notify.windows.com/w/?token=x', 'https://x.push.apple.com/3/device/y']) assert.strictEqual(L.endpointPermitido(ok), true, ok);
  for (const ruim of ['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest/meta-data', 'https://localhost/x', 'https://fcm.googleapis.com.evil.example/x', 'https://evil.example/fcm.googleapis.com',
    'https://user:senha@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://notify.windows.com/x', 'https://[::1]/x', 'file:///etc/passwd', '', null, 42, `https://fcm.googleapis.com/${'a'.repeat(700)}`]) {
    assert.strictEqual(L.endpointPermitido(ruim), false, String(ruim).slice(0, 60));
  }
  assert.deepStrictEqual(L.validarAssinatura({ ...assinatura(), extra: 'x', expirationTime: null }), assinatura(), 'só os campos que importam');
  assert.strictEqual(L.validarAssinatura({ endpoint: FCM, keys: { p256dh: 'com espaço', auth: 'a' } }), null);
  assert.strictEqual(L.validarAssinatura({ endpoint: 'https://evil.example/x', keys: assinatura().keys }), null);
});

test('L05 serviço: envia o d1 na janela, uma vez; o h2 em outra janela; nada fora delas', async () => {
  zerar();
  const { acesso } = await horario();
  await assinar(acesso);
  assert.strictEqual((await rodar('2026-11-10T13:00:00Z')).enviados, 0, 'antes da janela');
  const r1 = await rodar('2026-11-10T20:00:00Z');
  assert.strictEqual(r1.enviados, 1, JSON.stringify(r1));
  assert.deepStrictEqual([enviados[0].payload.titulo, enviados[0].payload.corpo, enviados[0].payload.url], ['Lembrete do seu horário', 'Corte em Salão Alfa, 11/11 às 11:00.', './meu-horario.html']);
  assert.ok(enviados[0].opts.vapidDetails.subject.startsWith('mailto:') && enviados[0].opts.TTL === 3600);
  assert.strictEqual((await rodar('2026-11-10T21:00:00Z')).enviados, 0, 'segunda rodada: já enviado');
  assert.deepStrictEqual(db.agendamento_lembretes.map(l => [l.tipo, l.canal, l.situacao]), [['d1', 'push', 'enviado']]);
  assert.strictEqual((await rodar('2026-11-11T05:00:00Z')).enviados, 0, 'entre as janelas');
  assert.strictEqual((await rodar('2026-11-11T12:10:00Z')).enviados, 1, 'h2');
  assert.strictEqual(enviados[1].payload.titulo, 'Seu horário é daqui a pouco');
  assert.strictEqual((await rodar('2026-11-11T13:40:00Z')).enviados, 0, 'depois da janela do h2');
  assert.strictEqual(enviados.length, 2);
});

test('L06 assinatura criada depois de a janela abrir não recebe aquele lembrete (e nada é reservado)', async () => {
  zerar();
  const { acesso } = await horario();
  await assinar(acesso, { criadaEm: '2026-11-10T16:00:00.000Z' }); // d1 abriu às 14:00Z
  const r = await rodar('2026-11-10T20:00:00Z');
  assert.deepStrictEqual([r.enviados, db.agendamento_lembretes.length], [0, 0]);
  assert.strictEqual((await rodar('2026-11-11T12:10:00Z')).enviados, 1, 'mas recebe o h2');
});

test('L07 horário cancelado, concluído ou já passado não recebe; salão com lembretes desligados também', async () => {
  zerar();
  const { acesso, ag } = await horario();
  await assinar(acesso);
  db.agendamentos.find(a => a.id === ag.id).status = 'cancelado';
  assert.strictEqual((await rodar('2026-11-10T20:00:00Z')).enviados, 0);
  db.agendamentos.find(a => a.id === ag.id).status = 'agendado';
  db.empresas[0].lembretes_push_ativo = false;
  assert.strictEqual((await rodar('2026-11-10T20:00:00Z')).enviados, 0, 'salão desligou');
  db.empresas[0].lembretes_push_ativo = true;
  assert.strictEqual((await rodar('2026-11-11T15:00:00Z')).enviados, 0, 'passou do horário');
  assert.strictEqual(db.agendamento_lembretes.length, 0);
});

test('L08 push desligado (sem chaves VAPID): nada é enviado e a rodada diz que está desligada', async () => {
  zerar();
  const { acesso } = await horario();
  await assinar(acesso);
  const antes = { ...env };
  env.VAPID_PRIVATE_KEY = '';
  try {
    const r = await rodar('2026-11-10T20:00:00Z');
    assert.deepStrictEqual([r.desligado, enviados.length, db.agendamento_lembretes.length], [true, 0, 0]);
  } finally { Object.assign(env, { VAPID_PRIVATE_KEY: antes.VAPID_PRIVATE_KEY }); }
});

test('L09 assinatura morta (410) é revogada; falha de rede conta falha e mantém; ninguém recebe duas vezes', async () => {
  zerar();
  const { acesso } = await horario();
  const morta = await assinar(acesso, { endpoint: 'https://fcm.googleapis.com/fcm/send/morta' });
  const viva = await assinar(acesso, { endpoint: 'https://fcm.googleapis.com/fcm/send/viva' });
  comportamento = e => (e.endsWith('/morta') ? { statusCode: 410 } : null);
  const r = await rodar('2026-11-10T20:00:00Z');
  assert.deepStrictEqual([r.enviados, r.revogadas], [1, 1]);
  assert.ok(db.agendamento_push.find(p => p.id === morta.id).revogado_em, 'morta revogada');
  assert.ok(!db.agendamento_push.find(p => p.id === viva.id).revogado_em);
  assert.strictEqual(db.agendamento_lembretes[0].situacao, 'enviado');
  // Tudo falhando por rede: marca "falhou", conta a falha e NÃO tenta de novo na mesma janela.
  zerar();
  const { acesso: a2 } = await horario({ hora: '12:00' });
  const s2 = await assinar(a2);
  comportamento = () => ({ message: 'rede' });
  const r2 = await rodar('2026-11-10T21:00:00Z');
  assert.deepStrictEqual([r2.enviados, r2.falhas], [0, 1]);
  assert.deepStrictEqual([db.agendamento_lembretes[0].situacao, db.agendamento_lembretes[0].detalhe], ['falhou', 'rede']);
  assert.strictEqual(db.agendamento_push.find(p => p.id === s2.id).falhas, 1);
  assert.ok(!db.agendamento_push.find(p => p.id === s2.id).revogado_em);
  comportamento = () => null;
  assert.strictEqual((await rodar('2026-11-10T21:30:00Z')).enviados, 0, 'sem reenvio automático (melhor perder que duplicar)');
});

test('L10 duas rodadas ao mesmo tempo (duas instâncias): um único envio', async () => {
  zerar();
  const { acesso } = await horario();
  await assinar(acesso);
  const [r1, r2] = await Promise.all([rodar('2026-11-10T20:00:00Z'), rodar('2026-11-10T20:00:00Z')]);
  assert.strictEqual(r1.enviados + r2.enviados, 1);
  assert.strictEqual(enviados.length, 1);
  assert.strictEqual(db.agendamento_lembretes.length, 1);
});

test('L11 WhatsApp e SMS: pré-configurados e DESLIGADOS; mesmo com provedor e ENABLED, a trava do cliente segue fechada e nada sai', async () => {
  zerar();
  limparProvedores();
  const c = canais();
  assert.deepStrictEqual([c.whatsapp.ativo(), c.sms.ativo(), c.whatsapp.podeContatar(), c.sms.podeContatar()], [false, false, false, false]);
  assert.deepStrictEqual(await c.whatsapp.enviar({ telefone: '5511977776666', mensagem: { titulo: 'x', corpo: 'y' } }), { ok: false, motivo: 'desligado' });
  const chamadas = [];
  registrarProvedor('whatsapp', { async enviar(x) { chamadas.push(x); } });
  env.WHATSAPP_ENABLED = 'true';
  try {
    const c2 = canais();
    assert.strictEqual(c2.whatsapp.ativo(), true, 'provedor + ENABLED abrem a 1ª trava');
    assert.strictEqual(c2.whatsapp.podeContatar({ whatsapp: '5511977776666' }), false, 'a 2ª trava (opt-out do cliente) continua fechada');
    // O serviço de lembretes só usa o push: o provedor nunca é chamado.
    const { acesso } = await horario();
    await assinar(acesso);
    await rodar('2026-11-10T20:00:00Z', { canais: c2 });
    assert.strictEqual(chamadas.length, 0);
    assert.ok(db.agendamento_lembretes.every(l => l.canal === 'push'));
  } finally { env.WHATSAPP_ENABLED = ''; limparProvedores(); }
});

// --- Rotas do cliente ---------------------------------------------------------
test('L12 rota: o link mostra se o push está disponível e a chave pública; assinar grava só os campos permitidos', async () => {
  zerar();
  const { token, acesso, ag } = await horario();
  const v = await request('POST', '/api/public/meu-agendamento', { body: { token } });
  assert.deepStrictEqual([v.data.data.push.disponivel, v.data.data.push.chavePublica], [true, env.VAPID_PUBLIC_KEY]);
  assert.ok(!v.raw.includes('privada-de-teste'), 'a chave privada nunca sai');
  const r = await push(token, { acao: 'assinar', assinatura: { ...assinatura(), extra: 'x' } });
  assert.strictEqual(r.status, 200, r.raw);
  assert.strictEqual(db.agendamento_push.length, 1);
  const linha = db.agendamento_push[0];
  assert.deepStrictEqual([linha.acesso_id, linha.created_at, Object.keys(linha.assinatura).sort()], [acesso.id, AGORA.toISOString(), ['endpoint', 'keys']]);
  assert.strictEqual((await push(token, { acao: 'assinar', assinatura: assinatura() })).status, 200, 'repetir é idempotente');
  assert.strictEqual(db.agendamento_push.length, 1);
  // Salão desliga: indisponível e recusa.
  db.empresas[0].lembretes_push_ativo = false;
  assert.strictEqual((await request('POST', '/api/public/meu-agendamento', { body: { token } })).data.data.push.disponivel, false);
  assert.strictEqual(code(await push(token, { acao: 'assinar', assinatura: assinatura('https://fcm.googleapis.com/fcm/send/outro') })), 'PUSH_INDISPONIVEL');
  db.empresas[0].lembretes_push_ativo = true;
  // Horário cancelado: indisponível.
  db.agendamentos.find(a => a.id === ag.id).status = 'cancelado';
  assert.strictEqual((await request('POST', '/api/public/meu-agendamento', { body: { token } })).data.data.push.disponivel, false);
});

test('L13 rota, segurança: endereço fora da lista, código inválido, campo extra e ação desconhecida são recusados; nada gravado', async () => {
  zerar();
  const { token } = await horario();
  for (const ruim of ['http://fcm.googleapis.com/x', 'https://169.254.169.254/x', 'https://evil.example/x', 'https://fcm.googleapis.com@evil.example/x']) {
    assert.strictEqual((await push(token, { acao: 'assinar', assinatura: assinatura(ruim) })).status, 422, ruim);
  }
  assert.strictEqual(code(await push(token, { acao: 'assinar', assinatura: { endpoint: FCM } })), 'DADOS_INVALIDOS');
  assert.strictEqual(code(await push(token, { acao: 'assinar', assinatura: assinatura(), empresaId: B })), 'DADOS_INVALIDOS');
  assert.strictEqual(code(await push(token, { acao: 'apagar' })), 'DADOS_INVALIDOS');
  assert.strictEqual(code(await push('x'.repeat(43), { acao: 'assinar', assinatura: assinatura() })), 'LINK_INVALIDO');
  assert.strictEqual(db.agendamento_push.length, 0);
});

test('L14 rota: no máximo 5 aparelhos por link; cancelar revoga só o aparelho do link; o mesmo aparelho em outro link troca de dono', async () => {
  zerar();
  const um = await horario();
  for (let i = 0; i < 5; i++) assert.strictEqual((await push(um.token, { acao: 'assinar', assinatura: assinatura(`https://fcm.googleapis.com/fcm/send/ap${i}`) })).status, 200);
  assert.strictEqual(code(await push(um.token, { acao: 'assinar', assinatura: assinatura('https://fcm.googleapis.com/fcm/send/ap9') })), 'LIMITE_APARELHOS');
  const c = await push(um.token, { acao: 'cancelar', endpoint: 'https://fcm.googleapis.com/fcm/send/ap0' });
  assert.strictEqual(c.status, 200);
  assert.deepStrictEqual([db.agendamento_push.filter(p => p.revogado_em).length, db.agendamento_push.filter(p => !p.revogado_em).length], [1, 4]);
  // Outro horário do mesmo cliente, no mesmo aparelho (ap1): a assinatura passa a valer para o novo link.
  const dois = await horario({ hora: '12:00' });
  assert.strictEqual((await push(dois.token, { acao: 'assinar', assinatura: assinatura('https://fcm.googleapis.com/fcm/send/ap1') })).status, 200);
  assert.strictEqual(db.agendamento_push.find(p => p.endpoint_hash === require('crypto').createHash('sha256').update('https://fcm.googleapis.com/fcm/send/ap1').digest('hex')).acesso_id, dois.acesso.id);
  // Cancelar com endereço de outro link não mexe em nada.
  const antes = db.agendamento_push.filter(p => p.revogado_em).length;
  await push(dois.token, { acao: 'cancelar', endpoint: 'https://fcm.googleapis.com/fcm/send/ap2' });
  assert.strictEqual(db.agendamento_push.filter(p => p.revogado_em).length, antes);
});

test('L15 remarcação pelo link leva o push junto: o lembrete passa a sair para o novo horário', async () => {
  zerar();
  const { token, acesso } = await horario({ hora: '11:00' });
  await push(token, { acao: 'assinar', assinatura: assinatura() });
  const r = await request('POST', '/api/public/meu-agendamento/remarcar', { body: { token, data: '2026-11-12', horario: '15:00' } });
  assert.strictEqual(r.status, 200, r.raw);
  // Novo horário: 2026-11-12 15:00 local = 18:00Z. d1 de 2026-11-11T18:00Z a 2026-11-12T06:00Z.
  assert.strictEqual((await rodar('2026-11-11T20:00:00Z')).enviados, 1);
  assert.strictEqual(enviados.length, 1);
  assert.strictEqual(enviados[0].payload.corpo, 'Corte em Salão Alfa, 12/11 às 15:00.');
  assert.ok(db.agendamento_push.every(p => p.acesso_id === acesso.id));
});

// --- Controles negativos ----------------------------------------------------
function moduloMutante(arquivo, trocas) {
  const abs = path.join(__dirname, arquivo);
  let src = fs.readFileSync(abs, 'utf8');
  for (const [de, para] of trocas) { assert.ok(src.includes(de), `trecho do mutante não encontrado: ${de}`); src = src.split(de).join(para); }
  const m = new Module(abs, module); m.filename = abs; m.paths = Module._nodeModulePaths(path.dirname(abs)); m._compile(src, abs);
  return m.exports;
}
test('NC1 controle negativo: sem a lista de servidores de push, o endereço interno do L04 é aceito', () => {
  const mut = moduloMutante('../src/notifications/lembretes.js', [['return HOSTS_PUSH_EXATOS.includes(h) || SUFIXOS_PUSH.some(s => h.endsWith(s) && h.length > s.length);', 'return true;']]);
  assert.strictEqual(mut.endpointPermitido('https://169.254.169.254/latest/meta-data'), true, 'o mutante aceitaria (prova que L04 detecta)');
});
test('NC2 controle negativo: sem o limite superior da janela, o d1 ainda sairia faltando 1 h (L01 detecta)', () => {
  const mut = moduloMutante('../src/notifications/lembretes.js', [['agoraMs < inicioMs - JANELAS[t].ate', 'agoraMs < inicioMs']]);
  assert.ok(mut.tiposNaJanela(INICIO - 3600e3, INICIO).includes('d1'));
  assert.ok(!L.tiposNaJanela(INICIO - 3600e3, INICIO).includes('d1'));
});
test('NC3 controle negativo: sem a regra da assinatura, quem ligou o push com a janela aberta receberia o lembrete (L02/L06 detectam)', () => {
  const mut = moduloMutante('../src/notifications/lembretes.js', [['(criadaEmMs, inicioMs, tipo) => criadaEmMs < inicioMs - JANELAS[tipo].antes', '() => true']]);
  assert.strictEqual(mut.assinaturaValeParaTipo(Date.parse('2026-11-10T16:00:00Z'), INICIO, 'd1'), true);
});

(async () => {
  const origErr = console.error; const origWarn = console.warn; const origLog = console.log;
  console.error = () => {}; console.warn = () => {};
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  let ok = 0;
  console.log = (...a) => process.stdout.write(`${a.join(' ')}\n`);
  for (const { n, f } of tests) {
    try { await f(); ok++; process.stdout.write(`✓ ${n}\n`); } catch (err) { process.stdout.write(`✗ ${n}\n   ${err.message}\n`); }
  }
  server.close();
  console.error = origErr; console.warn = origWarn; console.log = origLog;
  console.log(`\nLembretes Push Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();
