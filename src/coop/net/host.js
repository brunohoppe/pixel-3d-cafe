import { VERSION, SNAP_HZ, TIMEOUT, now, r2, encodeGame } from './protocol.js';

// O host roda a simulação inteira e manda snapshots ao parceiro.
// O parceiro controla só a própria posição; interações chegam como pedidos validados aqui.
export function startHost(S, { onStatus } = {}) {
  let t = null;
  let guest = null;
  let acc = 0;
  let lastHeard = 0;
  const events = [];

  S.fx.listen((e) => {
    if (guest && (!e.to || e.to === 'guest')) events.push(e);
  });

  function drop(reason) {
    if (guest) {
      S.removePlayer('guest'); // xícaras na mão do parceiro se perdem
      S.fx.toast(reason, 'orange');
    }
    guest = null;
    t = null;
    events.length = 0;
    onStatus?.('waiting');
  }

  function snapshot() {
    const h = S.local;
    return {
      t: 's',
      time: Math.round(S.simTime * 1000) / 1000,
      g: encodeGame(S.game),
      m: S.machine.toNet(),
      pl: S.garden.toNet(),
      q: [S.npcs.queueLength, S.npcs.front() ? 1 : 0],
      h: [r2(h.pos.x), r2(h.pos.z), r2(h.angle), r2(h.speed), h.carry],
      gc: guest.carry,
      n: S.npcs.toNet(),
      ev: events.splice(0),
    };
  }

  function onMessage(m) {
    lastHeard = now();
    if (m.t === 'hello') {
      if (m.v !== VERSION) {
        t.send({ t: 'version' });
        return;
      }
      if (!guest) guest = S.addPlayer('guest', 'player2');
      t.send({ t: 'welcome', v: VERSION });
      t.send(snapshot());
      S.fx.toast('Parceiro entrou na sala!', 'gold');
      onStatus?.('connected');
    } else if (!guest) {
      return;
    } else if (m.t === 'p') {
      guest.setNetTarget(m.x, m.z, m.a, m.s);
    } else if (m.t === 'i') {
      const it = S.interactables.find((i) => i.id === m.id);
      const gp = guest.net || guest.pos;
      const near = it && (it.remote || Math.hypot(it.pos.x - gp.x, it.pos.z - gp.z) <= it.r + 0.75);
      const l = near && it.label(guest);
      if (l && !l.off) it.action(guest, typeof m.arg === 'number' ? m.arg : undefined);
      else S.fx.sfx('deny', 'guest');
    }
  }

  S.afterFrame = (dt) => {
    if (!t) return;
    if (now() - lastHeard > TIMEOUT) {
      t.close();
      return;
    }
    if (!guest) return;
    acc += dt;
    if (acc < 1 / SNAP_HZ) return;
    acc = 0;
    t.send(snapshot());
  };

  return {
    // Nova conexão de um parceiro (máximo 1)
    attach(transport) {
      if (t) {
        transport.send({ t: 'full' });
        setTimeout(() => transport.close(), 300);
        return;
      }
      t = transport;
      lastHeard = now();
      t.onMessage(onMessage);
      t.onClose(() => t === transport && drop('O parceiro saiu da partida.'));
    },
  };
}
