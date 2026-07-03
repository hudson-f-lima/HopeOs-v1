const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');

function readJsonFile(filename) {
  const full = path.join(env.DATA_DIR, filename);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf-8'));
}

function loadDataContract() {
  return {
    meta: readJsonFile('meta.json'),
    empresa: readJsonFile('empresa.json'),
    clientes: readJsonFile('clientes.json') || [],
    servicos: readJsonFile('servicos.json') || [],
    produtos: readJsonFile('produtos.json') || [],
    profissionais: readJsonFile('profissionais.json') || [],
    profissionalServicos: readJsonFile('profissional_servicos.json') || [],
    agendamentos: readJsonFile('agendamentos.json') || [],
    formasPagamento: readJsonFile('formas_pagamento.json') || [],
    comandos: readJsonFile('comandos.json') || [],
    caixaMovimentos: readJsonFile('caixa_movimentos.json') || [],
    estoqueMovimentos: readJsonFile('produto_estoque_movimentos.json') || [],
    listaEspera: readJsonFile('lista_espera.json') || [],
    eventos: readJsonFile('agendamento_eventos.json') || []
  };
}

module.exports = { readJsonFile, loadDataContract };
