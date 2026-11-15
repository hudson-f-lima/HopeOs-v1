// Tema escolhido no aparelho (D-031), aplicado ANTES da primeira pintura para a tela
// não piscar na cor errada. Script clássico no <head> (a CSP proíbe script inline).
// 'claro' | 'escuro' forçam; ausente ou 'auto' segue o aparelho.
(function () {
  try {
    var t = localStorage.getItem('hopeos.tema');
    if (t === 'claro') document.documentElement.setAttribute('data-theme', 'light');
    else if (t === 'escuro') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) { /* sem armazenamento: segue o aparelho */ }
})();
