import { lerpAngle } from '../../util.js';
import { VERSION, INPUT_HZ, INTERP_DELAY, TIMEOUT, now, r2, applyGame } from './protocol.js';

const lerp = (a, b, t) => a + (b - a) * t;

// O parceiro só desenha o mundo recebido (com ~100 ms de atraso, interpolado)
// e manda a própria posição e os pedidos de interação.
export function startClient(S, t, { onEnd } = {}) {
  const snaps = [];
  let offset = null; // relógio do host - relógio local
  let lastHeard = now();
  let acc = 0;
  let host = null;
  let ended = false;

  function end(msg) {
    if (ended) return;
    ended = true;
    t.close();
    onEnd?.(msg);
  }

  S.requestAction = (it, arg) => t.send({ t: 'i', id: it.id, arg });

  function onSnap(s) {
    const est = s.time - now();
    offset = offset === null ? est : offset + (est - offset) * 0.05;
    snaps.push(s);
    while (snaps.length > 40) snaps.shift();
    // Estado discreto: aplica na hora
    applyGame(S.game, s.g);
    S.machine.fromNet(s.m);
    S.garden.fromNet(s.pl);
    S.local.carry = s.gc;
    for (const e of s.ev) if (!e.to || e.to === 'guest') S.fx.play(e);
  }

  t.onMessage((m) => {
    lastHeard = now();
    if (m.t === 's') onSnap(m);
    else if (m.t === 'full') end('A sala já tem 2 jogadores.');
    else if (m.t === 'version') end('Versão diferente da do host. Recarregue a página.');
  });
  t.onClose(() => end('O host saiu da partida.'));
  t.send({ t: 'hello', v: VERSION });

  // Posições: interpola entre os dois snapshots em volta do "agora - atraso"
  S.clientStep = (dt) => {
    if (!snaps.length) return;
    const rt = now() + offset - INTERP_DELAY;
    let a = snaps[0], b = snaps[0];
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].time <= rt) {
        a = snaps[i];
        b = snaps[i + 1] || snaps[i];
        break;
      }
    }
    const k = b === a ? 1 : Math.min(1, Math.max(0, (rt - a.time) / (b.time - a.time)));
    if (!host) host = S.addPlayer('host', 'player');
    host.setPose(lerp(a.h[0], b.h[0], k), lerp(a.h[1], b.h[1], k), lerpAngle(a.h[2], b.h[2], k), b.h[3]);
    host.carry = b.h[4];
    S.npcs.apply(a, b, k, dt);
  };

  S.afterFrame = (dt) => {
    if (ended) return;
    if (now() - lastHeard > TIMEOUT) return end('A conexão com o host caiu.');
    acc += dt;
    if (acc < 1 / INPUT_HZ) return;
    acc = 0;
    const p = S.local;
    t.send({ t: 'p', x: r2(p.pos.x), z: r2(p.pos.z), a: r2(p.angle), s: r2(p.speed) });
  };
}
