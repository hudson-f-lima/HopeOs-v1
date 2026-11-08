// Gestão > Comissões (Onda B, D-009): cargos, categorias, cargo de cada
// profissional e modelo de herança de cada serviço. O backend calcula a comissão
// (ajuste do profissional → cargo/categoria pelo modelo do serviço → serviço).
import { api } from '../api.js';
import { state, sessionRoleIn } from '../state.js';
import { escapeHtml, showBanner } from '../utils.js';

const el = id => document.getElementById(id);
const MODELOS_TAXA = [['dividido', 'Dividido'], ['bruto_salao', 'Salão assume a taxa'], ['bruto_staff', 'Profissional assume a taxa']];
const HERANCA = [['FIXED_SERVICE', 'Do próprio serviço'], ['BY_ROLE', 'Pelo cargo de quem atende'], ['BY_CATEGORY', 'Pela categoria']];
let dados = { cargos: [], categorias: [] };

const opcoes = (lista, atual, vazio) =>
  (vazio ? `<option value="">${vazio}</option>` : '') +
  lista.map(([v, l]) => `<option value="${escapeHtml(v)}"${v === atual ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');

function render() {
  const cargosOpt = dados.cargos.filter(c => c.ativo !== false).map(c => [c.id, `${c.nome} (${Number(c.comissao_pct)}%)`]);
  const catsOpt = dados.categorias.filter(c => c.ativo !== false).map(c => [c.id, c.nome]);
  el('comissoesConteudo').innerHTML = `
    <section class="card">
      <h2 class="m-0">Cargos</h2>
      <p class="body-sm text-tertiary">Comissão e taxa da maquininha padrão de cada função.</p>
      ${dados.cargos.map(c => `
        <div class="eq-row" data-tipo="cargo" data-id="${c.id}">
          <div class="eq-quem"><b>${escapeHtml(c.nome)}</b></div>
          <div class="eq-ctrl">
            <label class="onb-mini">comissão % <input type="number" min="0" max="100" data-campo="comissaoPct" value="${Number(c.comissao_pct)}"/></label>
            <select data-campo="modeloComissao" aria-label="Taxa da maquininha">${opcoes(MODELOS_TAXA, c.modelo_comissao)}</select>
          </div>
        </div>`).join('') || '<p class="body-sm text-tertiary">Nenhum cargo ainda.</p>'}
      <form class="onb-linha" data-novo="cargo">
        <input name="nome" placeholder="Novo cargo (ex.: Barbeiro)" aria-label="Nome do cargo"/>
        <input name="comissaoPct" type="number" min="0" max="100" placeholder="%" aria-label="Comissão %" style="max-width:80px"/>
        <button class="btn btn-secondary" type="submit" style="width:auto">Adicionar</button>
      </form>
    </section>
    <section class="card">
      <h2 class="m-0">Categorias</h2>
      <p class="body-sm text-tertiary">Comissão opcional, usada pelos serviços com herança "Pela categoria".</p>
      ${dados.categorias.map(c => `
        <div class="eq-row" data-tipo="categoria" data-id="${c.id}">
          <div class="eq-quem"><b>${escapeHtml(c.nome)}</b></div>
          <div class="eq-ctrl"><label class="onb-mini">comissão % <input type="number" min="0" max="100" data-campo="comissaoPct" value="${c.comissao_pct ?? ''}" placeholder="—"/></label></div>
        </div>`).join('') || '<p class="body-sm text-tertiary">Nenhuma categoria ainda.</p>'}
      <form class="onb-linha" data-novo="categoria">
        <input name="nome" placeholder="Nova categoria (ex.: Barba)" aria-label="Nome da categoria"/>
        <input name="comissaoPct" type="number" min="0" max="100" placeholder="%" aria-label="Comissão %" style="max-width:80px"/>
        <button class="btn btn-secondary" type="submit" style="width:auto">Adicionar</button>
      </form>
    </section>
    <section class="card">
      <h2 class="m-0">Cargo de cada profissional</h2>
      ${(state.catalog.profissionais || []).filter(p => p.ativo !== false).map(p => `
        <div class="eq-row" data-tipo="profissional" data-id="${p.id}">
          <div class="eq-quem"><b>${escapeHtml(p.nome)}</b></div>
          <div class="eq-ctrl"><select data-campo="cargoId" aria-label="Cargo de ${escapeHtml(p.nome)}">${opcoes(cargosOpt, p.cargo_id || '', 'Sem cargo')}</select></div>
        </div>`).join('')}
    </section>
    <section class="card">
      <h2 class="m-0">Comissão de cada serviço</h2>
      <p class="body-sm text-tertiary">Sem cargo/categoria definidos, vale a comissão do próprio serviço. Ajustes por profissional sempre têm prioridade.</p>
      ${(state.catalog.servicos || []).filter(s => s.ativo !== false).map(s => `
        <div class="eq-row" data-tipo="servico" data-id="${s.id}">
          <div class="eq-quem"><b>${escapeHtml(s.nome)}</b><span>serviço: ${Number(s.comissao_pct)}%</span></div>
          <div class="eq-ctrl">
            <select data-campo="modeloHeranca" aria-label="Herança da comissão">${opcoes(HERANCA, s.modelo_heranca || 'FIXED_SERVICE')}</select>
            <select data-campo="categoriaId" aria-label="Categoria">${opcoes(catsOpt, s.categoria_id || '', 'Sem categoria')}</select>
          </div>
        </div>`).join('')}
    </section>`;
}

const ROTA = { cargo: '/cargos', categoria: '/categorias', profissional: '/profissionais', servico: '/servicos' };

async function salvar(linha, campo, valor) {
  const tipo = linha.dataset.tipo;
  let v = valor;
  if (campo === 'comissaoPct') v = valor === '' ? null : Number(valor);
  if (campo === 'cargoId' || campo === 'categoriaId') v = valor || null;
  try {
    const atualizado = await api(`${ROTA[tipo]}/${linha.dataset.id}`, { method: 'PATCH', body: { [campo]: v } });
    const lista = tipo === 'cargo' ? dados.cargos : tipo === 'categoria' ? dados.categorias : tipo === 'profissional' ? state.catalog.profissionais : state.catalog.servicos;
    Object.assign(lista.find(x => x.id === linha.dataset.id) || {}, atualizado);
    showBanner('Comissão atualizada.', 'ok');
    render();
  } catch (err) {
    showBanner(err.message, 'error');
  }
}

async function criar(form) {
  const tipo = form.dataset.novo;
  const nome = form.nome.value.trim();
  if (!nome) return;
  const pct = form.comissaoPct.value;
  const body = { nome };
  if (pct !== '') body.comissaoPct = Number(pct);
  if (tipo === 'cargo') { body.comissaoPct = Number(pct || 0); body.modeloComissao = 'dividido'; }
  try {
    const novo = await api(ROTA[tipo], { method: 'POST', body });
    (tipo === 'cargo' ? dados.cargos : dados.categorias).push(novo);
    render();
  } catch (err) {
    showBanner(err.message, 'error');
  }
}

export async function renderComissoes() {
  if (!sessionRoleIn('admin', 'gestor')) return;
  try {
    const [cargos, categorias] = await Promise.all([api('/cargos'), api('/categorias')]);
    dados = { cargos, categorias };
    render();
  } catch (err) {
    el('comissoesConteudo').innerHTML = `<p class="body-sm" style="color:var(--md-error)">${escapeHtml(err.message)}</p>`;
  }
}

export function initComissoes() {
  if (!sessionRoleIn('admin', 'gestor')) return;
  el('subtabBtnComissoes')?.classList.remove('hidden');
  el('comissoesConteudo').addEventListener('change', ev => {
    const linha = ev.target.closest('[data-tipo][data-id]');
    if (linha && ev.target.dataset.campo) salvar(linha, ev.target.dataset.campo, ev.target.value);
  });
  el('comissoesConteudo').addEventListener('submit', ev => {
    ev.preventDefault();
    if (ev.target.dataset.novo) criar(ev.target);
  });
  el('subtabBtnComissoes')?.addEventListener('click', renderComissoes);
}
