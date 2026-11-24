import * as THREE from 'three';
import { box, mat, uniqueMat, tmat, tex, decorate, setFade, solid, solidBox, rng, gradientMap } from './util.js';
import { makeSprite, blob, pixelSnapOffset } from './sprites.js';
import { CONFIG } from './config.js';

const T = CONFIG.texel;

// Plano com textura PNG inteira (letreiros); w/h em pixels da textura
function signPlane(parent, name, pw, ph, x, y, z, material) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(pw * T, ph * T),
    material || decorate(new THREE.MeshToonMaterial({ map: tex(name), gradientMap: gradientMap() })),
  );
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function snapped(x, y, z) {
  const p = new THREE.Vector3(x, y, z);
  return p.add(pixelSnapOffset(p, new THREE.Vector3()));
}

// Xícara de café pequena (usada na máquina)
export function makeCup(s = 1) {
  const g = new THREE.Group();
  box(g, 0.16 * s, 0.17 * s, 0.16 * s, 0xf7f2ea, 0, 0, 0);
  box(g, 0.12 * s, 0.01, 0.12 * s, 0x5a3220, 0, 0.17 * s, 0, { cast: false });
  box(g, 0.04 * s, 0.09 * s, 0.05 * s, 0xf7f2ea, 0.1 * s, 0.04 * s, 0);
  return g;
}

export function buildWorld(scene) {
  const R = rng(1337);
  const r = (a, b) => a + R() * (b - a);
  const occluders = [];

  const reserved = [
    [-11, 7, -13.5, 0.6],
    [6, 18.5, -12, -0.4],
    [-80, 80, -0.4, 12.2],
  ];
  const free = (x, z, pad = 0) => !reserved.some(([x0, x1, z0, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);

  // ---------- Chão de grama
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), tmat('grass'));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  buildStreet(scene);
  const cafe = buildCafe(scene);
  buildGarden(scene);

  // ---------- Árvores e arbustos (sprites)
  const treeProto = [0, 1].map((v) => {
    const solidS = makeSprite('tree', 32, 40, 2, 1);
    solidS.setFrame(v, 0);
    const fadedS = makeSprite('tree', 32, 40, 2, 1);
    fadedS.setFrame(v, 0);
    setFade(fadedS.material, 0.35);
    return { geo: solidS.mesh.geometry, solid: solidS.material, faded: fadedS.material };
  });
  const bushProto = [0, 1].map((v) => {
    const s = makeSprite('bush', 16, 12, 2, 1);
    s.setFrame(v, 0);
    return s;
  });

  const trees = [];
  const addTree = (x, z) => {
    if (!free(x, z, 1.4) || !trees.every(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 > 6)) return;
    trees.push([x, z]);
    const v = R() < 0.6 ? 0 : 1;
    const p = treeProto[v];
    const m = new THREE.Mesh(p.geo, p.solid);
    m.position.copy(snapped(x, 0, z));
    m.rotation.y = CONFIG.camYaw * (Math.PI / 180);
    scene.add(m);
    blob(scene, 1.9, 0.95, x, 0.012, z);
    solidBox(x, z, 0.5, 0.5);
    occluders.push({
      box: new THREE.Box3(new THREE.Vector3(x - 0.9, 0, z - 0.9), new THREE.Vector3(x + 0.9, 2.6, z + 0.9)),
      meshes: [m], solid: p.solid, faded: p.faded, on: false,
    });
  };
  for (let x = -46; x <= 46; x += r(3, 5)) addTree(x + r(-1, 1), r(15.5, 19));
  for (let x = -46; x <= 46; x += r(3, 5)) addTree(x + r(-1, 1), r(-15.5, -20));
  for (let i = 0; i < 50; i++) addTree(r(-46, -12), r(-13, -2));
  for (let i = 0; i < 50; i++) addTree(r(21, 46), r(-13, -2));
  for (let i = 0; i < 70; i++) {
    const x = r(-46, 46), z = r(-20, 20);
    if (!free(x, z, 0.8) || !trees.every(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 > 2.5)) continue;
    const s = bushProto[R() < 0.5 ? 0 : 1];
    const m = new THREE.Mesh(s.mesh.geometry, s.material);
    m.position.copy(snapped(x, 0, z));
    m.rotation.y = s.mesh.rotation.y;
    scene.add(m);
    blob(scene, 0.95, 0.45, x, 0.012, z);
    solidBox(x, z, 0.7, 0.5);
  }

  return { ...cafe, occluders };
}

// ------------------------------------------------------------------ RUA
function buildStreet(scene) {
  box(scene, 160, 0.03, 6, tmat('asphalt'), 0, 0, 6, { cast: false });
  for (let x = -78; x < 78; x += 3) {
    if (Math.abs(x + 2) < 2.5) continue;
    box(scene, 1.4, 0.01, 0.16, 0xf3d36b, x, 0.03, 6, { cast: false });
  }
  for (let i = 0; i < 6; i++) box(scene, 2.4, 0.01, 0.55, 0xf2f2f2, -2, 0.03, 3.5 + i, { cast: false });

  box(scene, 160, 0.12, 3, tmat('sidewalk'), 0, 0, 1.5, { cast: false });
  box(scene, 160, 0.14, 0.2, 0xa49b8a, 0, 0, 2.95, { cast: false });
  box(scene, 160, 0.12, 2.6, tmat('sidewalk'), 0, 0, 10.3, { cast: false });
  box(scene, 160, 0.14, 0.2, 0xa49b8a, 0, 0, 9.05, { cast: false });

  for (const x of [-30, -18, -9, 6, 19, 32]) lamp(scene, x, 2.72);
  for (const x of [-24, -12, 3, 16, 28]) lamp(scene, x, 9.35, Math.PI);

  for (const x of [-15, 9, 23]) bench(scene, x, 11.2);
  bin(scene, 0.7, 0.45);
  bin(scene, -9.5, 11.3);

  box(scene, 0.12, 2.6, 0.12, 0x4a4e5a, 13, 0.12, 9.6);
  box(scene, 0.8, 0.6, 0.06, 0x3a6fd0, 13, 2.2, 9.6);
  blob(scene, 0.5, 0.25, 13, 0.13, 9.6);
  solidBox(13, 9.6, 0.2, 0.2);
}

function bin(scene, x, z) {
  box(scene, 0.45, 0.7, 0.45, 0x3d7a5a, x, 0.12, z);
  box(scene, 0.5, 0.06, 0.5, 0x2c5a42, x, 0.82, z);
  blob(scene, 0.7, 0.35, x, 0.13, z);
  solidBox(x, z, 0.45, 0.45);
}

function lamp(scene, x, z, ry = 0) {
  box(scene, 0.32, 0.2, 0.32, 0x3b3f4f, x, 0.12, z);
  box(scene, 0.12, 3.1, 0.12, 0x3b3f4f, x, 0.12, z);
  const arm = new THREE.Group();
  arm.position.set(x, 3.1, z);
  arm.rotation.y = ry;
  scene.add(arm);
  box(arm, 0.08, 0.08, 0.7, 0x3b3f4f, 0, 0, -0.3);
  box(arm, 0.34, 0.16, 0.34, 0x3b3f4f, 0, -0.05, -0.62);
  box(arm, 0.26, 0.08, 0.26, uniqueMat(0xfff1b0, { emissive: 0xffe07a, emissiveIntensity: 0.9 }), 0, -0.12, -0.62, { cast: false });
  blob(scene, 0.6, 0.3, x, 0.13, z);
  solidBox(x, z, 0.3, 0.3);
}

function bench(scene, x, z) {
  box(scene, 1.7, 0.08, 0.5, tmat('table'), x, 0.55, z);
  box(scene, 1.7, 0.4, 0.07, tmat('table'), x, 0.7, z + 0.23);
  for (const dx of [-0.7, 0.7]) box(scene, 0.08, 0.45, 0.45, 0x3b3f4f, x + dx, 0.12, z);
  blob(scene, 1.9, 0.6, x, 0.13, z);
  solidBox(x, z, 1.7, 0.55);
}

// ------------------------------------------------------------------ CAFETERIA
function buildCafe(scene) {
  const g = new THREE.Group();
  scene.add(g);

  // Partes que somem (pontilhado) quando atrapalham a visão: fachada, parede leste e telhado
  const fadeGroup = new THREE.Group();
  scene.add(fadeGroup);
  const fadeMats = [];
  const fm = (color, extra) => { const m = uniqueMat(color, extra); fadeMats.push(m); return m; };
  const ftm = (name) => { const m = tmat(name, { unique: true }); fadeMats.push(m); return m; };

  const trim = 0x7b4a2c, top = 0xe6d5b3;
  const F = 0.12;

  // Piso e tapete
  box(g, 14, F, 12, tmat('wood_floor'), -2, 0, -6, { cast: false });
  box(g, 2.6, 0.02, 1.8, 0x9e3d3d, -2, F, -1.3, { cast: false });
  box(g, 2.2, 0.025, 1.4, 0xd9a441, -2, F, -1.3, { cast: false });

  // Paredes do fundo e oeste (sempre visíveis), leste (some)
  const shell = tmat('wall', { unique: true }); // some parcialmente quando o jogador está atrás
  box(g, 14, 3.2, 0.3, shell, -2, 0, -11.85); solid(-9, 5, -12, -11.7);
  box(g, 0.3, 3.2, 12, shell, -8.85, 0, -6); solid(-9, -8.7, -12, 0);
  box(fadeGroup, 0.3, 3.2, 12, ftm('wall'), 4.85, 0, -6); solid(4.7, 5, -12, 0);
  box(g, 13.4, 0.9, 0.05, 0x8fb8a0, -2, F, -11.68, { cast: false });
  box(g, 0.05, 0.9, 11.4, 0x8fb8a0, -8.68, F, -6, { cast: false });

  // Fachada
  const fw = ftm('wall'), ft = fm(trim), glass = fm(0x9fd6f0, { emissive: 0x2a4a5a, emissiveIntensity: 0.4 });
  box(fadeGroup, 5.8, 3.2, 0.3, fw, -6.1, 0, -0.15); solid(-9, -3.2, -0.3, 0);
  box(fadeGroup, 5.8, 3.2, 0.3, fw, 2.1, 0, -0.15); solid(-0.8, 5, -0.3, 0);
  box(fadeGroup, 2.4, 0.8, 0.3, fw, -2, 2.4, -0.15);
  box(fadeGroup, 0.16, 2.5, 0.42, ft, -3.2, 0, -0.15);
  box(fadeGroup, 0.16, 2.5, 0.42, ft, -0.8, 0, -0.15);
  box(fadeGroup, 14.2, 0.25, 0.42, ft, -2, 0, -0.15);

  const awning = ftm('awning');
  for (const wx of [-7.4, -4.7, 0.6, 3.4]) {
    box(fadeGroup, 2.0, 1.45, 0.1, ft, wx, 0.85, 0.02);
    box(fadeGroup, 1.7, 1.15, 0.12, glass, wx, 1.0, 0.03);
    box(fadeGroup, 0.08, 1.15, 0.14, ft, wx, 1.0, 0.03);
    box(fadeGroup, 2.4, 0.08, 1.0, awning, wx, 2.35, 0.45, { rx: 0.38 });
    // Floreiras
    box(g, 2.0, 0.4, 0.42, tmat('pot'), wx, F, 0.27);
    box(g, 1.9, 0.22, 0.34, tmat('plant'), wx, F + 0.4, 0.27);
    for (let k = 0; k < 5; k++) {
      box(g, 0.13, 0.13, 0.13, [0xe8424f, 0xffd34e, 0xff8fb1][k % 3], wx - 0.7 + k * 0.35, F + 0.6, 0.3, { cast: false });
    }
    solid(wx - 1, wx + 1, 0, 0.5);
  }

  // Letreiro
  signPlane(fadeGroup, 'sign_cafe', 48, 11, -2, 2.8, 0.02, fm(0xffffff, { map: tex('sign_cafe') }));

  // Telhado
  const shape = new THREE.Shape();
  shape.moveTo(-6.45, 0);
  shape.lineTo(6.45, 0);
  shape.lineTo(0, 1.9);
  shape.closePath();
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 14.6, bevelEnabled: false }), ftm('roof'));
  roof.rotation.y = Math.PI / 2;
  roof.position.set(-9.3, 3.2, -6);
  fadeGroup.add(roof);
  box(fadeGroup, 14.6, 0.12, 0.3, fm(0x8a3a2a), -2, 3.12, 0.3);
  box(fadeGroup, 0.8, 2.4, 0.8, ftm('brick'), 1.8, 3.4, -8.5);
  box(fadeGroup, 0.95, 0.15, 0.95, fm(0x5a2a20), 1.8, 5.8, -8.5);

  // Balcão
  box(g, 7.2, 1.0, 1.0, tmat('counter'), -5.1, F, -7);
  box(g, 7.4, 0.1, 1.15, top, -5.1, F + 1.0, -7);
  solid(-8.7, -1.5, -7.55, -6.45);
  const Tp = F + 1.1;
  box(g, 1.6, 0.5, 0.8, uniqueMat(0xcdeefa, { transparent: true, opacity: 0.55 }), -7.3, Tp, -7);
  [[0xe2a65a, -7.8], [0xf2c6d8, -7.45], [0x8a5a3a, -7.1], [0xe2a65a, -6.8]].forEach(([c, x]) => box(g, 0.24, 0.14, 0.24, c, x, Tp + 0.05, -7));
  box(g, 0.6, 0.35, 0.5, 0x3b3f4f, -2.4, Tp, -7.1);
  box(g, 0.4, 0.2, 0.06, uniqueMat(0x7af0a0, { emissive: 0x2a8a50, emissiveIntensity: 0.6 }), -2.4, Tp + 0.35, -7.25, { rx: -0.4 });
  // Cantinho para deixar cafés: bandeja sobre o balcão com 6 lugares (3×2)
  box(g, 1.1, 0.04, 0.62, 0x8a5a3a, -6.0, Tp, -7);
  box(g, 1.0, 0.02, 0.52, 0xc9a66b, -6.0, Tp + 0.04, -7, { cast: false });
  const counterCups = [];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 3; i++) {
      const c = makeCup();
      c.position.set(-6.32 + i * 0.32, Tp + 0.06, -7.13 + j * 0.26);
      c.visible = false;
      g.add(c);
      counterCups.push(c);
    }
  }
  box(g, 0.08, 1.0, 0.08, 0x3b3f4f, -5.7, F, -5.6);
  box(g, 0.6, 0.3, 0.05, 0xd9a441, -5.7, F + 1.0, -5.6);

  // Bancada de trás
  box(g, 6.7, 1.0, 0.9, tmat('counter'), -5.35, F, -11.25);
  box(g, 6.8, 0.1, 0.95, top, -5.35, F + 1.0, -11.25);
  solid(-8.7, -2, -11.7, -10.75);

  // Cafeteira
  const M = new THREE.Group();
  M.position.set(-5, F + 1.1, -11.3);
  g.add(M);
  box(M, 1.3, 1.0, 0.6, 0xc9ced8, 0, 0, 0);
  box(M, 1.38, 0.12, 0.66, 0x3a3d4a, 0, 1.0, 0);
  box(M, 1.1, 0.2, 0.14, 0x3a3d4a, 0, 0.55, 0.33);
  box(M, 0.14, 0.16, 0.14, 0x2a2d38, -0.25, 0.39, 0.36);
  box(M, 0.14, 0.16, 0.14, 0x2a2d38, 0.25, 0.39, 0.36);
  box(M, 1.15, 0.06, 0.42, 0x2a2d38, 0, 0, 0.45);
  box(M, 0.24, 0.24, 0.04, 0xffffff, -0.42, 0.72, 0.31);
  box(M, 0.04, 0.1, 0.045, 0xe8424f, -0.42, 0.79, 0.315, { cast: false });
  box(M, 0.05, 0.4, 0.05, 0xaaaaaa, 0.62, 0.2, 0.42);
  const lightMat = uniqueMat(0xe8424f, { emissive: 0xe8424f, emissiveIntensity: 0.8 });
  box(M, 0.14, 0.14, 0.04, lightMat, 0.45, 0.78, 0.31, { cast: false });
  const machineCups = [-0.42, -0.14, 0.14, 0.42].map((x) => {
    const c = makeCup();
    c.position.set(x, 0.06, 0.47);
    c.visible = false;
    M.add(c);
    return c;
  });
  box(g, 0.5, 0.6, 0.5, 0x3a3d4a, -7.2, Tp, -11.3);
  box(g, 0.42, 0.4, 0.42, 0x6b3e22, -7.2, Tp + 0.6, -11.3);
  for (let i = 0; i < 3; i++) box(g, 0.2, 0.15, 0.2, 0xf7f2ea, -3.2, Tp + i * 0.16, -11.3);
  for (let i = 0; i < 3; i++) box(g, 0.2, 0.15, 0.2, 0xf7f2ea, -2.9, Tp + i * 0.16, -11.2);

  // Quadro de menu e prateleira
  signPlane(g, 'menu', 34, 18, -7.4, 2.68, -11.68);
  box(g, 2.0, 0.08, 0.3, tmat('table'), -2.3, 2.0, -11.55);
  [0xd9a441, 0x8a5a3a, 0xe8424f, 0x5bbf5b].forEach((c, i) => box(g, 0.25, 0.32, 0.22, c, -3.0 + i * 0.45, 2.08, -11.55));

  // Sacos de grãos
  box(g, 0.7, 0.7, 0.6, 0xc9a66b, -8.1, F, -9.3);
  box(g, 0.5, 0.12, 0.45, 0x6b3e22, -8.1, F + 0.7, -9.3);
  box(g, 0.6, 0.55, 0.55, 0xbf9a5e, -8.15, F, -8.5);
  blob(g, 1.0, 1.6, -8.1, F + 0.012, -8.9);
  solid(-8.7, -7.7, -9.7, -8.2);

  for (const z of [-3.2, -6.4, -9.6]) table(g, 2.6, z);

  for (const [x, z] of [[4.2, -11.2], [-8.2, -0.8], [4.2, -0.8]]) {
    box(g, 0.5, 0.45, 0.5, tmat('pot'), x, F, z);
    box(g, 0.6, 0.5, 0.6, tmat('plant'), x, F + 0.45, z);
    box(g, 0.35, 0.4, 0.35, tmat('plant', { tint: 0xc8f0b0 }), x, F + 0.9, z);
    blob(g, 0.8, 0.45, x, F + 0.012, z);
    solidBox(x, z, 0.55, 0.55);
  }
  box(g, 0.05, 0.8, 1.1, trim, -8.68, 1.6, -3.5, { cast: false });
  box(g, 0.06, 0.6, 0.9, 0x5b9be8, -8.67, 1.7, -3.5, { cast: false });

  box(scene, 0.7, 0.8, 0.6, 0x3d5a7a, -7, 0, -12.5);
  box(scene, 0.7, 0.8, 0.6, 0x3d7a5a, -6.1, 0, -12.5);
  solid(-7.4, -5.7, -12.85, -12);

  return {
    fadeGroup,
    fadeMats,
    shellMats: [shell],
    cafeBox: new THREE.Box3(new THREE.Vector3(-9.3, 0, -12.3), new THREE.Vector3(5.3, 6, 0.6)),
    machine: { group: M, cups: machineCups, lightMat, steamPos: new THREE.Vector3(-5, F + 2.0, -10.9) },
    counterCups,
    chimneyPos: new THREE.Vector3(1.8, 6.0, -8.5),
  };
}

function table(g, x, z) {
  const F = 0.12;
  blob(g, 1.5, 0.9, x, F + 0.012, z);
  box(g, 1.1, 0.08, 1.1, tmat('table'), x, F + 0.75, z);
  box(g, 0.15, 0.75, 0.15, 0x5a3820, x, F, z);
  box(g, 0.6, 0.05, 0.6, 0x5a3820, x, F, z);
  for (const s of [-1, 1]) {
    box(g, 0.5, 0.08, 0.5, tmat('chair'), x + s * 0.85, F + 0.45, z);
    box(g, 0.08, 0.5, 0.5, tmat('chair'), x + s * 1.08, F + 0.5, z);
    box(g, 0.08, 0.45, 0.08, 0x5a3820, x + s * 0.85, F, z);
    blob(g, 0.6, 0.45, x + s * 0.9, F + 0.012, z);
  }
  const cup = makeCup();
  cup.position.set(x + 0.2, F + 0.83, z + 0.15);
  g.add(cup);
  box(g, 0.12, 0.25, 0.12, 0x9fd6f0, x - 0.2, F + 0.83, z - 0.15);
  box(g, 0.14, 0.14, 0.14, 0xe8424f, x - 0.2, F + 1.08, z - 0.15);
  solidBox(x, z, 2.3, 1.1);
}

// ------------------------------------------------------------------ HORTA (estrutura)
function buildGarden(scene) {
  box(scene, 2, 0.02, 4.8, 0xc2a073, 12, 0, -1.6, { cast: false });
  box(scene, 9.6, 0.02, 1.4, 0xc2a073, 12, 0, -6.55, { cast: false });

  const post = 0xa86b3c;
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.1));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      box(scene, 0.16, 0.9, 0.16, post, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t);
    }
    const horiz = z0 === z1;
    for (const y of [0.35, 0.7]) {
      box(scene, horiz ? len : 0.08, 0.08, horiz ? 0.08 : len, tmat('fence'), (x0 + x1) / 2, y, (z0 + z1) / 2);
    }
    solid(Math.min(x0, x1) - 0.1, Math.max(x0, x1) + 0.1, Math.min(z0, z1) - 0.1, Math.max(z0, z1) + 0.1);
  };
  fence(7, -11, 17, -11);
  fence(7, -11, 7, -1);
  fence(17, -11, 17, -1);
  fence(7, -1, 11, -1);
  fence(13, -1, 17, -1);

  box(scene, 0.1, 1.3, 0.1, post, 10.4, 0, -0.6);
  signPlane(scene, 'sign_horta', 25, 9, 10.4, 1.25, -0.54);
  solidBox(10.4, -0.6, 0.15, 0.15);

  box(scene, 0.4, 0.35, 0.3, 0x5b9be8, 15.8, 0, -1.8);
  box(scene, 0.35, 0.06, 0.06, 0x5b9be8, 16.1, 0.28, -1.8, { rz: 0.5 });
  box(scene, 0.5, 0.55, 0.45, 0xc9a66b, 8.2, 0, -1.8);
  box(scene, 0.35, 0.1, 0.3, 0x5a3220, 8.2, 0.55, -1.8);
  blob(scene, 0.6, 0.35, 15.8, 0.012, -1.8);
  blob(scene, 0.7, 0.4, 8.2, 0.012, -1.8);
  solidBox(15.8, -1.8, 0.5, 0.4);
  solidBox(8.2, -1.8, 0.55, 0.5);
}

export { gradientMap, mat };
