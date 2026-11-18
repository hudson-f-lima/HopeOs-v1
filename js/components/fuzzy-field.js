// Rótulos vêm de cadastro (nome de cliente criado pela recepção, por integração ou
// pelo link público): sempre escapados antes do innerHTML (Red Team 2026-11, RT-12).
import { escapeHtml, normalizeSearchText } from '../utils.js';

export class FuzzyField {
  constructor(inputId, items, { labelFn, valueFn, onSelect }) {
    this.input = document.getElementById(inputId);
    if (!this.input) return;
    this.items = items;
    this.labelFn = labelFn;
    this.valueFn = valueFn;
    this.onSelect = onSelect;
    this.dropdown = null;
    this.activeIndex = -1;
    this.listId = inputId + '-options';
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.addEventListener('keydown', e => this.onKey(e));
    this.selectedValue = null;

    // O fechamento ao sair espera 200 ms (para o clique na opção chegar antes). Se o campo
    // voltar a ser usado nesse intervalo, o fechamento pendente é cancelado: sem isso a
    // lista recém-aberta sumia sozinha.
    this.closeTimer = null;
    const cancelarFechamento = () => { clearTimeout(this.closeTimer); this.closeTimer = null; };
    this.input.addEventListener('blur', () => { cancelarFechamento(); this.closeTimer = setTimeout(() => this.closeDropdown(), 200); });
    this.input.addEventListener('focus', () => { cancelarFechamento(); this.onInput({ target: this.input }); });
    // Texto editado à mão deixa de ser a opção escolhida: o que vale é o que aparece.
    // Sem isso, apagar o campo mantinha a escolha anterior escondida. Só no evento de
    // digitação: o foco reabre a lista e não pode desfazer a escolha.
    this.input.addEventListener('input', (e) => { cancelarFechamento(); this.selectedValue = null; this.onInput(e); });
  }

  fuzzyMatch(q, t) {
    if (t.includes(q)) return 0;
    let score = 0, qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) { score += 1; qi++; }
      else { score += 2; }
    }
    return qi === q.length ? score : Infinity;
  }

  onInput(e) {
    const query = normalizeSearchText(e.target.value.trim());
    if (!query) {
      this.showDropdown(this.items.slice(0, 8));
      return;
    }
    // Reuse normalized labels until the catalog changes. Exact substring matches
    // keep catalog order and outrank subsequence matches.
    this.searchLabels ||= new Map();
    const best = [];
    for (const item of this.items) {
      if (!this.searchLabels.has(item)) this.searchLabels.set(item, normalizeSearchText(this.labelFn(item)));
      const score = this.fuzzyMatch(query, this.searchLabels.get(item));
      if (score === Infinity || (best.length === 8 && score >= best[7].score)) continue;
      const pos = best.findIndex(match => match.score > score);
      best.splice(pos < 0 ? best.length : pos, 0, { item, score });
      if (best.length > 8) best.pop();
      if (best.length === 8 && best[7].score === 0) break;
    }
    this.showDropdown(best.map(match => match.item));
  }

  onKey(event) {
    if (event.isComposing) return;
    const open = this.dropdown && this.dropdown.style.display !== 'none';
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      this.closeDropdown();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    if (!open) {
      if (event.key === 'Enter') return;
      this.onInput({ target: this.input });
    }
    const options = this.dropdown.querySelectorAll('[role="option"]');
    if (!options.length) return;
    if (event.key === 'Enter') {
      if (this.activeIndex < 0) return;
      event.preventDefault();
      options[this.activeIndex].click();
      return;
    }
    event.preventDefault();
    const first = event.key === 'ArrowDown' ? 0 : options.length - 1;
    const step = event.key === 'ArrowDown' ? 1 : -1;
    this.activeIndex = this.activeIndex < 0 ? first : (this.activeIndex + step + options.length) % options.length;
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === this.activeIndex)));
    const active = options[this.activeIndex];
    this.input.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
  }

  showDropdown(filtered) {
    if (!this.dropdown) {
      this.dropdown = document.createElement('div');
      this.dropdown.id = this.listId;
      this.dropdown.setAttribute('role', 'listbox');
      this.dropdown.setAttribute('aria-label', this.input.labels?.[0]?.textContent?.trim() || this.input.getAttribute('aria-label') || 'Opções');
      this.input.setAttribute('aria-controls', this.listId);
      this.input.parentElement.style.position = 'relative';
      this.input.parentElement.appendChild(this.dropdown);
      // Impede que o clique no dropdown tire o foco do input antes do 'click'
      // disparar — sem isso, o blur (200ms) pode fechar/limpar o dropdown antes
      // do clique no item ser processado, especialmente em dispositivos lentos.
      this.dropdown.addEventListener('mousedown', (e) => e.preventDefault());
    }
    this.activeIndex = -1;
    this.input.removeAttribute('aria-activedescendant');
    this.input.setAttribute('aria-expanded', 'true');
    this.dropdown.style.cssText = `
      position: absolute; top: 100%; left: 0; right: 0;
      background: var(--surface); border: 1px solid var(--surface-variant);
      border-radius: 8px; margin-top: 2px; max-height: 200px; overflow-y: auto;
      z-index: 1000; box-shadow: var(--elevation-1); display: block;
    `;

    if (!filtered.length) {
      this.dropdown.innerHTML = '<div style="padding: 8px; color: var(--outline); font-size: 12px;">Sem resultados</div>';
      return;
    }

    this.dropdown.innerHTML = filtered
      .map((item, i) => {
        const label = this.labelFn(item);
        const value = this.valueFn(item);
        return `<div role="option" id="${this.listId}-${i}" aria-selected="false" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--surface-variant); font-size: 13px;" data-value="${escapeHtml(value)}" data-label="${escapeHtml(label)}">
          ${escapeHtml(label)}
        </div>`;
      })
      .join('');

    this.dropdown.querySelectorAll('div[data-value]').forEach(el => {
      el.addEventListener('click', () => {
        this.input.value = el.dataset.label;
        this.selectedValue = el.dataset.value;
        this.onSelect(this.selectedValue);
        this.closeDropdown();
      });
    });
  }

  closeDropdown() {
    this.activeIndex = -1;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
    if (this.dropdown) {
      this.dropdown.innerHTML = '';
      this.dropdown.style.display = 'none';
    }
  }

  getValue() {
    return this.selectedValue;
  }

  setValue(value) {
    this.selectedValue = value;
    const item = this.items.find(i => this.valueFn(i) === value);
    // Valor sem item (inclusive null) limpa o texto: campo vazio = nada escolhido.
    this.input.value = item ? this.labelFn(item) : '';
    if (!item) this.selectedValue = null;
  }

  setItems(newItems) {
    this.items = newItems;
    this.searchLabels = null;
    this.closeDropdown();
    // Se o valor selecionado não existe mais na nova lista (cross-filter), limpa
    if (this.selectedValue && !newItems.some(i => this.valueFn(i) === this.selectedValue)) {
      this.clear();
    }
  }

  clear() {
    this.input.value = '';
    this.selectedValue = null;
    this.closeDropdown();
  }
}
