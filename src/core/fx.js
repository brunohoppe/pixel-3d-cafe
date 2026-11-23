// Efeitos (som, aviso, texto flutuante, partículas) viram eventos simples.
// Localmente são tocados na hora; no co-op o host também repassa ao parceiro.
// `to` = id do jogador que deve ver/ouvir (vazio = todos).
export function createFx(localId, play) {
  const listeners = [];
  const emit = (e) => {
    if (!e.to || e.to === localId) play(e);
    for (const fn of listeners) fn(e);
  };
  return {
    play,
    listen(fn) {
      listeners.push(fn);
    },
    sfx: (name, to) => emit({ k: 'sfx', name, to }),
    toast: (text, kind = '', to) => emit({ k: 'toast', text, kind, to }),
    float: (pos, text, color) => emit({ k: 'float', p: [pos.x, pos.y, pos.z], text, color }),
    burst: (pos, color, n, opts) => emit({ k: 'burst', p: [pos.x, pos.y, pos.z], color, n, opts }),
  };
}
