import * as THREE from 'three';
import { createCharacter } from '../character.js';
import { CAM } from '../sprites.js';
import { clamp, lerpAngle, resolveCircle, groundY } from '../util.js';

// Um barista. O jogador local se move com `move`; o do parceiro segue a rede.
export class Player {
  constructor(id, sheet, scene, x, z) {
    this.id = id;
    this.scene = scene;
    this.char = createCharacter(sheet, { tray: true });
    this.char.root.position.set(x, groundY(x, z), z);
    scene.add(this.char.root);
    this.vel = new THREE.Vector3();
    this.angle = 0;
    this.speed = 0;
    this.carry = 0; // xícaras na bandeja (por jogador)
    this.net = null; // último estado recebido da rede
  }

  get pos() {
    return this.char.root.position;
  }

  // input: { sx, sy } em coordenadas de tela, run = correr
  move(dt, input, obstacles) {
    let ix = input.sx * CAM.groundRight.x + input.sy * CAM.groundUp.x;
    let iz = input.sx * CAM.groundRight.y + input.sy * CAM.groundUp.y;
    const len = Math.hypot(ix, iz);
    if (len) { ix /= len; iz /= len; }
    const sp = input.run ? 6.2 : 4.0;
    const k = 1 - Math.exp(-dt * 12);
    this.vel.x += (ix * sp - this.vel.x) * k;
    this.vel.z += (iz * sp - this.vel.z) * k;

    const p = this.pos;
    p.x += this.vel.x * dt;
    p.z += this.vel.z * dt;
    for (const o of obstacles) {
      const dx = p.x - o.x, dz = p.z - o.z;
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

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.3) this.angle = lerpAngle(this.angle, Math.atan2(this.vel.x, this.vel.z), 1 - Math.exp(-dt * 14));
  }

  // Parceiro: guarda o alvo recebido e persegue suavemente
  setNetTarget(x, z, a, s) {
    this.net = { x, z, a, s };
  }

  followNet(dt) {
    if (!this.net) return;
    const k = 1 - Math.exp(-dt * 15);
    const p = this.pos;
    p.x += (this.net.x - p.x) * k;
    p.z += (this.net.z - p.z) * k;
    p.y += (groundY(p.x, p.z) - p.y) * Math.min(1, dt * 15);
    this.angle = lerpAngle(this.angle, this.net.a, k);
    this.speed = this.net.s;
  }

  // Pose direta (cliente, a partir dos snapshots interpolados)
  setPose(x, z, a, s) {
    this.pos.set(x, groundY(x, z), z);
    this.angle = a;
    this.speed = s;
  }

  render(dt) {
    this.char.face(this.angle);
    this.char.trayCount = this.carry;
    this.char.animate(dt, this.speed);
  }

  remove() {
    this.scene.remove(this.char.root);
  }
}
