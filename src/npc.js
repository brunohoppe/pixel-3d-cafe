import * as THREE from 'three';
import { createCharacter } from './character.js';
import { icon } from './icons.js';
import { rand, pick, lerpAngle, groundY } from './util.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);

// Posições da fila: 0 = no balcão; 0..4 dentro da cafeteria; 5+ na calçada
export const SLOTS = (() => {
  const s = [V(-4.5, -5.7), V(-4.5, -4.5), V(-4.5, -3.3), V(-3.8, -2.2), V(-2.6, -1.2), V(-2.6, 1.15)];
  for (let i = 1; s.length < 25; i++) s.push(V(-2.6 - 1.2 * i, 1.15));
  return s;
})();
const INSIDE = 5;
const CROSS_X = -2;
const END_X = 46;
const DOOR_OUT = V(-2.6, 1.9);
const COUNTER = V(-4.5, -7);

// Retirada no balcão: clientes indicados no menu de pedidos saem da fila e esperam
// na frente da bandeja (ponta esquerda do balcão) até ter café nela
export const PICKUP_MAX = 3;
const PICKUP = [V(-7.5, -6.05), V(-6.7, -5.5), V(-8.2, -5.5)];
const PICKUP_EXIT = [V(-6, -3.2), V(-1.4, -1.8), V(-1.4, 1.9), V(-1.4, 2.3)];

// Faixas da calçada por sentido (evita trombadas de frente)
const lane = (north, dir) => (north ? (dir > 0 ? 2.0 : 2.6) : dir > 0 ? 10.0 : 10.6);

export const NPC_SHEETS = ['npc_0', 'npc_1', 'npc_2', 'npc_3', 'npc_4', 'npc_5', 'npc_6', 'npc_7'];
export const NPC_STATES = ['walk', 'queue', 'leave', 'pickup'];

// Balão (DOM) sobre a cabeça do cliente
export function createBubble(overlay) {
  const el = document.createElement('div');
  el.className = 'bubble';
  const img = document.createElement('img');
  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('div');
  fill.className = 'fill';
  bar.appendChild(fill);
  el.append(img, bar);
  el.style.display = 'none';
  overlay.appendChild(el);
  return { el, img, bar, fill, curIcon: null };
}

// Escolhe e posiciona o ícone do balão a partir do estado do cliente
export function renderBubble(n, project, ps, time) {
  let ic = null;
  let showBar = false;
  if (n.tempT > 0 && n.tempIcon) ic = n.tempIcon;
  else if (n.state === 'queue' || n.state === 'pickup') {
    ic = 'coffee';
    showBar = n.waiting;
  } else if (n.state === 'walk' && n.wants && !n.decided) ic = 'coffee';
  else if (n.state === 'walk' && n.icon && (time + n.seed) % 9 < 3.5) ic = n.icon;

  const s = ic && project(n.pos, 1.75);
  if (!ic || !s.on) {
    n.el.style.display = 'none';
    return;
  }
  n.el.style.display = 'flex';
  if (n.curIcon !== ic) {
    const d = icon(ic);
    n.img.src = d.url;
    n.iconW = d.w;
    n.curIcon = ic;
  }
  n.img.style.width = `${n.iconW * ps}px`;
  n.bar.style.display = showBar ? 'block' : 'none';
  let shake = 0;
  if (showBar) {
    const f = Math.max(0, n.patience / n.patienceMax);
    n.fill.style.width = `${f * 100}%`;
    n.fill.style.background = f > 0.5 ? '#5bbf5b' : f > 0.25 ? '#ffd34e' : '#e8424f';
    if (f < 0.25) shake = Math.round(Math.sin(time * 30) * 0.6) * ps;
  }
  n.el.style.transform = `translate(${s.x + shake}px, ${s.y}px) translate(-50%, -100%)`;
}

let NEXT_ID = 1;

export class NPCManager {
  constructor(scene, overlay, game) {
    this.scene = scene;
    this.overlay = overlay;
    this.game = game;
    this.list = [];
    this.queue = [];
    this.pickup = []; // indicados para retirar no balcão (ordem de chegada)
    this.spawnT = 1.5;
    for (let i = 0; i < 6; i++) this.spawn(true);
  }

  spawn(initial = false) {
    const fromLeft = Math.random() < 0.5;
    const north = Math.random() < 0.55;
    const dir = fromLeft ? 1 : -1;
    const startX = initial ? rand(-38, 38) : -dir * END_X;
    const sheet = Math.floor(Math.random() * NPC_SHEETS.length);
    const char = createCharacter(NPC_SHEETS[sheet]);
    const laneZ = lane(north, dir) + rand(-0.15, 0.15);
    char.root.position.set(startX, groundY(startX, laneZ), laneZ);
    this.scene.add(char.root);

    const passed = dir > 0 ? startX > CROSS_X : startX < CROSS_X;
    const wants = !passed && Math.random() < this.game.wantChance();

    const n = {
      ...createBubble(this.overlay),
      id: NEXT_ID++, sheet, char, pos: char.root.position, north, laneZ, endX: dir * END_X,
      speed: rand(1.5, 2.1), state: 'walk', path: [], wants, decided: passed,
      waiting: false, patience: 0, patienceMax: 1, slot: -1,
      icon: wants ? null : pick(['note', 'house', 'bag', null]),
      tempIcon: null, tempT: 0, prevX: startX, angle: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
      seed: Math.random() * 9, dead: false,
    };
    char.face(n.angle);
    this.list.push(n);
  }

  // Chegou na faixa de pedestres: decide se vai tomar café
  decide(n) {
    n.decided = true;
    if (!this.game.open) {
      // Placa FECHADO: quem queria café desiste e segue caminho
      if (n.wants) {
        n.wants = false;
        n.icon = null;
        n.tempIcon = 'sad';
        n.tempT = 2;
      }
      return;
    }
    const impulse = !n.wants && Math.random() < this.game.impulseChance();
    if (!n.wants && !impulse) return;
    if (this.queue.length >= this.game.queueCap) {
      n.wants = false;
      n.icon = null;
      n.tempIcon = 'sad';
      n.tempT = 3;
      this.game.onRejected?.(n);
      return;
    }
    if (impulse) {
      n.tempIcon = 'exclaim';
      n.tempT = 1.0;
    }
    n.wants = true;
    n.state = 'queue';
    n.waiting = false;
    this.queue.push(n);
    n.slot = this.queue.length - 1;
    n.path = this.route(n, n.slot);
    this.game.onJoin?.(n);
  }

  route(n, i) {
    const p = n.pos;
    const s = SLOTS[i];
    if (n.waiting || p.z < 0.3) return [s.clone()];
    const pts = [];
    if (p.z > 2.9) pts.push(V(CROSS_X, 2.3));
    if (i < INSIDE) {
      const nearDoor = Math.abs(p.x - DOOR_OUT.x) < 0.5 && p.z < DOOR_OUT.z + 0.1;
      if (!nearDoor) pts.push(DOOR_OUT.clone());
      for (let k = INSIDE - 1; k >= i; k--) pts.push(SLOTS[k].clone());
    } else {
      pts.push(V(s.x, 1.9), s.clone());
    }
    return pts;
  }

  reroute() {
    this.queue.forEach((n, i) => {
      if (n.slot !== i) {
        n.slot = i;
        n.path = this.route(n, i);
      }
    });
  }

  get queueLength() {
    return this.queue.length;
  }

  front() {
    const n = this.queue[0];
    return n && n.waiting && n.path.length === 0 ? n : null;
  }

  // Tira da fila e manda esperar na retirada do balcão. false se não der.
  sendToPickup(id) {
    const n = this.queue.find((q) => q.id === id);
    if (!n || this.pickup.length >= PICKUP_MAX) return false;
    this.queue.splice(this.queue.indexOf(n), 1);
    const p = n.pos;
    n.spot = PICKUP.find((s) => !this.pickup.some((m) => m.spot === s));
    n.state = 'pickup';
    n.slot = -1;
    n.atSpot = false;
    if (!n.waiting) {
      n.waiting = true;
      n.patienceMax = n.patience = this.game.patience();
    }
    // Lá fora: entra pela porta; dentro: vai para o lado oeste e depois até a bandeja
    if (p.z > 0.3) n.path = [V(-2, 1.4), V(-2, -0.6), V(-6.4, -2.5), n.spot.clone()];
    else n.path = [V(-6.4, Math.min(p.z, -2.5)), n.spot.clone()];
    this.pickup.push(n);
    this.reroute();
    return true;
  }

  // Pega um café da bandeja do balcão e vai embora (paga como se fosse servido)
  takeFromCounter(n) {
    const frac = n.patience / n.patienceMax;
    this.game.counterCups--;
    this.leaveTo(n, PICKUP_EXIT.map((v) => v.clone()));
    n.tempIcon = 'heart';
    n.tempT = 4;
    this.game.onPickup?.(n, frac);
  }

  leaveTo(n, path) {
    const idx = this.queue.indexOf(n);
    if (idx >= 0) this.queue.splice(idx, 1);
    const k = this.pickup.indexOf(n);
    if (k >= 0) this.pickup.splice(k, 1);
    n.spot = null;
    n.atSpot = false;
    n.state = 'leave';
    n.waiting = false;
    n.wants = false;
    n.icon = null;
    n.slot = -1;
    n.path = path;
    this.reroute();
  }

  serve() {
    const n = this.front();
    if (!n) return null;
    const frac = n.patience / n.patienceMax;
    this.leaveTo(n, [V(-3.2, -4.2), V(-1.4, -1.8), V(-1.4, 1.9), V(-1.4, 2.3)]);
    n.tempIcon = 'heart';
    n.tempT = 4;
    return { npc: n, frac };
  }

  angry(n) {
    const p = n.pos;
    const path = p.z < 0.3 ? [V(-1.4, p.z), V(-1.4, 1.9), V(-1.4, 2.3)] : [V(p.x, 2.3)];
    this.leaveTo(n, path);
    n.tempIcon = 'angry';
    n.tempT = 3.5;
    this.game.onAngry?.(n);
  }

  follow(n, dt) {
    let step = n.speed * dt;
    const p = n.pos;
    while (step > 0 && n.path.length) {
      const t = n.path[0];
      const dx = t.x - p.x, dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d <= step) {
        p.x = t.x;
        p.z = t.z;
        step -= d;
        n.path.shift();
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        step = 0;
      }
    }
  }

  // playerPositions: posições de todos os baristas (os clientes desviam deles)
  update(dt, playerPositions) {
    if (!(dt > 0)) return;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      if (this.list.length < this.game.maxNPCs()) this.spawn();
      this.spawnT = rand(2.5, 5.5) / (0.8 + this.game.stars * 0.15) / (this.game.spawnRate || 1);
    }

    for (const n of this.list) {
      const p = n.pos;
      const ox = p.x, oz = p.z;
      n.tempT -= dt;

      if (n.state === 'walk') {
        const dir = Math.sign(n.endX - p.x) || 1;
        p.x += dir * n.speed * dt;
        p.z += (n.laneZ - p.z) * Math.min(1, dt * 2);
        if (!n.decided && (n.prevX - CROSS_X) * (p.x - CROSS_X) <= 0) this.decide(n);
        if (Math.abs(p.x) >= END_X && Math.sign(p.x) === Math.sign(n.endX)) n.dead = true;
      } else {
        this.follow(n, dt);
        if (n.path.length === 0) {
          if (n.state === 'queue' && !n.waiting) {
            n.waiting = true;
            n.patienceMax = n.patience = this.game.patience();
          } else if (n.state === 'pickup') {
            n.atSpot = true;
          } else if (n.state === 'leave') {
            const dir = Math.random() < 0.5 ? -1 : 1;
            n.state = 'walk';
            n.north = true;
            n.endX = dir * END_X;
            n.laneZ = lane(true, dir);
          }
        }
      }

      if ((n.state === 'queue' && n.waiting) || n.state === 'pickup') {
        n.patience -= dt;
        if (n.patience <= 0) this.angry(n);
      }

      // Separação (só quem anda livre desvia)
      if (n.state !== 'queue' && n.state !== 'pickup') {
        for (const m of this.list) {
          if (m === n) continue;
          this.separate(n, m.pos, 0.65, 0.5);
        }
        for (const pp of playerPositions) this.separate(n, pp, 0.75, 1);
      }

      p.y += (groundY(p.x, p.z) - p.y) * Math.min(1, dt * 12);

      const vx = (p.x - ox) / dt, vz = (p.z - oz) / dt;
      const speed = Math.hypot(vx, vz);
      let target = n.angle;
      if (speed > 0.25) target = Math.atan2(vx, vz);
      else if (n.state === 'queue') {
        const ahead = n.slot > 0 ? SLOTS[n.slot - 1] : COUNTER;
        target = Math.atan2(ahead.x - p.x, ahead.z - p.z);
      } else if (n.state === 'pickup' && n.atSpot) target = Math.PI; // olhando para a bandeja
      n.angle = lerpAngle(n.angle, target, Math.min(1, dt * 10));
      n.char.face(n.angle);
      n.char.animate(dt, speed);
      n.prevX = p.x;
    }

    // Quem já chegou na retirada pega café da bandeja, por ordem de chegada
    for (const n of [...this.pickup]) {
      if (this.game.counterCups <= 0) break;
      if (n.atSpot) this.takeFromCounter(n);
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      if (!n.dead) continue;
      this.scene.remove(n.char.root);
      n.el.remove();
      this.list.splice(i, 1);
    }
  }

  separate(n, q, min, k) {
    const dx = n.pos.x - q.x, dz = n.pos.z - q.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-6) return;
    const d = Math.sqrt(d2);
    const push = (min - d) * k;
    const side = n.id % 2 ? 1 : -1;
    n.pos.x += (dx / d) * push - (dz / d) * push * 0.4 * side;
    n.pos.z += (dz / d) * push + (dx / d) * push * 0.4 * side;
  }

  updateOverlay(project, ps, time) {
    for (const n of this.list) renderBubble(n, project, ps, time);
  }

  // Estado compacto para a rede (host → parceiro)
  toNet() {
    const r = (v) => Math.round(v * 100) / 100;
    return this.list.map((n) => [
      n.id, n.sheet, r(n.pos.x), r(n.pos.z), r(n.angle), NPC_STATES.indexOf(n.state),
      (n.wants ? 1 : 0) | (n.decided ? 2 : 0) | (n.waiting ? 4 : 0),
      r(Math.max(0, n.patience / n.patienceMax)), n.icon, n.tempT > 0 ? n.tempIcon : null,
      r(Math.max(0, n.tempT)), r(n.seed), n.slot,
    ]);
  }
}
