import * as THREE from 'three';
import { box, mat, uniqueMat, solid, solidBox, rng, gradientMap } from './util.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textTex(lines, w, h, bg, fg, font, border) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (border) {
      g.fillStyle = border;
      g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
      g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
    }
    g.fillStyle = fg;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, w / 2, (h * (i + 1)) / (lines.length + 1)));
  });
}

function plane(parent, w, h, material, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Xícara de café pequena (usada na máquina e na bandeja)
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
  const rp = (arr) => arr[Math.floor(R() * arr.length)];

  // Regiões reservadas (sem árvores/decoração aleatória)
  const reserved = [
    [-11, 7, -13.5, 0.6],   // cafeteria
    [6, 18.5, -12, -0.4],   // horta
    [-80, 80, -0.4, 12.2],  // rua + calçadas
  ];
  const free = (x, z, pad = 0) => !reserved.some(([x0, x1, z0, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);

  // ---------- Chão
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), mat(0x86c45f));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  for (let i = 0; i < 90; i++) {
    const x = r(-60, 60), z = r(-24, 24);
    if (!free(x, z, 1)) continue;
    box(scene, r(1, 3.5), 0.01, r(1, 3), rp([0x7ab955, 0x92cc68]), x, 0, z, { cast: false });
  }
  const flowerColors = [0xffffff, 0xffd34e, 0xe8424f, 0xb57be8, 0xff8fb1, 0x5b9be8];
  for (let i = 0; i < 220; i++) {
    const x = r(-50, 50), z = r(-22, 22);
    if (!free(x, z, 0.4)) continue;
    box(scene, 0.14, 0.14, 0.14, rp(flowerColors), x, 0.08, z, { cast: false });
    box(scene, 0.05, 0.1, 0.05, 0x3e8a3a, x, 0, z, { cast: false });
  }

  buildStreet(scene, r);
  const cafe = buildCafe(scene);
  buildGarden(scene);

  // ---------- Árvores e arbustos
  const trees = [];
  const okTree = (x, z) => free(x, z, 1.2) && trees.every(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 > 7);
  const addTree = (x, z) => {
    if (!okTree(x, z)) return;
    trees.push([x, z]);
    tree(scene, x, z, r(0.85, 1.25), R);
  };
  for (let x = -46; x <= 46; x += r(4, 6.5)) addTree(x + r(-1, 1), r(13.5, 17.5));
  for (let x = -46; x <= 46; x += r(4, 6.5)) addTree(x + r(-1, 1), r(-15.5, -20));
  for (let i = 0; i < 40; i++) addTree(r(-46, -12), r(-13, -2));
  for (let i = 0; i < 40; i++) addTree(r(20, 46), r(-13, -2));
  for (let i = 0; i < 60; i++) {
    const x = r(-46, 46), z = r(-20, 20);
    if (!free(x, z, 0.8) || !trees.every(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 > 3)) continue;
    bush(scene, x, z, R);
  }

  return cafe;
}

// ------------------------------------------------------------------ RUA
function buildStreet(scene) {
  box(scene, 160, 0.03, 6, 0x50535f, 0, 0, 6, { cast: false });
  for (let x = -78; x < 78; x += 3) {
    if (Math.abs(x + 2) < 2.5) continue;
    box(scene, 1.4, 0.01, 0.16, 0xf3d36b, x, 0.03, 6, { cast: false });
  }
  for (let i = 0; i < 6; i++) box(scene, 2.4, 0.01, 0.55, 0xf2f2f2, -2, 0.03, 3.5 + i, { cast: false });

  // Calçadas
  box(scene, 160, 0.12, 3, 0xd3cab8, 0, 0, 1.5, { cast: false });
  box(scene, 160, 0.14, 0.2, 0xa49b8a, 0, 0, 2.95, { cast: false });
  box(scene, 160, 0.12, 2.6, 0xd3cab8, 0, 0, 10.3, { cast: false });
  box(scene, 160, 0.14, 0.2, 0xa49b8a, 0, 0, 9.05, { cast: false });
  for (let x = -78; x < 78; x += 2) {
    box(scene, 0.06, 0.005, 2.8, 0xbdb3a0, x, 0.12, 1.45, { cast: false, receive: true });
    box(scene, 0.06, 0.005, 2.4, 0xbdb3a0, x, 0.12, 10.35, { cast: false });
  }

  // Postes
  for (const x of [-30, -18, -9, 6, 19, 32]) lamp(scene, x, 2.72);
  for (const x of [-24, -12, 3, 16, 28]) lamp(scene, x, 9.35, Math.PI);

  // Bancos e lixeiras
  for (const x of [-15, 9, 23]) bench(scene, x, 11.2);
  box(scene, 0.45, 0.7, 0.45, 0x3d7a5a, 0.7, 0.12, 0.45);
  box(scene, 0.5, 0.06, 0.5, 0x2c5a42, 0.7, 0.82, 0.45);
  solidBox(0.7, 0.45, 0.45, 0.45);
  box(scene, 0.45, 0.7, 0.45, 0x3d7a5a, -9.5, 0.12, 11.3);
  solidBox(-9.5, 11.3, 0.45, 0.45);

  // Ponto de ônibus simples
  box(scene, 0.12, 2.6, 0.12, 0x4a4e5a, 13, 0.12, 9.6);
  box(scene, 0.8, 0.6, 0.06, 0x3a6fd0, 13, 2.2, 9.6);
  solidBox(13, 9.6, 0.2, 0.2);
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
  solidBox(x, z, 0.3, 0.3);
}

function bench(scene, x, z) {
  box(scene, 1.7, 0.08, 0.5, 0xa86b3c, x, 0.55, z);
  box(scene, 1.7, 0.4, 0.07, 0xa86b3c, x, 0.7, z + 0.23);
  for (const dx of [-0.7, 0.7]) box(scene, 0.08, 0.45, 0.45, 0x3b3f4f, x + dx, 0.12, z);
  solidBox(x, z, 1.7, 0.55);
}

function tree(scene, x, z, s, R) {
  const leaf = [0x3f8f3f, 0x4fa64a, 0x5cb85a, 0x3d9a55][Math.floor(R() * 4)];
  const light = 0x6cc860;
  box(scene, 0.4 * s, 1.4 * s, 0.4 * s, 0x7a5032, x, 0, z);
  box(scene, 2.1 * s, 1.2 * s, 2.0 * s, leaf, x, 1.25 * s, z);
  box(scene, 1.5 * s, 0.9 * s, 1.5 * s, light, x + 0.15 * s, 2.35 * s, z - 0.1 * s);
  box(scene, 0.8 * s, 0.5 * s, 0.8 * s, leaf, x - 0.1 * s, 3.2 * s, z + 0.1 * s);
  if (R() < 0.4) {
    for (let i = 0; i < 4; i++) {
      box(scene, 0.16, 0.16, 0.16, 0xe8424f, x + (R() - 0.5) * 1.8 * s, (1.4 + R() * 1.0) * s, z + 1.0 * s);
    }
  }
  solidBox(x, z, 0.55 * s, 0.55 * s);
}

function bush(scene, x, z, R) {
  const c = [0x4fa64a, 0x3f8f3f, 0x5cb85a][Math.floor(R() * 3)];
  const w = 0.8 + R() * 0.8;
  box(scene, w, 0.6 + R() * 0.3, 0.8, c, x, 0, z);
  if (R() < 0.5) box(scene, 0.15, 0.15, 0.15, [0xff8fb1, 0xffffff, 0xffd34e][Math.floor(R() * 3)], x + 0.2, 0.6, z + 0.35);
  solidBox(x, z, w, 0.8);
}

// ------------------------------------------------------------------ CAFETERIA
function buildCafe(scene) {
  const g = new THREE.Group();
  scene.add(g);

  // Partes que somem quando o jogador entra (fachada + telhado)
  const fadeGroup = new THREE.Group();
  scene.add(fadeGroup);
  const fadeMats = [];
  const fm = (color, extra = {}) => {
    const m = uniqueMat(color, { transparent: true, ...extra });
    fadeMats.push(m);
    return m;
  };

  const wallC = 0xf3e2c4, trim = 0x7b4a2c, wood = 0x6b4226, top = 0xe6d5b3;
  const F = 0.12; // altura do piso

  // Piso de tábuas
  for (let i = 0; i < 14; i++) box(g, 1, F, 12, i % 2 ? 0xb27b4b : 0xa66f40, -8.5 + i, 0, -6, { cast: false });
  box(g, 2.6, 0.02, 1.8, 0x9e3d3d, -2, F, -1.3, { cast: false });
  box(g, 2.2, 0.025, 1.4, 0xd9a441, -2, F, -1.3, { cast: false });

  // Paredes
  box(g, 14, 3.2, 0.3, wallC, -2, 0, -11.85); solid(-9, 5, -12, -11.7);
  box(g, 0.3, 3.2, 12, wallC, -8.85, 0, -6); solid(-9, -8.7, -12, 0);
  box(g, 0.3, 3.2, 12, wallC, 4.85, 0, -6); solid(4.7, 5, -12, 0);
  box(g, 13.4, 0.9, 0.05, 0x8fb8a0, -2, F, -11.68, { cast: false });
  box(g, 0.05, 0.9, 11.4, 0x8fb8a0, -8.68, F, -6, { cast: false });
  box(g, 0.05, 0.9, 11.4, 0x8fb8a0, 4.68, F, -6, { cast: false });

  // Fachada
  const fw = fm(wallC), ft = fm(trim), glass = fm(0x9fd6f0, { emissive: 0x2a4a5a, emissiveIntensity: 0.4 });
  box(fadeGroup, 5.8, 3.2, 0.3, fw, -6.1, 0, -0.15); solid(-9, -3.2, -0.3, 0);
  box(fadeGroup, 5.8, 3.2, 0.3, fw, 2.1, 0, -0.15); solid(-0.8, 5, -0.3, 0);
  box(fadeGroup, 2.4, 0.8, 0.3, fw, -2, 2.4, -0.15);
  box(fadeGroup, 0.16, 2.5, 0.42, ft, -3.2, 0, -0.15);
  box(fadeGroup, 0.16, 2.5, 0.42, ft, -0.8, 0, -0.15);
  box(fadeGroup, 14.2, 0.25, 0.42, ft, -2, 0, -0.15);

  const stripes = canvasTex(8, 2, (c) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#fff6e6' : '#d94a3d';
      c.fillRect(i, 0, 1, 2);
    }
  });
  stripes.wrapS = THREE.RepeatWrapping;
  stripes.repeat.set(2, 1);
  const awning = fm(0xffffff, { map: stripes });

  for (const wx of [-7.4, -4.7, 0.6, 3.4]) {
    box(fadeGroup, 2.0, 1.45, 0.1, ft, wx, 0.85, 0.02);
    box(fadeGroup, 1.7, 1.15, 0.12, glass, wx, 1.0, 0.03);
    box(fadeGroup, 0.08, 1.15, 0.14, ft, wx, 1.0, 0.03);
    box(fadeGroup, 2.4, 0.08, 1.0, awning, wx, 2.35, 0.45, { rx: 0.38 });
    // Floreiras (ficam visíveis sempre)
    box(g, 2.0, 0.4, 0.42, 0x8b5a3c, wx, F, 0.27);
    for (let k = 0; k < 6; k++) {
      box(g, 0.2, 0.2, 0.2, k % 2 ? 0x4fa64a : 0x3f8f3f, wx - 0.8 + k * 0.32, 0.5, 0.27);
      box(g, 0.13, 0.13, 0.13, [0xe8424f, 0xffd34e, 0xff8fb1][k % 3], wx - 0.8 + k * 0.32, 0.7, 0.3, { cast: false });
    }
    solid(wx - 1, wx + 1, 0, 0.5);
  }

  // Letreiro
  const signTex = textTex(['PIXEL CAFÉ'], 128, 32, '#4b2c1a', '#ffd34e', 'bold 18px monospace', '#d9a441');
  const sign = plane(fadeGroup, 2.6, 0.65, fm(0xffffff, { map: signTex }), -2, 2.8, 0.02);
  sign.castShadow = false;
  box(fadeGroup, 0.5, 0.5, 0.06, fm(0xffffff), -2, 3.3, 0.02);

  // Telhado
  const shape = new THREE.Shape();
  shape.moveTo(-6.45, 0);
  shape.lineTo(6.45, 0);
  shape.lineTo(0, 1.9);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 14.6, bevelEnabled: false });
  const roof = new THREE.Mesh(roofGeo, fm(0xb5513c));
  roof.rotation.y = Math.PI / 2;
  roof.position.set(-9.3, 3.2, -6);
  roof.castShadow = true;
  roof.receiveShadow = true;
  fadeGroup.add(roof);
  box(fadeGroup, 14.6, 0.12, 0.3, fm(0x8a3a2a), -2, 3.12, 0.3);
  box(fadeGroup, 0.8, 2.4, 0.8, fm(0x9a4b3a), 1.8, 3.4, -8.5);
  box(fadeGroup, 0.95, 0.15, 0.95, fm(0x5a2a20), 1.8, 5.8, -8.5);

  // Balcão
  box(g, 7.2, 1.0, 1.0, wood, -5.1, F, -7);
  box(g, 7.4, 0.1, 1.15, top, -5.1, F + 1.0, -7);
  for (let x = -8.2; x < -1.7; x += 0.9) box(g, 0.06, 0.8, 0.02, 0x5a3820, x, F + 0.1, -6.49, { cast: false });
  solid(-8.7, -1.5, -7.55, -6.45);
  // Vitrine com doces
  const T = F + 1.1;
  box(g, 1.6, 0.5, 0.8, uniqueMat(0xcdeefa, { transparent: true, opacity: 0.55 }), -7.3, T, -7);
  [[0xe2a65a, -7.8], [0xf2c6d8, -7.45], [0x8a5a3a, -7.1], [0xe2a65a, -6.8]].forEach(([c, x]) => box(g, 0.24, 0.14, 0.24, c, x, T + 0.05, -7));
  // Caixa registradora
  box(g, 0.6, 0.35, 0.5, 0x3b3f4f, -2.4, T, -7.1);
  box(g, 0.4, 0.2, 0.06, uniqueMat(0x7af0a0, { emissive: 0x2a8a50, emissiveIntensity: 0.6 }), -2.4, T + 0.35, -7.25, { rx: -0.4 });
  // Placa "FILA AQUI"
  box(g, 0.08, 1.0, 0.08, 0x3b3f4f, -5.7, F, -5.6);
  box(g, 0.6, 0.3, 0.05, 0xd9a441, -5.7, F + 1.0, -5.6);

  // Bancada de trás
  box(g, 6.7, 1.0, 0.9, 0x7a4e30, -5.35, F, -11.25);
  box(g, 6.8, 0.1, 0.95, top, -5.35, F + 1.0, -11.25);
  solid(-8.7, -2, -11.7, -10.75);

  // Cafeteira (máquina de espresso)
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
  // Moedor + xícaras
  box(g, 0.5, 0.6, 0.5, 0x3a3d4a, -7.2, T, -11.3);
  box(g, 0.42, 0.4, 0.42, 0x6b3e22, -7.2, T + 0.6, -11.3);
  for (let i = 0; i < 3; i++) box(g, 0.2, 0.15, 0.2, 0xf7f2ea, -3.2, T + i * 0.16, -11.3);
  for (let i = 0; i < 3; i++) box(g, 0.2, 0.15, 0.2, 0xf7f2ea, -2.9, T + i * 0.16, -11.2);

  // Quadro de menu
  const menuTex = textTex(['MENU', 'CAFÉ  $5', 'GORJETA +$'], 128, 64, '#243028', '#f4ead8', 'bold 13px monospace', '#7b4a2c');
  plane(g, 1.9, 0.95, uniqueMat(0xffffff, { map: menuTex }), -7.4, 2.68, -11.68);
  // Prateleira com potes
  box(g, 2.0, 0.08, 0.3, wood, -0.8 - 1.5, 2.0, -11.55);
  [0xd9a441, 0x8a5a3a, 0xe8424f, 0x5bbf5b].forEach((c, i) => box(g, 0.25, 0.32, 0.22, c, -3.0 + i * 0.45, 2.08, -11.55));

  // Sacos de grãos
  box(g, 0.7, 0.7, 0.6, 0xc9a66b, -8.1, F, -9.3);
  box(g, 0.5, 0.12, 0.45, 0x6b3e22, -8.1, F + 0.7, -9.3);
  box(g, 0.6, 0.55, 0.55, 0xbf9a5e, -8.15, F, -8.5);
  solid(-8.7, -7.7, -9.7, -8.2);

  // Mesas
  for (const z of [-3.2, -6.4, -9.6]) table(g, 2.6, z);

  // Vasos de planta
  for (const [x, z] of [[4.2, -11.2], [-8.2, -0.8], [4.2, -0.8]]) {
    box(g, 0.5, 0.45, 0.5, 0xc0623a, x, F, z);
    box(g, 0.6, 0.5, 0.6, 0x3f8f3f, x, F + 0.45, z);
    box(g, 0.35, 0.4, 0.35, 0x5cb85a, x, F + 0.9, z);
    solidBox(x, z, 0.55, 0.55);
  }
  // Quadros na parede
  box(g, 0.05, 0.8, 1.1, 0x7b4a2c, -8.68, 1.6, -3.5, { cast: false });
  box(g, 0.06, 0.6, 0.9, 0x5b9be8, -8.67, 1.7, -3.5, { cast: false });
  box(g, 0.05, 0.8, 1.1, 0x7b4a2c, 4.68, 1.6, -5, { cast: false });
  box(g, 0.06, 0.6, 0.9, 0xffd34e, 4.67, 1.7, -5, { cast: false });

  // Lixeiras atrás
  box(scene, 0.7, 0.8, 0.6, 0x3d5a7a, -7, 0, -12.5);
  box(scene, 0.7, 0.8, 0.6, 0x3d7a5a, -6.1, 0, -12.5);
  solid(-7.4, -5.7, -12.85, -12);

  return {
    fadeGroup,
    fadeMats,
    machine: { group: M, cups: machineCups, lightMat, steamPos: new THREE.Vector3(-5, F + 2.0, -10.9) },
    chimneyPos: new THREE.Vector3(1.8, 6.0, -8.5),
  };
}

function table(g, x, z) {
  const F = 0.12;
  box(g, 1.1, 0.08, 1.1, 0x8b5a3c, x, F + 0.75, z);
  box(g, 0.15, 0.75, 0.15, 0x5a3820, x, F, z);
  box(g, 0.6, 0.05, 0.6, 0x5a3820, x, F, z);
  for (const s of [-1, 1]) {
    box(g, 0.5, 0.08, 0.5, 0xd9a441, x + s * 0.85, F + 0.45, z);
    box(g, 0.08, 0.5, 0.5, 0xd9a441, x + s * 1.08, F + 0.5, z);
    box(g, 0.08, 0.45, 0.08, 0x5a3820, x + s * 0.85, F, z);
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
  box(scene, 10, 0.02, 10, 0x79ad4f, 12, 0, -6, { cast: false });
  box(scene, 2, 0.03, 4.8, 0xc2a073, 12, 0, -1.6, { cast: false });
  box(scene, 9.6, 0.03, 1.4, 0xc2a073, 12, 0, -6.55, { cast: false });

  const post = 0xa86b3c, rail = 0xc98a4e;
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.1));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      box(scene, 0.16, 0.9, 0.16, post, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t);
    }
    const horiz = z0 === z1;
    for (const y of [0.35, 0.7]) {
      box(scene, horiz ? len : 0.08, 0.08, horiz ? 0.08 : len, rail, (x0 + x1) / 2, y, (z0 + z1) / 2);
    }
    solid(Math.min(x0, x1) - 0.1, Math.max(x0, x1) + 0.1, Math.min(z0, z1) - 0.1, Math.max(z0, z1) + 0.1);
  };
  fence(7, -11, 17, -11);
  fence(7, -11, 7, -1);
  fence(17, -11, 17, -1);
  fence(7, -1, 11, -1);
  fence(13, -1, 17, -1);

  // Placa HORTA
  const tex = textTex(['HORTA'], 64, 24, '#f4ead8', '#2f8a3e', 'bold 13px monospace', '#7b4a2c');
  box(scene, 0.1, 1.3, 0.1, post, 10.4, 0, -0.6);
  plane(scene, 1.2, 0.45, uniqueMat(0xffffff, { map: tex }), 10.4, 1.25, -0.54);
  solidBox(10.4, -0.6, 0.15, 0.15);

  // Regador e saco de sementes
  box(scene, 0.4, 0.35, 0.3, 0x5b9be8, 15.8, 0, -1.8);
  box(scene, 0.35, 0.06, 0.06, 0x5b9be8, 16.1, 0.28, -1.8, { rz: 0.5 });
  box(scene, 0.5, 0.55, 0.45, 0xc9a66b, 8.2, 0, -1.8);
  box(scene, 0.35, 0.1, 0.3, 0x5a3220, 8.2, 0.55, -1.8);
  solidBox(15.8, -1.8, 0.5, 0.4);
  solidBox(8.2, -1.8, 0.55, 0.5);
}

export { gradientMap };
