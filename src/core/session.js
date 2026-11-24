import * as THREE from 'three';
import { buildWorld } from '../world.js';
import { Garden } from '../garden.js';
import { NPCManager } from '../npc.js';
import { Particles } from '../particles.js';
import { PixelRenderer } from '../pixelRenderer.js';
import { CONFIG } from '../config.js';
import { sfx, initAudio } from '../audio.js';
import { createGameState, addRep } from './state.js';
import { createFx } from './fx.js';
import { Player } from './player.js';
import { Machine } from './machine.js';
import { buildInteractables, findInteractable, chargeCustomer } from './interactions.js';
import { createOrdersMenu } from './orders.js';
import { createPhone } from './phone.js';
import { Hud } from './hud.js';
import { createFade } from './fade.js';

// Posição inicial de cada barista
export const SPAWN = { host: [6, 1.8], guest: [7.4, 1.8] };

/**
 * Monta uma partida completa.
 * mode: 'solo' | 'host' (simula e manda snapshots) | 'client' (só desenha o que recebe)
 */
export function createSession({
  mode = 'solo', coop = false, localId = 'host', localSheet = 'player',
  titleScreen = false, makeNpcs = null, keepAliveInBackground = false,
} = {}) {
  const sim = mode !== 'client';

  // ---------- Render e cena
  const pix = new PixelRenderer(document.getElementById('app'));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x78bb52);
  // Luz simples, sem mapa de sombras (as sombras são elipses sólidas)
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a9a7a, 1.0));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sun.position.set(0.05, 1, 0.6);
  scene.add(sun);

  const world = buildWorld(scene);
  const garden = new Garden(scene);
  if (sim) {
    garden.plots[3].state = 'ready';
    garden.plots[3].g = 1;
    garden.plots[4].state = 'growing';
    garden.plots[4].g = 0.6;
  }
  const particles = new Particles(scene);
  const hud = new Hud(pix);
  const game = createGameState({ coop });

  const vec = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  const fx = createFx(localId, (e) => {
    if (e.k === 'sfx') sfx[e.name]?.();
    else if (e.k === 'toast') hud.toast(e.text, e.kind);
    else if (e.k === 'float') hud.float(vec(e.p), e.text, e.color);
    else if (e.k === 'burst') particles.burst(vec(e.p), e.color, e.n, e.opts);
  });

  const S = {
    mode, coop, pix, scene, world, garden, particles, hud, game, fx,
    players: new Map(), simTime: 0, started: !titleScreen, current: null,
    requestAction: null, // (interativo) → executa ou pede ao host
    clientStep: null, // cliente: aplica snapshots
    afterFrame: null, // rede
    autoInput: null, // (input) → input substituto ou null (debug: clique para andar)
  };

  S.addPlayer = (id, sheet) => {
    const [x, z] = SPAWN[id] || SPAWN.host;
    const p = new Player(id, sheet, scene, x, z);
    S.players.set(id, p);
    return p;
  };
  S.removePlayer = (id) => {
    const p = S.players.get(id);
    if (p) p.remove();
    S.players.delete(id);
  };
  S.partner = () => [...S.players.values()].find((p) => p !== S.local) || null;

  const local = S.addPlayer(localId, localSheet);
  S.local = local;

  // ---------- Clientes
  const npcs = makeNpcs ? makeNpcs(scene, hud.overlay) : new NPCManager(scene, hud.overlay, game);
  S.npcs = npcs;
  if (sim) {
    let lastReject = 0;
    game.onAngry = (n) => {
      addRep(game, -7, fx);
      game.lost++;
      fx.toast('Cliente desistiu de esperar!', 'red');
      fx.float(n.pos, '-rep', '#e8424f');
      fx.sfx('angry');
    };
    game.onRejected = () => {
      if (S.simTime - lastReject > 6) fx.toast('Fila cheia! Um cliente foi embora', 'orange');
      lastReject = S.simTime;
    };
    game.onJoin = () => fx.sfx('join');
    game.onPickup = (n, frac) => chargeCustomer(game, fx, n, frac); // retirou café da bandeja
  }

  const machine = new Machine(world, particles);
  S.machine = machine;
  const interactables = buildInteractables({ game, machine, garden, npcs, fx });
  S.interactables = interactables;
  S.requestAction = (it, arg) => it.action(local, arg);
  // Telas locais abertas por interativos com `ui`
  S.ui = { orders: createOrdersMenu(S) };
  S.phone = createPhone(S); // celular no HUD: app de pedidos de qualquer lugar
  // Usar um interativo (tecla E ou clique do debug): age ou abre a tela dele
  S.use = (it) => {
    const l = it.label(local);
    if (!l || l.off) return sfx.deny();
    if (it.ui) S.ui[it.ui]?.open(it);
    else S.requestAction(it);
  };
  const fade = createFade(world);

  // ---------- Entrada
  const keys = new Set();
  function start() {
    if (S.started) return;
    S.started = true;
    initAudio();
    document.getElementById('start')?.classList.add('hidden');
    hud.toast('Bem-vindo! Abra a cafeteria pondo o cavalete na calçada', 'gold');
  }
  S.start = start;
  const POSTER_STEPS = [0, 4, 5, 6];
  addEventListener('keydown', (e) => {
    if (!S.started) return start();
    keys.add(e.code);
    if (e.repeat) return;
    const menu = S.ui.orders, phone = S.phone;
    const digit = /^Digit[1-9]$/.test(e.code) ? +e.code.slice(5) - 1 : -1;
    if (menu.isOpen && (e.code === 'Escape' || digit >= 0)) {
      if (e.code === 'Escape') menu.close();
      else menu.choose(digit);
    } else if (phone.appOpen && digit >= 0) {
      phone.choose(digit);
    } else if (phone.isOpen && e.code === 'Escape') {
      phone.close();
    } else if (e.code === 'KeyC') {
      phone.toggle();
    } else if (e.code === 'KeyE' || e.code === 'Space') {
      e.preventDefault();
      if (menu.isOpen) menu.close();
      else if (S.current) S.use(S.current.it);
    } else if (e.code === 'KeyO') {
      CONFIG.outline = !CONFIG.outline;
      hud.toast(`Contorno: ${CONFIG.outline ? 'ligado' : 'desligado'}`);
    } else if (e.code === 'KeyP') {
      const i = (POSTER_STEPS.indexOf(CONFIG.posterizeLevels) + 1) % POSTER_STEPS.length;
      CONFIG.posterizeLevels = POSTER_STEPS[i];
      hud.toast(`Posterize: ${CONFIG.posterizeLevels || 'desligado'}`);
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  // Zoom em degraus inteiros (mantém 1 texel = 1 pixel)
  addEventListener('wheel', (e) => {
    pix.setZoom(Math.max(-1, Math.min(2, pix.zoom + (e.deltaY > 0 ? -1 : 1))));
  }, { passive: true });
  document.getElementById('start')?.addEventListener('pointerdown', () => start());

  function readInput() {
    let sx = 0, sy = 0;
    if (S.started) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) sy += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) sy -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) sx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) sx += 1;
    }
    const input = { sx, sy, run: keys.has('ShiftLeft') || keys.has('ShiftRight') };
    // Gancho opcional (módulo de debug): pode substituir o movimento, ex.: andar até um clique
    return (S.started && S.autoInput?.(input)) || input;
  }

  function obstaclesFor(p) {
    const list = npcs.list.map((n) => n.pos);
    for (const o of S.players.values()) if (o !== p) list.push(o.pos);
    return list;
  }

  // ---------- Passo de simulação
  S.step = (dt) => {
    S.simTime += dt;
    local.move(dt, readInput(), obstaclesFor(local));
    for (const p of S.players.values()) if (p !== local) p.followNet(dt);
    if (sim) {
      npcs.update(dt, [...S.players.values()].map((p) => p.pos));
      garden.tick(dt);
      machine.tick(dt, fx);
    } else S.clientStep?.(dt);
    garden.render(S.simTime);
    machine.render(dt, S.simTime);
    world.counterCups.forEach((c, i) => (c.visible = i < game.counterCups));
    world.door.update(dt, [...[...S.players.values()].map((p) => p.pos), ...npcs.list.map((n) => n.pos)], game.open);
    particles.update(dt);
    fade(dt, local.pos);
    for (const p of S.players.values()) p.render(dt);
  };

  // ---------- Câmera (cada um segue o próprio barista)
  const camTarget = new THREE.Vector3(local.pos.x, 0, local.pos.z);
  function updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 5);
    camTarget.x += (local.pos.x - camTarget.x) * k;
    camTarget.z += (local.pos.z - camTarget.z) * k;
    pix.follow(camTarget);
    for (const p of S.players.values()) p.char.snap();
    for (const n of npcs.list) n.char.snap();
  }

  function advance(raw) {
    if (mode === 'solo') {
      const dt = Math.max(1e-4, Math.min(0.05, raw));
      S.step(dt);
      return dt;
    }
    // Co-op: não perde tempo em quedas de FPS (sub-passos de até 50 ms)
    let left = Math.min(raw, 1);
    const total = Math.max(1e-4, left);
    while (left > 1e-4) {
      const h = Math.min(0.05, left);
      S.step(h);
      left -= h;
    }
    return total;
  }

  const clock = new THREE.Clock();
  function frame() {
    const dt = advance(clock.getDelta());
    updateCamera(dt);
    pix.render(scene);
    npcs.updateOverlay(hud.project, pix.pixelCss, S.simTime);
    S.current = S.started ? findInteractable(interactables, local) : null;
    S.ui.orders.update();
    S.phone.update();
    hud.update(dt, { game, player: local, partner: S.partner(), npcs, machine, garden, current: S.current, coop });
    S.afterFrame?.(dt);
    requestAnimationFrame(frame);
  }

  S.run = () => {
    updateCamera(1);
    frame();
    // Host com a aba em segundo plano: continua simulando (o rAF para quando a aba some)
    if (keepAliveInBackground) {
      setInterval(() => {
        if (!document.hidden) return;
        const dt = advance(clock.getDelta());
        S.afterFrame?.(dt);
      }, 50);
    }
  };

  return S;
}
