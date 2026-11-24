import { addRep } from './state.js';

// Cobra o café entregue a um cliente (no balcão ou na retirada). frac = paciência restante 0..1
export function chargeCustomer(game, fx, npc, frac) {
  const tip = Math.round(4 * frac);
  game.money += 5 + tip;
  game.served++;
  addRep(game, 4 + Math.round(3 * frac), fx);
  fx.sfx('serve');
  fx.float(npc.pos, tip > 0 ? `+$${5 + tip} (gorjeta!)` : '+$5', '#ffd34e');
}

// Objetos interativos. label(player) roda em todos; action(player, arg) só em quem simula.
// Cada um tem um `id` estável para o pedido de interação viajar pela rede.
// `ui`: em vez de agir direto, abre uma tela local (ex.: menu de pedidos), que depois
// manda action(player, arg) com a escolha.
export function buildInteractables({ game, machine, garden, npcs, fx }) {
  const list = [];

  list.push({
    id: 'machine', pos: machine.pos, r: 2.0, py: 2.9,
    label(pl) {
      const { canPick, canBrew } = machine.options(pl, game);
      if (canPick && canBrew) return { text: 'Pegar café + preparar mais' };
      if (canPick) return { text: `Pegar café (${machine.ready})` };
      if (canBrew) return { text: 'Fazer café (1 grão = 2)' };
      if (machine.brewing) return { text: `Preparando... ${Math.floor((machine.t / machine.dur) * 100)}%`, off: true };
      if (machine.ready > 0) return { text: 'Mãos cheias!', off: true };
      return { text: 'Sem grãos — colha na horta', off: true };
    },
    action(pl) {
      const { canPick, canBrew } = machine.options(pl, game);
      if (canPick) {
        const n = Math.min(machine.ready, game.maxCarry - pl.carry);
        machine.ready -= n;
        pl.carry += n;
        fx.sfx('pick', pl.id);
        fx.float(pl.pos, `+${n} café`, '#f4ead8');
      }
      if (canBrew) {
        game.beans--;
        machine.brewing = true;
        machine.t = 0;
        fx.sfx('brew');
      }
      if (!canPick && !canBrew) fx.sfx('deny', pl.id);
    },
  });

  list.push({
    id: 'counter', pos: { x: -4.5, y: 0.12, z: -7 }, r: 2.0, py: 1.9,
    label(pl) {
      if (!npcs.front()) return null;
      if (pl.carry <= 0) return { text: 'Cliente esperando — pegue café', off: true };
      return { text: 'Servir café' };
    },
    action(pl) {
      if (!npcs.front() || pl.carry <= 0) return fx.sfx('deny', pl.id);
      const { npc, frac } = npcs.serve();
      pl.carry--;
      chargeCustomer(game, fx, npc, frac);
    },
  });

  // Caixa registradora: menu de pedidos para indicar quem retira no balcão (sem fila)
  list.push({
    id: 'orders', pos: { x: -2.4, y: 0.12, z: -7 }, r: 1.3, py: 1.9, ui: 'orders',
    remote: true, // também pelo app do celular, de qualquer lugar
    label() {
      return { text: `Pedidos (${npcs.queueLength} na fila)` };
    },
    action(pl, npcId) {
      const n = typeof npcId === 'number' && npcs.sendToPickup?.(npcId) && npcs.list.find((m) => m.id === npcId);
      if (!n) return fx.sfx('deny', pl.id);
      fx.sfx('join');
      fx.float(n.pos, 'vai retirar no balcão', '#9fd6f0');
    },
  });

  // Bandeja no balcão: mãos com café → deixa tudo; mãos vazias → pega
  list.push({
    id: 'stash', pos: { x: -7.5, y: 0.12, z: -7 }, r: 1.4, py: 1.7,
    label(pl) {
      const n = game.counterCups, space = game.counterMax - n;
      if (pl.carry > 0 && space > 0) return { text: `Deixar café no balcão (${n}/${game.counterMax})` };
      if (pl.carry > 0) return { text: 'Bandeja do balcão cheia', off: true };
      if (n > 0) return { text: `Pegar café do balcão (${n})` };
      return null; // vazio e mãos vazias: não atrapalha o "Servir" ao lado
    },
    action(pl) {
      const space = game.counterMax - game.counterCups;
      if (pl.carry > 0 && space > 0) {
        const k = Math.min(pl.carry, space);
        pl.carry -= k;
        game.counterCups += k;
        fx.sfx('pick', pl.id);
        fx.float(pl.pos, `-${k} café`, '#f4ead8');
      } else if (pl.carry === 0 && game.counterCups > 0) {
        const k = Math.min(game.counterCups, game.maxCarry);
        game.counterCups -= k;
        pl.carry += k;
        fx.sfx('pick', pl.id);
        fx.float(pl.pos, `+${k} café`, '#f4ead8');
      } else fx.sfx('deny', pl.id);
    },
  });

  garden.plots.forEach((p, i) => {
    list.push({
      id: `plot${i}`, pos: p.pos, r: 2.1, py: 1.4,
      label() {
        const pct = Math.floor(p.g * 100);
        if (p.state === 'empty') return { text: 'Plantar café' };
        if (p.state === 'ready') return { text: 'Colher (+2 grãos)' };
        if (!p.watered) return { text: `Regar (${pct}%)` };
        return { text: `Crescendo... ${pct}%`, off: true };
      },
      action(pl) {
        if (p.state === 'empty') {
          garden.plant(p);
          fx.sfx('plant');
          fx.burst(p.pos, 0x5c3820, 10, { y: 0.3 });
        } else if (p.state === 'ready') {
          garden.harvest(p);
          game.beans += 2;
          fx.sfx('harvest');
          fx.burst(p.pos, 0xd8322a, 12, { y: 0.6 });
          fx.float(p.pos, '+2 grãos', '#f4ead8');
        } else if (!p.watered) {
          garden.water(p);
          fx.sfx('water');
          fx.burst(p.pos, 0x5b9be8, 14, { y: 1.4, up: 1, grav: 9 });
        } else fx.sfx('deny', pl.id);
      },
    });
  });

  return list;
}

// Interativo mais próximo dentro do raio, com rótulo
export function findInteractable(list, player) {
  const pp = player.pos;
  let best = null, bestD = Infinity;
  for (const it of list) {
    const d = Math.hypot(it.pos.x - pp.x, it.pos.z - pp.z);
    if (d > it.r || d >= bestD) continue;
    const l = it.label(player);
    if (!l) continue;
    best = { it, l };
    bestD = d;
  }
  return best;
}
