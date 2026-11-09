// Relógio do servidor. Produção usa sempre o relógio real; os gates offline
// trocam a fonte para fixar "agora" (datas de teste nunca dependem de new Date()).
let fonte = () => new Date();

module.exports = {
  agora: () => fonte(),
  definirRelogio(fn) { fonte = typeof fn === 'function' ? fn : () => new Date(); }
};
