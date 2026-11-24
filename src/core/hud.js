import { icon } from '../icons.js';

// HUD fixo + elementos presos ao mundo (balão de interação, barra da máquina, textos)
export class Hud {
  constructor(pix) {
    this.pix = pix;
    this.$ = (id) => document.getElementById(id);
    this.overlay = this.$('overlay');
    this.promptEl = this.$('prompt');
    this.machineBar = this.$('machineBar');
    this.starEls = [...this.$('stars').children];
    this.ui = {};
    this.floaters = [];
    this.$('icoCoin').src = icon('coin').url;
    this.$('icoBean').src = icon('bean').url;
    this.$('icoCup').src = icon('cup').url;
    if (this.$('icoPartner')) this.$('icoPartner').src = icon('cup').url;
    this.project = (pos, yOff) => pix.project(pos, yOff);
  }

  setText(id, v) {
    if (this.ui[id] !== v && this.$(id)) {
      this.ui[id] = v;
      this.$(id).textContent = v;
    }
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    const box = this.$('toasts');
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2400);
    setTimeout(() => t.remove(), 2900);
  }

  float(pos, text, color) {
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.color = color;
    this.overlay.appendChild(el);
    this.floaters.push({ el, pos: pos.clone(), t: 0 });
  }

  objective({ player, npcs, machine, garden, game }) {
    if (!game.open) return 'Abra a cafeteria: ponha o CAVALETE na calçada';
    if (player.carry > 0) return npcs.front() ? 'Sirva o cliente no BALCÃO' : 'Aguarde um cliente no balcão';
    if (machine.ready > 0) return 'Pegue o café na CAFETEIRA';
    if (machine.brewing) return 'Preparando café...';
    if (game.beans > 0) return 'Use a CAFETEIRA atrás do balcão';
    if (garden.plots.some((p) => p.state === 'ready')) return 'Colha os grãos na HORTA';
    return 'Plante e regue café na HORTA';
  }

  // s: { game, player, partner, npcs, machine, garden, current, coop }
  update(dt, s) {
    const { game, player, machine, current } = s;

    if (current) {
      const p = this.project(current.it.pos, current.it.py);
      this.promptEl.style.display = 'block';
      this.promptEl.classList.toggle('off', !!current.l.off);
      if (this.promptEl.dataset.t !== current.l.text) {
        this.promptEl.dataset.t = current.l.text;
        this.promptEl.innerHTML = `${current.l.off ? '' : '<span class="key">E</span>'}${current.l.text}`;
      }
      this.promptEl.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    } else this.promptEl.style.display = 'none';

    if (machine.brewing || machine.ready > 0) {
      const p = this.project(machine.pos, 2.1);
      this.machineBar.style.display = 'block';
      this.machineBar.firstElementChild.style.width = `${machine.brewing ? (machine.t / machine.dur) * 100 : 100}%`;
      this.machineBar.classList.toggle('done', !machine.brewing);
      this.machineBar.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    } else this.machineBar.style.display = 'none';

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      const p = this.project(f.pos, 2.4 + f.t * 1.2);
      f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      f.el.style.opacity = String(Math.min(1, 2.2 - f.t * 1.6));
      if (f.t > 1.4) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }

    // Parceiro (co-op): etiqueta sobre o personagem e linha no HUD
    if (s.coop) {
      const tag = this.$('partnerTag');
      if (s.partner && tag) {
        const p = this.project(s.partner.pos, 1.75);
        tag.style.display = p.on ? 'block' : 'none';
        tag.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      } else if (tag) tag.style.display = 'none';
      this.setText('partner', s.partner ? `${s.partner.carry}/${game.maxCarry}` : 'aguardando...');
    }

    const stars = game.stars;
    this.starEls.forEach((el, i) => {
      const src = icon(i < stars ? 'star' : 'starOff').url;
      if (el.dataset.src !== src) {
        el.src = src;
        el.dataset.src = src;
      }
    });
    const prog = stars >= 5 ? Math.min(1, (game.rep - 80) / 20) : (game.rep % 20) / 20;
    this.$('repFill').style.width = `${prog * 100}%`;
    this.setText('queueInfo', `Fila ${s.npcs.queueLength}/${game.queueCap}`);
    this.setText('money', `$${game.money}`);
    this.setText('beans', `${game.beans}`);
    this.setText('cups', `${player.carry}/${game.maxCarry}`);
    this.setText('served', `Atendidos ${game.served}`);
    this.setText('objective', this.objective(s));
  }
}
