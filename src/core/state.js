import { clamp } from '../util.js';

// Estado compartilhado da partida (dinheiro, grãos, reputação/estrelas).
// No co-op há mais clientes: NPCs ×1,3 e chegadas 25% mais rápidas.
export function createGameState({ coop = false } = {}) {
  return {
    money: 0, beans: 2, rep: 10, served: 0, lost: 0, maxCarry: 4,
    counterCups: 0, counterMax: 6,
    open: false, // cavalete na calçada = aberta; começa fechada (novos clientes não entram) // cafés deixados na bandeja do balcão (compartilhados)
    npcScale: coop ? 1.3 : 1,
    spawnRate: coop ? 1.25 : 1,
    get stars() { return clamp(1 + Math.floor(this.rep / 20), 1, 5); },
    get queueCap() { return this.stars * 5; }, // 5 clientes por estrela
    wantChance() { return 0.22 + 0.05 * this.stars; },
    impulseChance() { return 0.06 + 0.05 * this.stars; },
    maxNPCs() { return Math.round((7 + this.stars * 2) * this.npcScale); },
    patience() { return 75 - this.stars * 5; },
  };
}

export function addRep(game, d, fx) {
  const before = game.stars;
  game.rep = clamp(game.rep + d, 0, 100);
  const after = game.stars;
  if (after > before) {
    fx.toast(`Nova estrela! ${after}★ — fila máx ${game.queueCap}`, 'gold');
    fx.sfx('star');
  } else if (after < before) {
    fx.toast(`Perdeu uma estrela... ${after}★`, 'red');
  }
}
