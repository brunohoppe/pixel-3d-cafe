import * as THREE from 'three';
import { box, uniqueMat, solidBox } from './util.js';

export const GROW_TIME = 28; // segundos (metade se regado)
const CENTERS = [
  [9.3, -8.6], [12, -8.6], [14.7, -8.6],
  [9.3, -4.5], [12, -4.5], [14.7, -4.5],
];
const SOIL = new THREE.Color(0x7a4b2a);
const SOIL_WET = new THREE.Color(0x45281a);

function buildPlant() {
  const g = new THREE.Group();
  box(g, 0.08, 0.55, 0.08, 0x6b4a2a, 0, 0, 0);
  const leaves = [
    [0, 0.3, 0, 0.55, 0.25, 0.55, 0x2f7a3a],
    [0.12, 0.55, 0.05, 0.42, 0.22, 0.42, 0x3e9a48],
    [-0.1, 0.75, -0.05, 0.34, 0.2, 0.34, 0x2f7a3a],
    [0, 0.93, 0, 0.22, 0.16, 0.22, 0x4fb456],
  ];
  for (const [x, y, z, w, h, d, c] of leaves) box(g, w, h, d, c, x, y, z);
  const cherries = [];
  const spots = [[0.28, 0.38, 0.1], [-0.26, 0.4, -0.12], [0.05, 0.42, 0.29], [-0.08, 0.4, -0.29],
    [0.22, 0.62, -0.15], [-0.2, 0.8, 0.12], [0.18, 0.84, 0.12]];
  for (const [x, y, z] of spots) {
    const c = box(g, 0.12, 0.12, 0.12, 0xd8322a, x, y, z, { cast: false });
    c.visible = false;
    cherries.push(c);
  }
  return { group: g, cherries };
}

export class Garden {
  constructor(scene) {
    this.plots = CENTERS.map(([x, z], i) => this.makePlot(scene, x, z, i));
  }

  makePlot(scene, x, z, i) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    scene.add(g);
    const soilMat = uniqueMat(0x7a4b2a);
    box(g, 2.2, 0.22, 2.2, soilMat, 0, 0, 0);
    const board = 0x9c6b3e;
    box(g, 2.44, 0.3, 0.12, board, 0, 0, 1.16);
    box(g, 2.44, 0.3, 0.12, board, 0, 0, -1.16);
    box(g, 0.12, 0.3, 2.2, board, 1.16, 0, 0);
    box(g, 0.12, 0.3, 2.2, board, -1.16, 0, 0);
    for (const dz of [-0.5, 0.5]) box(g, 2.0, 0.02, 0.18, 0x5c3820, 0, 0.22, dz, { cast: false });
    solidBox(x, z, 2.4, 2.4);

    const plants = [];
    const mounds = [];
    for (const [px, pz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const p = buildPlant();
      p.group.position.set(px, 0.22, pz);
      p.group.rotation.y = Math.random() * Math.PI;
      p.group.visible = false;
      g.add(p.group);
      plants.push(p);
      const m = box(g, 0.2, 0.06, 0.2, 0x4b2c1a, px, 0.22, pz, { cast: false });
      m.visible = false;
      mounds.push(m);
    }
    return {
      i, x, z, group: g, soilMat, plants, mounds,
      pos: new THREE.Vector3(x, 0, z),
      state: 'empty', g: 0, watered: false, wet: 0,
    };
  }

  plant(p) {
    p.state = 'growing';
    p.g = 0;
    p.watered = false;
  }

  water(p) {
    p.watered = true;
  }

  harvest(p) {
    p.state = 'empty';
    p.g = 0;
    p.watered = false;
  }

  update(dt, time) {
    for (const p of this.plots) {
      if (p.state === 'growing') {
        p.g += dt / (GROW_TIME / (p.watered ? 2 : 1));
        if (p.g >= 1) {
          p.g = 1;
          p.state = 'ready';
        }
      }
      p.wet += ((p.watered ? 1 : 0) - p.wet) * Math.min(1, dt * 3);
      p.soilMat.color.copy(SOIL).lerp(SOIL_WET, p.wet);

      const show = p.state !== 'empty';
      const e = 1 - (1 - p.g) * (1 - p.g);
      const sc = 0.12 + 0.88 * e;
      p.plants.forEach((pl, k) => {
        pl.group.visible = show && p.g > 0.04;
        pl.group.scale.setScalar(sc * 0.8);
        pl.group.rotation.z = Math.sin(time * 1.6 + k + p.i) * 0.04;
        const ready = p.state === 'ready';
        pl.cherries.forEach((c, j) => {
          c.visible = ready;
          if (ready) c.position.y = c.userData.baseY ?? (c.userData.baseY = c.position.y);
          if (ready) c.position.y = c.userData.baseY + Math.abs(Math.sin(time * 3 + j + k)) * 0.03;
        });
      });
      p.mounds.forEach((m) => (m.visible = show && p.g <= 0.04));
    }
  }
}
