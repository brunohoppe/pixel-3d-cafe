import * as THREE from 'three';

// Cafeteira: 1 grão → 4 s → 2 xícaras na bandeja da máquina (máx. 4)
export class Machine {
  constructor(world, particles) {
    this.world = world;
    this.particles = particles;
    this.brewing = false;
    this.t = 0;
    this.dur = 4;
    this.ready = 0;
    this.max = 4;
    this.pos = new THREE.Vector3(-5, 0.12, -10.4);
    this.steamT = 0;
    this.chimneyT = 0;
  }

  options(player, game) {
    const canPick = this.ready > 0 && player.carry < game.maxCarry;
    const picked = canPick ? Math.min(this.ready, game.maxCarry - player.carry) : 0;
    const canBrew = !this.brewing && game.beans > 0 && this.ready - picked <= this.max - 2;
    return { canPick, canBrew };
  }

  // Lógica (só quem simula: solo ou host)
  tick(dt, fx) {
    if (!this.brewing) return;
    this.t += dt;
    if (this.t >= this.dur) {
      this.brewing = false;
      this.ready = Math.min(this.max, this.ready + 2);
      fx.sfx('ready');
      fx.float(this.pos, 'Café pronto!', '#ffd34e');
    }
  }

  // Visual (todos): xícaras, luz, vapor e fumaça da chaminé
  render(dt, time) {
    const w = this.world;
    if (this.brewing) {
      this.steamT -= dt;
      if (this.steamT <= 0) {
        this.steamT = 0.08;
        const s = w.machine.steamPos;
        this.particles.spawn(s.x + (Math.random() - 0.5) * 0.5, s.y, s.z, 0, 1.2, 0, 0.9, 0.13, 0xf4f4f4, -0.3);
      }
    }
    w.machine.cups.forEach((c, i) => (c.visible = i < this.ready));
    const lm = w.machine.lightMat;
    const col = this.brewing ? (Math.floor(time * 4) % 2 ? 0xffb84e : 0x7a4a1a) : this.ready > 0 ? 0x5bff7b : 0xe8424f;
    lm.color.setHex(col);
    lm.emissive.setHex(col);

    this.chimneyT -= dt;
    if (this.chimneyT <= 0 && w.fadeGroup.visible) {
      this.chimneyT = this.brewing ? 0.15 : 0.6;
      const c = w.chimneyPos;
      this.particles.spawn(c.x + (Math.random() - 0.5) * 0.3, c.y, c.z, 0.3, 0.9, 0.1, 2.2, 0.28, 0xe8e8ee, -0.05);
    }
  }

  toNet() {
    return [this.brewing ? 1 : 0, Math.round(this.t * 100) / 100, this.ready];
  }

  fromNet(a) {
    this.brewing = !!a[0];
    this.t = a[1];
    this.ready = a[2];
  }
}
