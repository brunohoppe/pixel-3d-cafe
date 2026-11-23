import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, lerpAngle, resolveCircle, groundY, box } from './util.js';
import { buildWorld, makeCup } from './world.js';
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

// ------------------------------------------------------------------ Render
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86c45f);

const VIEW = 15;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 140);
const camOffset = new THREE.Vector3(0, 22, 16);
const camTarget = new THREE.Vector3(4, 0, 0);

const composer = new EffectComposer(renderer);
const pixelPass = new RenderPixelatedPass(4, scene, camera, { normalEdgeStrength: 0.35, depthEdgeStrength: 0.45 });
composer.addPass(pixelPass);
composer.addPass(new OutputPass());

let iconPx = 2;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  const ps = Math.max(2, Math.round(h / 250));
  pixelPass.setPixelSize(ps);
  document.documentElement.style.setProperty('--px', `${ps}px`);
  iconPx = Math.max(2, Math.round(ps * 0.67));
  document.documentElement.style.setProperty('--ipx', `${iconPx}px`);
  const a = w / h;
  camera.left = (-VIEW * a) / 2;
  camera.right = (VIEW * a) / 2;
  camera.top = VIEW / 2;
  camera.bottom = -VIEW / 2;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Luz
scene.add(new THREE.HemisphereLight(0xfff6e8, 0x7a9a6a, 1.35));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

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
  char: createCharacter({
    skin: 0xf2c7a5, shirt: 0xf4f4f4, pants: 0x2f3b5c, hair: 0x4a2c1a, shoes: 0x6b3e22,
    apron: 0x7a4a2a, hat: 0x2e8b57,
  }),
  vel: new THREE.Vector3(),
  angle: 0,
};
player.char.root.position.set(6, 0.12, 1.8);
scene.add(player.char.root);
const tray = new THREE.Group();
tray.position.set(0, 0.86, 0.46);
player.char.body.add(tray);
box(tray, 0.6, 0.04, 0.4, 0x9aa0ad, 0, 0, 0);
const trayCups = [[-0.12, -0.08], [0.12, -0.08], [-0.12, 0.09], [0.12, 0.09]].map(([x, z]) => {
  const c = makeCup(0.85);
  c.position.set(x, 0.04, z);
  tray.add(c);
  return c;
});

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
addEventListener('wheel', (e) => {
  camera.zoom = clamp(camera.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.7, 1.6);
  camera.updateProjectionMatrix();
}, { passive: true });
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

const _v = new THREE.Vector3();
function project(pos, yOff) {
  _v.set(pos.x, pos.y + yOff, pos.z).project(camera);
  const ps = pixelPass.pixelSize;
  const x = ((_v.x + 1) / 2) * innerWidth;
  const y = ((1 - _v.y) / 2) * innerHeight;
  return { x: Math.round(x / ps) * ps, y: Math.round(y / ps) * ps, on: _v.x > -1.15 && _v.x < 1.15 && _v.y > -1.15 && _v.y < 1.25 };
}

function updateOverlay(dt, time) {
  const ps = pixelPass.pixelSize;
  npcs.updateOverlay(project, iconPx, time);

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
    const s = project(machine.pos, 2.25);
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
  let ix = 0, iz = 0;
  if (started) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  }
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
  player.char.root.rotation.y = player.angle;
  player.char.carry = game.carry > 0;
  tray.visible = game.carry > 0;
  trayCups.forEach((c, i) => (c.visible = i < game.carry));
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

let fade = 1;
function updateFade(dt) {
  const p = player.char.root.position;
  const inside = p.x > -9.6 && p.x < 5.6 && p.z > -16 && p.z < 0.25;
  fade = clamp(fade + (inside ? -dt : dt) * 5, 0, 1);
  for (const m of world.fadeMats) m.opacity = fade;
  world.fadeGroup.visible = fade > 0.15;
}

const right = new THREE.Vector3(), up = new THREE.Vector3();
function updateCamera(dt) {
  const p = player.char.root.position;
  camTarget.x += (p.x - camTarget.x) * (1 - Math.exp(-dt * 5));
  camTarget.z += (p.z - 1 - camTarget.z) * (1 - Math.exp(-dt * 5));
  camera.position.copy(camTarget).add(camOffset);
  camera.lookAt(camTarget);
  camera.updateMatrixWorld();
  // Encaixa a câmera na grade de pixels (sem tremedeira)
  const wpp = (camera.top - camera.bottom) / camera.zoom / pixelPass.renderResolution.y;
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  const rr = camera.position.dot(right), uu = camera.position.dot(up);
  camera.position.addScaledVector(right, Math.round(rr / wpp) * wpp - rr);
  camera.position.addScaledVector(up, Math.round(uu / wpp) * wpp - uu);
  camera.updateMatrixWorld();

  sun.position.set(camTarget.x - 12, 26, camTarget.z + 9);
  sun.target.position.copy(camTarget);
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
  composer.render(dt);
  updateOverlay(dt, simTime);
  updateHUD();
  requestAnimationFrame(frame);
}
updateCamera(1);
frame();
