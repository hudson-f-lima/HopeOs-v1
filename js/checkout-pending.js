import { chaveDoContexto } from './context-storage.js';

const BANCO = 'hopeos.checkout';
const PENDENCIAS = 'pendentes';

export function dadosDoFechamento(body) {
  const { clienteId, idempotencyKey, itens, payments, gorjetaCentavos, descontoCentavos, agendamentoId } = body;
  return {
    clienteId: clienteId || null,
    idempotencyKey,
    ...(body.revisaoFinanceira ? { revisaoFinanceira: body.revisaoFinanceira } : {}),
    itens: itens.map(({ tipo, servicoId, produtoId, quantidade, profissionalId, assinaturaId }) => (
      tipo === 'servico' ? { tipo, servicoId, profissionalId, assinaturaId } : { tipo, produtoId, quantidade, profissionalId }
    )),
    payments: payments.map(({ formaCode, valorCentavos }) => ({ formaCode, valorCentavos })),
    gorjetaCentavos,
    descontoCentavos,
    agendamentoId
  };
}

function abrirBanco() {
  return new Promise((resolve, reject) => {
    const abertura = indexedDB.open(BANCO, 1);
    abertura.onupgradeneeded = () => abertura.result.createObjectStore(PENDENCIAS);
    abertura.onerror = () => reject(abertura.error);
    abertura.onsuccess = () => resolve(abertura.result);
  });
}

async function transacionar(chave, gravar, decidir) {
  const banco = await abrirBanco();
  try {
    return await new Promise((resolve, reject) => {
      const tx = banco.transaction(PENDENCIAS, gravar ? 'readwrite' : 'readonly', { durability: 'strict' });
      const registros = tx.objectStore(PENDENCIAS);
      const leitura = registros.get(chave);
      let resultado;
      tx.oncomplete = () => resolve(resultado);
      tx.onabort = () => reject(tx.error);
      leitura.onsuccess = () => {
        try {
          const { retorno, registro } = decidir(leitura.result);
          resultado = retorno;
          if (registro === null) registros.delete(chave);
          else if (registro !== undefined) registros.put(registro, chave);
        } catch (err) {
          tx.abort();
          reject(err);
        }
      };
    });
  } finally {
    banco.close();
  }
}

function lerRegistro(registro) {
  if (registro === undefined) return null;
  const lido = JSON.parse(registro);
  const envelope = lido && Object.hasOwn(lido, 'payload');
  const payload = envelope ? lido.payload : lido;
  if (!payload?.idempotencyKey || !Array.isArray(payload.itens) || !Array.isArray(payload.payments)) throw new Error('Registro de fechamento inválido.');
  // O formato sem contador pode conter um envio anterior de resultado incerto.
  const id = envelope ? lido.id : 'anterior';
  const semRecusa = envelope ? lido.semRecusa : 1;
  if (typeof id !== 'string' || !Number.isSafeInteger(semRecusa) || semRecusa < 1) throw new Error('Registro de fechamento inválido.');
  return { id, payload: dadosDoFechamento(payload), semRecusa };
}

function idDoRegistro() {
  return crypto.getRandomValues(new Uint32Array(4)).join('-');
}

export function criarRegistroDeFechamentos(transacao = transacionar) {
  async function executar(sessao, gravar, decidir) {
    const chave = chaveDoContexto('checkout', sessao);
    if (!chave) throw new Error('Entre na sua conta e escolha uma empresa para fechar a comanda.');
    try {
      return await transacao(chave, gravar, decidir);
    } catch (err) {
      throw new Error('O navegador não conseguiu acessar o fechamento pendente. Verifique o armazenamento neste aparelho.', { cause: err });
    }
  }

  return {
    ler(sessao) {
      return executar(sessao, false, registro => ({ retorno: lerRegistro(registro)?.payload ?? null }));
    },
    async iniciar(sessao, dados, retomando = false) {
      const payload = dadosDoFechamento(dados);
      const reserva = await executar(sessao, true, registro => {
        const pendente = lerRegistro(registro);
        if (retomando ? pendente?.payload.idempotencyKey !== payload.idempotencyKey : pendente) {
          return { retorno: { payload: pendente?.payload ?? null, iniciou: false } };
        }
        if (!payload.idempotencyKey) throw new Error('O fechamento precisa de uma chave.');
        const tentativa = pendente || { id: idDoRegistro(), payload, semRecusa: 0 };
        if (tentativa.semRecusa === Number.MAX_SAFE_INTEGER) throw new Error('Limite de tentativas atingido.');
        tentativa.semRecusa += 1;
        return { retorno: { ...tentativa, iniciou: true }, registro: JSON.stringify(tentativa) };
      });
      if (!reserva.iniciou) return reserva;

      // Contamos envios em trânsito e incertos juntos. Um reload ou erro de rede
      // conserva o contador. Uma recusa comprovada finaliza só o envio desta aba.
      let recusa;
      return {
        payload: reserva.payload,
        iniciou: true,
        recusar() {
          recusa ??= executar(sessao, true, registro => {
            const pendente = lerRegistro(registro);
            if (!pendente || pendente.id !== reserva.id) return { retorno: false };
            pendente.semRecusa -= 1;
            const liberar = pendente.semRecusa === 0;
            return { retorno: liberar, registro: liberar ? null : JSON.stringify(pendente) };
          });
          return recusa;
        }
      };
    },
    confirmar(sessao, dados) {
      const confirmado = JSON.stringify(dadosDoFechamento(dados));
      return executar(sessao, true, registro => {
        const pendente = lerRegistro(registro);
        return pendente && JSON.stringify(pendente.payload) === confirmado ? { registro: null } : {};
      });
    }
  };
}
