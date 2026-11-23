import * as THREE from 'three';
import { boxGeo, mat } from './util.js';

function part(parent, w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Personagem chibi de blocos. Frente = +Z.
export function createCharacter(o) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mkLeg = (x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.5, 0);
    part(leg, 0.18, 0.46, 0.2, o.pants, 0, -0.22, 0);
    part(leg, 0.2, 0.1, 0.27, o.shoes, 0, -0.45, 0.03);
    body.add(leg);
    return leg;
  };
  const legL = mkLeg(-0.12);
  const legR = mkLeg(0.12);

  part(body, 0.52, 0.56, 0.32, o.shirt, 0, 0.78, 0);
  if (o.apron) {
    part(body, 0.44, 0.62, 0.04, o.apron, 0, 0.72, 0.17);
    part(body, 0.2, 0.1, 0.045, 0xf4ead8, 0, 0.72, 0.18);
  }

  const mkArm = (x) => {
    const arm = new THREE.Group();
    arm.position.set(x, 1.0, 0);
    part(arm, 0.15, 0.4, 0.17, o.shirt, 0, -0.18, 0);
    part(arm, 0.13, 0.13, 0.15, o.skin, 0, -0.43, 0);
    body.add(arm);
    return arm;
  };
  const armL = mkArm(-0.34);
  const armR = mkArm(0.34);

  const head = new THREE.Group();
  head.position.set(0, 1.06, 0);
  body.add(head);
  part(head, 0.5, 0.46, 0.46, o.skin, 0, 0.23, 0);
  part(head, 0.07, 0.11, 0.02, 0x2b2135, -0.11, 0.24, 0.235);
  part(head, 0.07, 0.11, 0.02, 0x2b2135, 0.11, 0.24, 0.235);
  part(head, 0.08, 0.04, 0.02, 0xf29a9a, -0.18, 0.14, 0.232);
  part(head, 0.08, 0.04, 0.02, 0xf29a9a, 0.18, 0.14, 0.232);
  part(head, 0.54, 0.13, 0.5, o.hair, 0, 0.49, 0);
  part(head, 0.54, 0.32, 0.12, o.hair, 0, 0.3, -0.2);
  part(head, 0.1, 0.22, 0.42, o.hair, -0.25, 0.33, -0.02);
  part(head, 0.1, 0.22, 0.42, o.hair, 0.25, 0.33, -0.02);
  if (o.longHair) part(head, 0.5, 0.35, 0.1, o.hair, 0, 0.0, -0.22);
  if (o.hat) {
    part(head, 0.56, 0.16, 0.52, o.hat, 0, 0.6, 0);
    part(head, 0.56, 0.05, 0.22, o.hat, 0, 0.52, 0.32);
  }

  return {
    root, body, head, legL, legR, armL, armR,
    phase: Math.random() * 6, amt: 0, carry: false, t: Math.random() * 10,
    animate(dt, speed) {
      if (!Number.isFinite(speed)) speed = 0;
      this.t += dt;
      const moving = Math.min(1, speed / 1.5);
      this.amt += (moving - this.amt) * Math.min(1, dt * 10);
      this.phase += dt * (5 + speed * 2.2);
      const s = Math.sin(this.phase) * 0.75 * this.amt;
      this.legL.rotation.x = s;
      this.legR.rotation.x = -s;
      if (this.carry) {
        const target = -1.3;
        this.armL.rotation.x += (target - this.armL.rotation.x) * Math.min(1, dt * 12);
        this.armR.rotation.x = this.armL.rotation.x;
      } else {
        this.armL.rotation.x = -s * 0.8;
        this.armR.rotation.x = s * 0.8;
      }
      this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.06 * this.amt;
      this.head.position.y = 1.06 + Math.sin(this.t * 2.2) * 0.012 * (1 - this.amt);
    },
  };
}
