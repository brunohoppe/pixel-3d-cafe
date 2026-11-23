import * as THREE from 'three';
import { box, tmat, solidBox } from './util.js';
import { makeSprite, pixelSnapOffset, CAM } from './sprites.js';
import { CONFIG } from './config.js';

export const GROW_TIME = 28; // segundos (metade se regado)
const CENTERS = [
  [9.3, -8.6], [12, -8.6], [14.7, -8.6],
  [9.3, -4.5], [12, -4.5], [14.7, -4.5],
];
const SOIL = new THREE.Color(0xffffff);
const SOIL_WET = new THREE.Color(0x8c7a78);

// Quadros de coffee_plant.png: 0 broto, 1 pequeno, 2 médio, 3 grande, 4 com frutos, 5 semente
function stageFrame(p) {
  if (p.state === 'ready') return 4;
  if (p.g < 0.04) return 5;
  if (p.g < 0.3) return 0;
  if (p.g < 0.6) return 1;
  if (p.g < 0.85) return 2;
  return 3;
}

export class Garden {
  constructor(scene) {
    this.plots = CENTERS.map(([x, z], i) => this.makePlot(scene, x, z, i));
  }

  makePlot(scene, x, z, i) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    scene.add(g);
    const soilMat = tmat('soil', { unique: true });
    box(g, 2.2, 0.22, 2.2, soilMat, 0, 0, 0);
    const board = tmat('fence');
    box(g, 2.44, 0.3, 0.12, board, 0, 0, 1.16);
    box(g, 2.44, 0.3, 0.12, board, 0, 0, -1.16);
    box(g, 0.12, 0.3, 2.2, board, 1.16, 0, 0);
    box(g, 0.12, 0.3, 2.2, board, -1.16, 0, 0);
    solidBox(x, z, 2.4, 2.4);

    // Um material por canteiro (todas as 4 mudas mostram o mesmo estágio)
    const spr = makeSprite('coffee_plant', 16, 16, 6, 1);
    const plants = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([px, pz]) => {
      const m = new THREE.Mesh(spr.mesh.geometry, spr.material);
      m.rotation.y = spr.mesh.rotation.y;
      const wp = new THREE.Vector3(x + px, 0.22, z + pz);
      m.position.copy(wp.add(pixelSnapOffset(wp, new THREE.Vector3()))).sub(g.position);
      m.userData.base = m.position.clone();
      m.visible = false;
      g.add(m);
      return m;
    });
    return {
      i, x, z, group: g, soilMat, plants, spr,
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
      // Solo molhado escurece em degraus (sem gradiente)
      p.wet = p.watered ? 1 : 0;
      p.soilMat.color.copy(SOIL).lerp(SOIL_WET, p.wet);

      const show = p.state !== 'empty';
      p.spr.setFrame(stageFrame(p), 0);
      p.plants.forEach((m, k) => {
        m.visible = show;
        // Vento opcional: alterna 1 pixel inteiro, nunca sub-pixel
        m.position.copy(m.userData.base);
        if (CONFIG.plantWind && Math.sin(time * 1.5 + k + p.i) > 0.7) m.position.addScaledVector(CAM.right, CONFIG.texel);
      });
    }
  }
}
