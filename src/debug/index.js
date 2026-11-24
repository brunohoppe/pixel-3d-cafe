// Módulo de debug (só carrega com ?debug na URL). Mouse:
//  - botão esquerdo SEGURADO: o barista anda na direção do cursor (sem calcular caminho;
//    escorrega nas paredes). Soltou, parou.
//  - botão direito em cafeteira / balcão / bandeja / canteiro: anda reto até ele, interage
//    (igual à tecla E) e mostra o estado
//  - botão direito em cliente ou barista: mostra o estado dele (atualiza ao vivo)
// Esc limpa a seleção e para. Qualquer tecla de movimento também para.
import * as THREE from 'three';
import { CAM } from '../sprites.js';
import { groundY } from '../util.js';
import { sfx } from '../audio.js';

const STYLE = `
#dbgPanel { position: fixed; left: 8px; top: 50%; transform: translateY(-50%); z-index: 4;
  max-width: 300px; padding: 8px 10px; background: rgba(20,14,28,.88); color: #f4ead8;
  border: 2px solid #ffd34e; font: 10px/1.6 'Press Start 2P', monospace; pointer-events: none;
  white-space: pre; display: none; }
#dbgBadge { position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 4;
  padding: 4px 8px; background: #e8424f; color: #fff; font: 9px 'Press Start 2P', monospace;
  pointer-events: none; }
`;

const ARRIVE = 0.15; // distância para considerar o ponto alcançado
const STUCK_TIME = 0.6; // sem chegar mais perto por esse tempo → para

export function attachDebug(S) {
  const { pix, hud } = S;
  const canvas = pix.renderer.domElement;
  const dir = CAM.toCam.clone().negate();

  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: STYLE }));
  const panel = Object.assign(document.createElement('div'), { id: 'dbgPanel' });
  const badge = Object.assign(document.createElement('div'), { id: 'dbgBadge', textContent: 'DEBUG · segure o botão esquerdo: andar · botão direito: interagir / inspecionar · Esc limpa' });
  document.body.append(panel, badge);

  let hold = null; // {x, y} do cursor enquanto o botão esquerdo está segurado
  let target = null; // ponto {x, z} para onde andar (ação do botão direito)
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

  // ---------- Andar em linha reta até o alvo (substitui o teclado enquanto houver alvo)
  function go(t, it = null) {
    target = { x: t.x, z: t.z };
    goalIt = it;
    stuck = { t: S.simTime, d: Infinity };
  }
  function stop() {
    target = null;
    goalIt = null;
  }
  function useGoal() {
    const it = goalIt;
    stop();
    const l = it.label(S.local);
    if (l && !l.off) S.use(it);
    else {
      sfx.deny();
      if (l) hud.toast(`Debug: ${l.text}`, 'orange');
    }
  }

  // Direção no chão → eixos da tela (groundRight/groundUp são ortonormais)
  const toInput = (dx, dz, run) => {
    const d = Math.hypot(dx, dz), wx = dx / d, wz = dz / d;
    return {
      sx: wx * CAM.groundRight.x + wz * CAM.groundRight.y,
      sy: wx * CAM.groundUp.x + wz * CAM.groundUp.y,
      run,
    };
  };

  S.autoInput = (input) => {
    if (input.sx || input.sy) {
      if (target) stop(); // teclado manda
      return null;
    }
    const p = S.local.pos;
    if (hold) {
      // Recalcula o ponto sob o cursor a cada passo (a câmera anda junto com o barista)
      const g = screenToGround(hold.x, hold.y);
      const dx = g.x - p.x, dz = g.z - p.z;
      if (Math.hypot(dx, dz) < 0.3) return { sx: 0, sy: 0, run: input.run }; // cursor em cima do barista
      return toInput(dx, dz, input.run);
    }
    if (!target) return null;
    const goalD = goalIt && Math.hypot(goalIt.pos.x - p.x, goalIt.pos.z - p.z);
    if (goalIt && goalD < goalIt.r - 0.2) {
      useGoal();
      return null;
    }
    const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    if (d < ARRIVE) {
      if (goalIt) useGoal();
      else stop();
      return null;
    }
    // Preso num obstáculo (sem chegar mais perto) → para; se já alcança o objeto, usa
    if (d < stuck.d - 0.05) stuck = { t: S.simTime, d };
    else if (S.simTime - stuck.t > STUCK_TIME) {
      if (goalIt && goalD < goalIt.r) useGoal();
      else stop();
      return null;
    }
    return toInput(dx, dz, input.run);
  };

  // ---------- Entrada
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (!S.started) return;
    if (e.button === 0) {
      // Esquerdo: anda enquanto segurar (cancela uma ida até objeto)
      stop();
      hold = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId); // continua valendo se o cursor sair do canvas
    } else if (e.button === 2) {
      // Direito: ação no que estiver sob o cursor
      const hit = pick(e.clientX, e.clientY);
      selected = hit;
      if (hit?.kind === 'objeto') go(hit.it.pos, hit.it);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (hold) hold = { x: e.clientX, y: e.clientY };
  });
  const release = (e) => {
    if (!e || e.button === 0) hold = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', () => release());
  addEventListener('blur', () => release());
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    selected = null;
    hold = null;
    stop();
  });

  // ---------- Painel (depois de cada quadro)
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

  const prevAfter = S.afterFrame;
  S.afterFrame = (dt) => {
    prevAfter?.(dt);
    if (document.hidden) return;
    // Seleção some se o cliente saiu do jogo
    if (selected && selected.kind !== 'objeto' && !S.npcs.list.includes(selected.ref) && ![...S.players.values()].includes(selected.ref)) selected = null;
    panel.style.display = selected ? 'block' : 'none';
    if (selected) panel.textContent = describe(selected); // textContent: dados podem vir da rede
  };

  window.__S = S; // inspeção pelo console do navegador
  console.info('[debug] ativo: clique para andar, interagir e inspecionar');
  return { stop, go };
}
