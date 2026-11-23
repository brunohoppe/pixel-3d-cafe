import * as THREE from 'three';

// Partículas cúbicas simples (vapor, terra, água, folhas)
export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mats = new Map();
    this.pool = [];
    this.active = [];
  }

  mat(color) {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color });
      this.mats.set(color, m);
    }
    return m;
  }

  spawn(x, y, z, vx, vy, vz, life, size, color, grav = 0) {
    const m = this.pool.pop() || new THREE.Mesh(this.geo);
    m.material = this.mat(color);
    m.position.set(x, y, z);
    m.scale.setScalar(size);
    m.userData = { vx, vy, vz, life, max: life, size, grav };
    this.scene.add(m);
    this.active.push(m);
  }

  burst(pos, color, n = 8, { up = 2.5, spread = 1.5, grav = 7, size = 0.12, y = 0.4 } = {}) {
    for (let i = 0; i < n; i++) {
      this.spawn(
        pos.x + (Math.random() - 0.5) * 0.6, pos.y + y, pos.z + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * spread, up * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * spread,
        0.5 + Math.random() * 0.4, size, color, grav,
      );
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const m = this.active[i];
      const d = m.userData;
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(m);
        this.active.splice(i, 1);
        this.pool.push(m);
        continue;
      }
      d.vy -= d.grav * dt;
      m.position.x += d.vx * dt;
      m.position.y += d.vy * dt;
      m.position.z += d.vz * dt;
      m.scale.setScalar(d.size * Math.sqrt(d.life / d.max));
    }
  }
}
