// Módulo de debug (só carrega com ?debug na URL). Clique do mouse:
//  - no chão: o barista anda até lá desviando de paredes e móveis
//  - em cafeteira / balcão / canteiro: anda até ele, interage (igual à tecla E) e mostra o estado
//  - em cliente ou barista: mostra o estado dele (atualiza ao vivo)
// Esc limpa a seleção e cancela o caminho. Qualquer tecla de movimento também cancela.
import * as THREE from 'three';
import { CAM } from '../sprites.js';
import { groundY } from '../util.js';
import { sfx } from '../audio.js';
import { findPath } from './pathfind.js';

const STYLE = `
#dbgPanel { position: fixed; left: 8px; top: 50%; transform: translateY(-50%); z-index: 4;
  max-width: 300px; padding: 8px 10px; background: rgba(20,14,28,.88); color: #f4ead8;
  border: 2px solid #ffd34e; font: 10px/1.6 'Press Start 2P', monospace; pointer-events: none;
  white-space: pre; display: none; }
#dbgBadge { position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 4;
  padding: 4px 8px; background: #e8424f; color: #fff; font: 9px 'Press Start 2P', monospace;
  pointer-events: none; }
.dbg-dot { position: absolute; left: 0; top: 0; width: 6px; height: 6px; margin: -3px 0 0 -3px;
  background: #ffd34e; border: 1px solid #2b2135; pointer-events: none; display: none; }
.dbg-dot.end { width: 10px; height: 10px; margin: -5px 0 0 -5px; background: #e8424f; }
`;

const ARRIVE = 0.15; // distância para considerar um ponto alcançado
const STUCK_TIME = 1.5; // sem progresso por esse tempo → desiste

export function attachDebug(S) {
  const { pix, hud } = S;
  const canvas = pix.renderer.domElement;
  const dir = CAM.toCam.clone().negate();

  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: STYLE }));
  const panel = Object.assign(document.createElement('div'), { id: 'dbgPanel' });
  const badge = Object.assign(document.createElement('div'), { id: 'dbgBadge', textContent: 'DEBUG · clique: andar / interagir / inspecionar · Esc limpa' });
  document.body.append(panel, badge);
  const dots = [];
  const dot = (i) => {
    while (dots.length <= i) {
      const d = document.createElement('div');
      d.className = 'dbg-dot';
      hud.overlay.appendChild(d);
      dots.push(d);
    }
    return dots[i];
  };

  let path = null; // pontos restantes
  let goalIt = null; // interativo para usar ao chegar
  let selected = null; // { kind, ref, it? }
  let stuck = { t: 0, d: Infinity };

  // ---------- Tela → chão (inverso de PixelRenderer.project)
  function screenToGround(cx, cy) {
    const fx = cx * pix.dpr, fy = pix.H - cy * pix.dpr;
    const rx = (fx - pix.W / 2) / pix.scale + pix.rtW / 2 - pix.shift.x;
    const ry = (fy - pix.H / 2) / pix.scale + pix.rtH / 2 - pix.shift.y;
    const o = new THREE.Vector3((rx / pix.rtW) * 2 - 1, (ry / pix.rtH) * 2 - 1, 0).unproject(pix.camera);
    let y = 0, p = null;
    for (let k = 0; k < 3; k++) {
      p = o.clone().addScaledVector(dir, (y - o.y) / dir.y);
      y = groundY(p.x, p.z);
    }
    return p;
  }

  // ---------- O que está sob o cursor
  // Prioridade: clientes e parceiro > objetos > o próprio barista (que costuma estar na frente deles)
  function pick(cx, cy) {
    const pc = pix.pixelCss;
    const hitChar = (list) => {
      let best = null, bestY = -Infinity;
      for (const c of list) {
        const feet = pix.project(c.ref.pos, 0), head = pix.project(c.ref.pos, 1.6);
        const hit = Math.abs(cx - feet.x) < 8 * pc && cy > head.y - 2 * pc && cy < feet.y + 2 * pc;
        if (hit && feet.y > bestY) { best = c; bestY = feet.y; } // o mais à frente na tela
      }
      return best;
    };
    const others = [
      ...[...S.players.values()].filter((p) => p !== S.local).map((p) => ({ kind: 'barista', ref: p })),
      ...S.npcs.list.map((n) => ({ kind: 'cliente', ref: n })),
    ];
    let best = hitChar(others);
    if (best) return best;

    let bd = 18 * pc;
    for (const it of S.interactables) {
      const p = pix.project(it.pos, it.py * 0.45);
      const d = Math.hypot(cx - p.x, cy - p.y);
      if (d < bd) { bd = d; best = { kind: 'objeto', ref: objectState(it), it }; }
    }
    return best || hitChar([{ kind: 'barista', ref: S.local }]);
  }

  function objectState(it) {
    if (it.id === 'machine') return S.machine;
    if (it.id.startsWith('plot')) return S.garden.plots[+it.id.slice(4)];
    if (it.id === 'stash') return { get cafes() { return S.game.counterCups; }, get capacidade() { return S.game.counterMax; } };
    return {
      get fila() { return S.npcs.queueLength; },
      get capacidade() { return S.game.queueCap; },
      get clienteNoBalcao() { return !!S.npcs.front(); },
    };
  }

  // ---------- Movimento por caminho (substitui o teclado enquanto houver caminho)
  function go(target, it = null) {
    path = findPath(S.local.pos, target);
    goalIt = it;
    stuck = { t: S.simTime, d: Infinity };
    if (!path) {
      sfx.deny();
      hud.toast('Debug: sem caminho até lá', 'red');
    }
  }
  function stop() {
    path = null;
    goalIt = null;
  }
  function useGoal() {
    const it = goalIt;
    stop();
    const l = it.label(S.local);
    if (l && !l.off) S.requestAction(it);
    else {
      sfx.deny();
      if (l) hud.toast(`Debug: ${l.text}`, 'orange');
    }
  }

  S.autoInput = (input) => {
    if (input.sx || input.sy) {
      if (path) stop(); // teclado manda
      return null;
    }
    if (!path) return null;
    const p = S.local.pos;
    const inReach = () => goalIt && Math.hypot(goalIt.pos.x - p.x, goalIt.pos.z - p.z) < goalIt.r - 0.2;
    if (inReach()) {
      useGoal();
      return null;
    }
    while (path.length && Math.hypot(path[0].x - p.x, path[0].z - p.z) < ARRIVE) {
      path.shift();
      stuck = { t: S.simTime, d: Infinity }; // novo ponto: recomeça a medir progresso
    }
    if (!path.length) {
      if (goalIt) useGoal();
      else stop();
      return null;
    }
    // Sem progresso (preso em cliente ou quina) → desiste
    const t = path[0], dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    if (d < stuck.d - 0.05) stuck = { t: S.simTime, d };
    else if (S.simTime - stuck.t > STUCK_TIME) {
      if (goalIt && Math.hypot(goalIt.pos.x - p.x, goalIt.pos.z - p.z) < goalIt.r) useGoal(); // perto o bastante
      else {
        stop();
        hud.toast('Debug: caminho bloqueado', 'orange');
      }
      return null;
    }
    // Direção no chão → eixos da tela (groundRight/groundUp são ortonormais)
    const wx = dx / d, wz = dz / d;
    return {
      sx: wx * CAM.groundRight.x + wz * CAM.groundRight.y,
      sy: wx * CAM.groundUp.x + wz * CAM.groundUp.y,
      run: input.run,
    };
  };

  // ---------- Entrada
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !S.started) return;
    const hit = pick(e.clientX, e.clientY);
    if (hit?.kind === 'objeto') {
      selected = hit;
      go(hit.it.approach || hit.it.pos, hit.it); // approach: lado de onde se usa (ex.: atrás do balcão)
    } else if (hit) {
      selected = hit;
    } else {
      selected = null;
      const g = screenToGround(e.clientX, e.clientY);
      go({ x: g.x, z: g.z });
    }
  });
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    selected = null;
    stop();
  });

  // ---------- Painel e marcadores (depois de cada quadro)
  const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v);
  const SKIP = new Set(['el', 'img', 'bar', 'fill', 'curIcon', 'iconW', 'seed', 'scene', 'world', 'particles', 'char', 'mesh', 'net']);
  function describe(sel) {
    const r = sel.ref;
    const lines = [`${sel.kind.toUpperCase()}${sel.it ? ` · ${sel.it.id}` : r.id != null ? ` · ${r.id}` : ''}`, ''];
    if (sel.it) {
      const l = sel.it.label(S.local);
      lines.push(`ação: ${l ? l.text + (l.off ? ' (bloq.)' : '') : '—'}`);
    }
    if (r.pos) lines.push(`pos: ${r.pos.x.toFixed(2)}, ${r.pos.z.toFixed(2)}`);
    const seen = new Set();
    for (let o = r; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const k of Object.getOwnPropertyNames(o)) {
        if (seen.has(k) || SKIP.has(k) || k === 'pos' || k === 'constructor') continue;
        seen.add(k);
        let v;
        try { v = r[k]; } catch { continue; }
        if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) lines.push(`${k}: ${fmt(v)}`);
        else if (Array.isArray(v) && k === 'path') lines.push(`path: ${v.length} pts`);
      }
    }
    return lines.join('\n');
  }

  function place(el, p, y = 0.05) {
    const s = pix.project({ x: p.x, y: groundY(p.x, p.z), z: p.z }, y);
    el.style.display = s.on ? 'block' : 'none';
    el.style.transform = `translate(${s.x}px, ${s.y}px)`;
  }

  const prevAfter = S.afterFrame;
  S.afterFrame = (dt) => {
    prevAfter?.(dt);
    if (document.hidden) return;
    // Caminho: pontos amarelos, destino em vermelho
    const pts = path || [];
    pts.forEach((p, i) => {
      const d = dot(i);
      d.classList.toggle('end', i === pts.length - 1);
      place(d, p);
    });
    for (let i = pts.length; i < dots.length; i++) dots[i].style.display = 'none';
    // Seleção some se o cliente saiu do jogo
    if (selected && selected.kind !== 'objeto' && !S.npcs.list.includes(selected.ref) && ![...S.players.values()].includes(selected.ref)) selected = null;
    panel.style.display = selected ? 'block' : 'none';
    if (selected) panel.textContent = describe(selected); // textContent: dados podem vir da rede
  };

  window.__S = S; // inspeção pelo console do navegador
  console.info('[debug] ativo: clique para andar, interagir e inspecionar');
  return { stop, go };
}
