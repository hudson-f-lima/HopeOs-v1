// Seletor de tema em Conta (D-031): Automático (segue o aparelho), Claro ou Escuro.
// Guardado só neste aparelho; não vai para o servidor.
const CHAVE = 'hopeos.tema';
const COR_BARRA = { light: '#f7f7f9', dark: '#0b0d12' };

function aplicar(tema) {
  const raiz = document.documentElement;
  if (tema === 'claro') raiz.setAttribute('data-theme', 'light');
  else if (tema === 'escuro') raiz.setAttribute('data-theme', 'dark');
  else raiz.removeAttribute('data-theme');
  // Barra do navegador no celular: com tema forçado, as duas metas usam a mesma cor.
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    const original = m.dataset.original || m.getAttribute('content');
    m.dataset.original = original;
    m.setAttribute('content', tema === 'claro' ? COR_BARRA.light : tema === 'escuro' ? COR_BARRA.dark : original);
  });
}

function lido() {
  try { const t = localStorage.getItem(CHAVE); return t === 'claro' || t === 'escuro' ? t : 'auto'; } catch (_) { return 'auto'; }
}

export function initTema() {
  const atual = lido();
  aplicar(atual);
  const marcado = document.querySelector(`input[name="tema"][value="${atual}"]`);
  if (marcado) marcado.checked = true;
  document.querySelectorAll('input[name="tema"]').forEach(input => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      try { if (input.value === 'auto') localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, input.value); } catch (_) { /* aplica só nesta sessão */ }
      aplicar(input.value);
    });
  });
}
