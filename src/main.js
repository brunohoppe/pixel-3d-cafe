import * as THREE from 'three';
import { clamp, lerpAngle, resolveCircle, groundY, setFade } from './util.js';
import { buildWorld } from './world.js';
import { PixelRenderer } from './pixelRenderer.js';
import { CAM } from './sprites.js';
import { CONFIG } from './config.js';
import { createCharacter } from './character.js';
import { Garden } from './garden.js';
import { NPCManager } from './npc.js';
import { Particles } from './particles.js';
import { icon } from './icons.js';
import { sfx, initAudio } from './audio.js';

// ------------------------------------------------------------------ Estado do jogo
const game = {
  money: 0, beans: 2, carry: 0, rep: 10, served: 0, lost: 0, maxCarry: 4,
  get stars() { return clamp(1 + Math.floor(this.rep / 20), 1, 5); },
  get queueCap() { return this.stars * 5; }, // 5 clientes por estrela
  wantChance() { return 0.22 + 0.05 * this.stars; },
  impulseChance() { return 0.06 + 0.05 * this.stars; },
  maxNPCs() { return 7 + this.stars * 2; },
  patience() { return 75 - this.stars * 5; },
};

function addRep(d) {
  const before = game.stars;
  game.rep = clamp(game.rep + d, 0, 100);
  const after = game.stars;
  if (after > before) {
    toast(`Nova estrela! ${after}★ — fila máx ${game.queueCap}`, 'gold');
    sfx.star();
  } else if (after < before) {
    toast(`Perdeu uma estrela... ${after}★`, 'red');
  }
}

// ------------------------------------------------------------------ Render (pixel art)
const pix = new PixelRenderer(document.getElementById('app'));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x78bb52);
const camTarget = new THREE.Vector3(6, 0, 1.8);

// Luz simples, sem mapa de sombras (as sombras são elipses sólidas).
// Topo claro, frente média, lateral escura — o toon divide em faixas.
scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a9a7a, 1.0));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
sun.position.set(0.05, 1, 0.6);
scene.add(sun);

// ------------------------------------------------------------------ Mundo
const world = buildWorld(scene);
const garden = new Garden(scene);
garden.plots[3].state = 'ready';
garden.plots[3].g = 1;
garden.plots[4].state = 'growing';
garden.plots[4].g = 0.6;
const particles = new Particles(scene);
const overlay = document.getElementById('overlay');

// Jogador (barista)
const player = {
  char: createCharacter('player', { tray: true }),
  vel: new THREE.Vector3(),
  angle: 0,
};
player.char.root.position.set(6, 0.12, 1.8);
scene.add(player.char.root);

// NPCs
game.onAngry = (n) => {
  addRep(-7);
  game.lost++;
  toast('Cliente desistiu de esperar!', 'red');
  floatText(n.pos, '-rep', '#e8424f');
  sfx.angry();
};
let lastReject = 0;
game.onRejected = () => {
  if (clock.elapsedTime - lastReject > 6) toast('Fila cheia! Um cliente foi embora', 'orange');
  lastReject = clock.elapsedTime;
};
game.onJoin = () => sfx.join();
const npcs = new NPCManager(scene, overlay, game);

// Cafeteira
const machine = { brewing: false, t: 0, dur: 4, ready: 0, max: 4, pos: new THREE.Vector3(-5, 0.12, -10.4) };

// ------------------------------------------------------------------ Interações
const interactables = [];

interactables.push({
  pos: machine.pos, r: 2.0, py: 2.9,
  state() {
    const canPick = machine.ready > 0 && game.carry < game.maxCarry;
    const canBrew = !machine.brewing && game.beans > 0 && machine.ready - (canPick ? Math.min(machine.ready, game.maxCarry - game.carry) : 0) <= machine.max - 2;
    return { canPick, canBrew };
  },
  label() {
    const { canPick, canBrew } = this.state();
    if (canPick && canBrew) return { text: 'Pegar café + preparar mais' };
    if (canPick) return { text: `Pegar café (${machine.ready})` };
    if (canBrew) return { text: 'Fazer café (1 grão = 2)' };
    if (machine.brewing) return { text: `Preparando... ${Math.floor((machine.t / machine.dur) * 100)}%`, off: true };
    if (machine.ready > 0) return { text: 'Mãos cheias!', off: true };
    return { text: 'Sem grãos — colha na horta', off: true };
  },
  action() {
    const { canPick, canBrew } = this.state();
    if (canPick) {
      const n = Math.min(machine.ready, game.maxCarry - game.carry);
      machine.ready -= n;
      game.carry += n;
      sfx.pick();
      floatText(player.char.root.position, `+${n} café`, '#f4ead8');
    }
    if (canBrew) {
      game.beans--;
      machine.brewing = true;
      machine.t = 0;
      sfx.brew();
    }
    if (!canPick && !canBrew) sfx.deny();
  },
});

interactables.push({
  pos: new THREE.Vector3(-4.5, 0.12, -7), r: 2.0, py: 1.9,
  label() {
    if (!npcs.front()) return null;
    if (game.carry <= 0) return { text: 'Cliente esperando — pegue café', off: true };
    return { text: 'Servir café' };
  },
  action() {
    if (!npcs.front() || game.carry <= 0) return sfx.deny();
    const { npc, frac } = npcs.serve();
    game.carry--;
    const tip = Math.round(4 * frac);
    game.money += 5 + tip;
    game.served++;
    addRep(4 + Math.round(3 * frac));
    sfx.serve();
    floatText(npc.pos, tip > 0 ? `+$${5 + tip} (gorjeta!)` : '+$5', '#ffd34e');
  },
});

for (const p of garden.plots) {
  interactables.push({
    pos: p.pos, r: 2.1, py: 1.4,
    label() {
      const pct = Math.floor(p.g * 100);
      if (p.state === 'empty') return { text: 'Plantar café' };
      if (p.state === 'ready') return { text: 'Colher (+2 grãos)' };
      if (!p.watered) return { text: `Regar (${pct}%)` };
      return { text: `Crescendo... ${pct}%`, off: true };
    },
    action() {
      if (p.state === 'empty') {
        garden.plant(p);
        sfx.plant();
        particles.burst(p.pos, 0x5c3820, 10, { y: 0.3 });
      } else if (p.state === 'ready') {
        garden.harvest(p);
        game.beans += 2;
        sfx.harvest();
        particles.burst(p.pos, 0xd8322a, 12, { y: 0.6 });
        floatText(p.pos, '+2 grãos', '#f4ead8');
      } else if (!p.watered) {
        garden.water(p);
        sfx.water();
        particles.burst(p.pos, 0x5b9be8, 14, { y: 1.4, up: 1, grav: 9 });
      } else sfx.deny();
    },
  });
}

let current = null;
function findInteractable() {
  const pp = player.char.root.position;
  let best = null, bestD = Infinity;
  for (const it of interactables) {
    const d = Math.hypot(it.pos.x - pp.x, it.pos.z - pp.z);
    if (d > it.r || d >= bestD) continue;
    const l = it.label();
    if (!l) continue;
    best = { it, l };
    bestD = d;
  }
  return best;
}

// ------------------------------------------------------------------ Input
const keys = new Set();
let started = false;
addEventListener('keydown', (e) => {
  if (!started) return start();
  keys.add(e.code);
  if ((e.code === 'KeyE' || e.code === 'Space') && !e.repeat) {
    e.preventDefault();
    if (current && !current.l.off) current.it.action();
    else if (current) sfx.deny();
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
// Zoom em degraus inteiros (mantém 1 texel = 1 pixel)
addEventListener('wheel', (e) => {
  pix.setZoom(clamp(pix.zoom + (e.deltaY > 0 ? -1 : 1), -1, 2));
}, { passive: true });
// Ajustes visuais ao vivo
const POSTER_STEPS = [0, 4, 5, 6];
addEventListener('keydown', (e) => {
  if (!started || e.repeat) return;
  if (e.code === 'KeyO') {
    CONFIG.outline = !CONFIG.outline;
    toast(`Contorno: ${CONFIG.outline ? 'ligado' : 'desligado'}`);
  } else if (e.code === 'KeyP') {
    const i = (POSTER_STEPS.indexOf(CONFIG.posterizeLevels) + 1) % POSTER_STEPS.length;
    CONFIG.posterizeLevels = POSTER_STEPS[i];
    toast(`Posterize: ${CONFIG.posterizeLevels || 'desligado'}`);
  }
});
document.getElementById('start').addEventListener('pointerdown', () => start());

function start() {
  if (started) return;
  started = true;
  initAudio();
  document.getElementById('start').classList.add('hidden');
  toast('Bem-vindo! Colha café na horta →', 'gold');
}

// ------------------------------------------------------------------ UI
const $ = (id) => document.getElementById(id);
const promptEl = $('prompt');
const machineBar = $('machineBar');
const starEls = [...$('stars').children];
const ui = {};
$('icoCoin').src = icon('coin').url;
$('icoBean').src = icon('bean').url;
$('icoCup').src = icon('cup').url;

function setText(id, v) {
  if (ui[id] !== v) {
    ui[id] = v;
    $(id).textContent = v;
  }
}

function toast(text, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = text;
  const box = $('toasts');
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => t.classList.add('out'), 2400);
  setTimeout(() => t.remove(), 2900);
}

const floaters = [];
function floatText(pos, text, color) {
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.color = color;
  overlay.appendChild(el);
  floaters.push({ el, pos: pos.clone(), t: 0 });
}

function objective() {
  if (game.carry > 0) return npcs.front() ? 'Sirva o cliente no BALCÃO' : 'Aguarde um cliente no balcão';
  if (machine.ready > 0) return 'Pegue o café na CAFETEIRA';
  if (machine.brewing) return 'Preparando café...';
  if (game.beans > 0) return 'Use a CAFETEIRA atrás do balcão';
  if (garden.plots.some((p) => p.state === 'ready')) return 'Colha os grãos na HORTA';
  return 'Plante e regue café na HORTA';
}

function updateHUD() {
  const s = game.stars;
  starEls.forEach((el, i) => {
    const src = icon(i < s ? 'star' : 'starOff').url;
    if (el.dataset.src !== src) {
      el.src = src;
      el.dataset.src = src;
    }
  });
  const prog = s >= 5 ? Math.min(1, (game.rep - 80) / 20) : (game.rep % 20) / 20;
  $('repFill').style.width = `${prog * 100}%`;
  setText('queueInfo', `Fila ${npcs.queue.length}/${game.queueCap}`);
  setText('money', `$${game.money}`);
  setText('beans', `${game.beans}`);
  setText('cups', `${game.carry}/${game.maxCarry}`);
  setText('served', `Atendidos ${game.served}`);
  setText('objective', objective());
}

const project = (pos, yOff) => pix.project(pos, yOff);

function updateOverlay(dt, time) {
  npcs.updateOverlay(project, pix.pixelCss, time);

  current = started ? findInteractable() : null;
  if (current) {
    const s = project(current.it.pos, current.it.py);
    promptEl.style.display = 'block';
    promptEl.classList.toggle('off', !!current.l.off);
    if (promptEl.dataset.t !== current.l.text) {
      promptEl.dataset.t = current.l.text;
      promptEl.innerHTML = `${current.l.off ? '' : '<span class="key">E</span>'}${current.l.text}`;
    }
    promptEl.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
  } else promptEl.style.display = 'none';

  if (machine.brewing || machine.ready > 0) {
    const s = project(machine.pos, 2.4);
    machineBar.style.display = 'block';
    machineBar.firstElementChild.style.width = `${machine.brewing ? (machine.t / machine.dur) * 100 : 100}%`;
    machineBar.classList.toggle('done', !machine.brewing);
    machineBar.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
  } else machineBar.style.display = 'none';

  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    const s = project(f.pos, 2.4 + f.t * 1.2);
    f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    f.el.style.opacity = String(Math.min(1, 2.2 - f.t * 1.6));
    if (f.t > 1.4) {
      f.el.remove();
      floaters.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------------ Loop
function updatePlayer(dt) {
  // Entrada relativa à tela: W = para cima na tela (câmera isométrica)
  let sx = 0, sy = 0;
  if (started) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) sy += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) sy -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) sx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) sx += 1;
  }
  let ix = sx * CAM.groundRight.x + sy * CAM.groundUp.x;
  let iz = sx * CAM.groundRight.y + sy * CAM.groundUp.y;
  const len = Math.hypot(ix, iz);
  if (len) { ix /= len; iz /= len; }
  const sp = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6.2 : 4.0;
  const k = 1 - Math.exp(-dt * 12);
  player.vel.x += (ix * sp - player.vel.x) * k;
  player.vel.z += (iz * sp - player.vel.z) * k;

  const p = player.char.root.position;
  p.x += player.vel.x * dt;
  p.z += player.vel.z * dt;
  for (const n of npcs.list) {
    const dx = p.x - n.pos.x, dz = p.z - n.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6 && d > 1e-4) {
      p.x += (dx / d) * (0.6 - d);
      p.z += (dz / d) * (0.6 - d);
    }
  }
  resolveCircle(p, 0.35);
  p.x = clamp(p.x, -44, 44);
  p.z = clamp(p.z, -15, 12.3);
  p.y += (groundY(p.x, p.z) - p.y) * Math.min(1, dt * 15);

  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (speed > 0.3) player.angle = lerpAngle(player.angle, Math.atan2(player.vel.x, player.vel.z), 1 - Math.exp(-dt * 14));
  player.char.face(player.angle);
  player.char.trayCount = game.carry;
  player.char.animate(dt, speed);
}

let steamT = 0, chimneyT = 0;
function updateMachine(dt) {
  if (machine.brewing) {
    machine.t += dt;
    steamT -= dt;
    if (steamT <= 0) {
      steamT = 0.08;
      const s = world.machine.steamPos;
      particles.spawn(s.x + (Math.random() - 0.5) * 0.5, s.y, s.z, 0, 1.2, 0, 0.9, 0.13, 0xf4f4f4, -0.3);
    }
    if (machine.t >= machine.dur) {
      machine.brewing = false;
      machine.ready = Math.min(machine.max, machine.ready + 2);
      sfx.ready();
      floatText(machine.pos, 'Café pronto!', '#ffd34e');
    }
  }
  world.machine.cups.forEach((c, i) => (c.visible = i < machine.ready));
  const lm = world.machine.lightMat;
  const col = machine.brewing ? (Math.floor(clock.elapsedTime * 4) % 2 ? 0xffb84e : 0x7a4a1a) : machine.ready > 0 ? 0x5bff7b : 0xe8424f;
  lm.color.setHex(col);
  lm.emissive.setHex(col);

  chimneyT -= dt;
  if (chimneyT <= 0 && world.fadeGroup.visible) {
    chimneyT = machine.brewing ? 0.15 : 0.6;
    const c = world.chimneyPos;
    particles.spawn(c.x + (Math.random() - 0.5) * 0.3, c.y, c.z, 0.3, 0.9, 0.1, 2.2, 0.28, 0xe8e8ee, -0.05);
  }
}

// Paredes/telhado/árvores que tapam o jogador somem com pontilhado (dither)
const ray = new THREE.Ray();
const rayO = new THREE.Vector3();
let fade = 1;
function updateFade(dt) {
  const p = player.char.root.position;
  const inside = p.x > -9.2 && p.x < 5.2 && p.z > -12.2 && p.z < 0.25;
  ray.set(rayO.set(p.x, p.y + 0.7, p.z), CAM.toCam);
  const behind = !inside && ray.intersectsBox(world.cafeBox);
  const target = inside ? 0 : behind ? 0.4 : 1;
  fade += clamp(target - fade, -dt * 4, dt * 4);
  const f = Math.round(fade * 16) / 16;
  for (const m of world.fadeMats) setFade(m, f);
  for (const m of world.shellMats) setFade(m, behind ? Math.max(f, 0.4) : 1);
  world.fadeGroup.visible = f > 0.01;
  for (const o of world.occluders) {
    const hit = ray.intersectsBox(o.box);
    if (hit !== o.on) {
      o.on = hit;
      for (const m of o.meshes) m.material = hit ? o.faded : o.solid;
    }
  }
}

function updateCamera(dt) {
  const p = player.char.root.position;
  const k = 1 - Math.exp(-dt * 5);
  camTarget.x += (p.x - camTarget.x) * k;
  camTarget.z += (p.z - camTarget.z) * k;
  pix.follow(camTarget);
  // Sprites presos à grade de pixels do render target
  player.char.snap();
  for (const n of npcs.list) n.char.snap();
}

const clock = new THREE.Clock();
let simTime = 0;
function step(dt) {
  simTime += dt;
  updatePlayer(dt);
  npcs.update(dt, player.char.root.position);
  garden.update(dt, simTime);
  updateMachine(dt);
  particles.update(dt);
  updateFade(dt);
}
function frame() {
  const dt = Math.max(1e-4, Math.min(0.05, clock.getDelta()));
  step(dt);
  updateCamera(dt);
  pix.render(scene);
  updateOverlay(dt, simTime);
  updateHUD();
  requestAnimationFrame(frame);
}
updateCamera(1);
frame();
