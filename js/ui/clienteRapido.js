// Cadastro rápido de cliente no novo agendamento (D-032, 2026-11-15). Quem tem
// clientes:criar (todos os papéis) cadastra nome e WhatsApp sem sair do agendamento.
// O profissional não vê o contato de clientes já cadastrados: só o nome volta do servidor.
import { api } from '../api.js';
import { state, sessionPode } from '../state.js';

const el = id => document.getElementById(id);

function fechar() {
  el('agNovoCliente').classList.add('hidden');
  el('btnAgNovoCliente').classList.remove('hidden');
  el('agNovoClienteErro').classList.add('hidden');
}

// Chamado ao abrir o modal de novo agendamento.
export function resetClienteRapido() {
  if (!el('agNovoCliente')) return;
  el('agNovoClienteNome').value = '';
  el('agNovoClienteZap').value = '';
  fechar();
  el('btnAgNovoCliente').classList.toggle('hidden', !sessionPode('clientes:criar'));
}

async function salvar() {
  const nome = el('agNovoClienteNome').value.trim();
  const whatsapp = el('agNovoClienteZap').value.trim();
  const erro = el('agNovoClienteErro');
  if (!nome) { erro.textContent = 'Informe o nome do cliente.'; erro.classList.remove('hidden'); el('agNovoClienteNome').focus(); return; }
  const botao = el('btnAgNovoClienteSalvar');
  botao.disabled = true;
  try {
    const criado = await api('/clientes', { method: 'POST', body: whatsapp ? { nome, whatsapp } : { nome } });
    state.catalog.clientes.push({ id: criado.id, nome: criado.nome, ativo: true });
    state.fuzzyAgCliente.setItems(state.catalog.clientes);
    state.fuzzyAgCliente.setValue(criado.id);
    fechar();
  } catch (err) {
    erro.textContent = err.message;
    erro.classList.remove('hidden');
  } finally {
    botao.disabled = false;
  }
}

export function initClienteRapido() {
  if (!el('agNovoCliente')) return;
  el('btnAgNovoCliente').addEventListener('click', () => {
    // O que já foi digitado na busca vira o nome, se ninguém foi escolhido.
    if (!state.fuzzyAgCliente.getValue()) el('agNovoClienteNome').value = el('agCliente').value.trim();
    el('btnAgNovoCliente').classList.add('hidden');
    el('agNovoCliente').classList.remove('hidden');
    el('agNovoClienteNome').focus();
  });
  el('btnAgNovoClienteCancelar').addEventListener('click', fechar);
  el('btnAgNovoClienteSalvar').addEventListener('click', salvar);
}
