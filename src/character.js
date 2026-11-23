import * as THREE from 'three';
import { makeSprite, blob, facingRow, pixelSnapOffset, CAM } from './sprites.js';
import { CONFIG } from './config.js';

const T = CONFIG.texel;

// Personagem = sprite 2D em pé (16x24) com 3 direções e 4 quadros de caminhada.
// sheet: nome do PNG em assets/sprites (player, npc_0..npc_7)
export function createCharacter(sheet, { tray = false } = {}) {
  const root = new THREE.Group();
  const inner = new THREE.Group(); // recebe o ajuste à grade de pixels
  root.add(inner);
  const body = makeSprite(sheet, 16, 24, 4, 3);
  inner.add(body.mesh);
  blob(inner, 0.75, 0.36);

  let traySpr = null;
  if (tray) {
    traySpr = makeSprite('tray', 16, 8, 5, 1);
    traySpr.mesh.visible = false;
    inner.add(traySpr.mesh);
  }

  const c = {
    root,
    angle: 0,
    carry: false,
    trayCount: 0,
    t: 0,
    face(angle) {
      this.angle = angle;
    },
    animate(dt, speed) {
      if (!Number.isFinite(speed)) speed = 0;
      const moving = speed > 0.3;
      this.t = moving ? this.t + dt * (0.8 + speed * 0.85) : 0;
      const frame = moving ? Math.floor(this.t * 2) % 4 : 0;
      const { row, flip, sx } = facingRow(this.angle);
      body.setFrame(frame, row, flip);

      if (traySpr) {
        traySpr.mesh.visible = this.trayCount > 0;
        traySpr.setFrame(Math.min(4, this.trayCount), 0);
        // na frente do corpo (mais perto da câmera); de costas fica atrás
        const toward = row === 1 ? -0.12 : 0.12;
        traySpr.mesh.position.set(CAM.toCam.x * toward, (5 * T) / Math.cos(CAM.pitch), CAM.toCam.z * toward);
        if (row === 2) traySpr.mesh.position.addScaledVector(CAM.right, Math.sign(sx) * 4 * T);
      }
    },
    // Chamado depois da câmera: prende o sprite à grade do render target
    snap() {
      inner.position.copy(pixelSnapOffset(root.position));
    },
  };
  return c;
}
