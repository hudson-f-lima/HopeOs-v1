export class FuzzyField {
  constructor(inputId, items, { labelFn, valueFn, onSelect }) {
    this.input = document.getElementById(inputId);
    if (!this.input) return;
    this.items = items;
    this.labelFn = labelFn;
    this.valueFn = valueFn;
    this.onSelect = onSelect;
    this.dropdown = null;
    this.selectedValue = null;

    this.input.addEventListener('input', (e) => this.onInput(e));
    this.input.addEventListener('blur', () => setTimeout(() => this.closeDropdown(), 200));
    this.input.addEventListener('focus', () => this.onInput({ target: this.input }));
  }

  fuzzyMatch(query, text) {
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!q) return true;
    if (t.includes(q)) return 0; // prefix match = score 0 (best)
    let score = 0, qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) { score += 1; qi++; }
      else { score += 2; }
    }
    return qi === q.length ? score : Infinity;
  }

  onInput(e) {
    const query = e.target.value.trim();
    const matches = this.items
      .map(item => ({ item, score: this.fuzzyMatch(query, this.labelFn(item)) }))
      .filter(m => m.score < Infinity)
      .sort((a, b) => a.score - b.score)
      .slice(0, 8);

    this.showDropdown(matches.map(m => m.item));
  }

  showDropdown(filtered) {
    if (!this.dropdown) {
      this.dropdown = document.createElement('div');
      this.input.parentElement.style.position = 'relative';
      this.input.parentElement.appendChild(this.dropdown);
      // Impede que o clique no dropdown tire o foco do input antes do 'click'
      // disparar — sem isso, o blur (200ms) pode fechar/limpar o dropdown antes
      // do clique no item ser processado, especialmente em dispositivos lentos.
      this.dropdown.addEventListener('mousedown', (e) => e.preventDefault());
    }
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
        return `<div style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--surface-variant); font-size: 13px;" data-value="${value}" data-label="${label}">
          ${label}
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
    if (item) {
      this.input.value = this.labelFn(item);
    }
  }

  setItems(newItems) {
    this.items = newItems;
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
