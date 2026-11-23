import { createCharacter } from '../../character.js';
import { NPC_SHEETS, NPC_STATES, createBubble, renderBubble } from '../../npc.js';
import { groundY, lerpAngle } from '../../util.js';

const lerp = (a, b, t) => a + (b - a) * t;

// Clientes "fantoche" do parceiro: não decidem nada, só copiam o host.
// Expõe a mesma interface que o NPCManager usa no resto do jogo.
export class NPCPuppets {
  constructor(scene, overlay) {
    this.scene = scene;
    this.overlay = overlay;
    this.map = new Map();
    this.list = [];
    this.q = [0, 0];
  }

  get queueLength() {
    return this.q[0];
  }

  front() {
    return this.q[1] ? true : null;
  }

  // Índices do array de cada cliente (ver NPCManager.toNet)
  apply(a, b, k, dt) {
    this.q = b.q;
    const prev = new Map(a.n.map((row) => [row[0], row]));
    const seen = new Set();
    for (const rb of b.n) {
      const id = rb[0];
      seen.add(id);
      let n = this.map.get(id);
      if (!n) {
        const char = createCharacter(NPC_SHEETS[rb[1]]);
        this.scene.add(char.root);
        n = { ...createBubble(this.overlay), id, char, pos: char.root.position, patienceMax: 1, fresh: true };
        this.map.set(id, n);
        this.list.push(n);
      }
      const ra = prev.get(id) || rb;
      const x = lerp(ra[2], rb[2], k), z = lerp(ra[3], rb[3], k);
      const speed = n.fresh ? 0 : Math.hypot(x - n.pos.x, z - n.pos.z) / dt;
      n.fresh = false;
      n.pos.set(x, groundY(x, z), z);
      n.angle = lerpAngle(ra[4], rb[4], k);
      n.state = NPC_STATES[rb[5]];
      n.wants = !!(rb[6] & 1);
      n.decided = !!(rb[6] & 2);
      n.waiting = !!(rb[6] & 4);
      n.patience = rb[7];
      n.icon = rb[8];
      n.tempIcon = rb[9];
      n.tempT = rb[10];
      n.seed = rb[11];
      n.char.face(n.angle);
      n.char.animate(dt, speed);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      if (seen.has(n.id)) continue;
      this.scene.remove(n.char.root);
      n.el.remove();
      this.map.delete(n.id);
      this.list.splice(i, 1);
    }
  }

  updateOverlay(project, ps, time) {
    for (const n of this.list) renderBubble(n, project, ps, time);
  }
}
