// Caminho no chão evitando paredes/móveis: grade + A* + atalhos em linha reta.
// A grade é montada uma vez (na 1ª consulta) a partir dos `colliders` do mundo.
import { colliders, clamp } from '../util.js';

const CELL = 0.25;
const X0 = -44, X1 = 44, Z0 = -15, Z1 = 12.3; // mesmos limites do Player.move
const NX = Math.ceil((X1 - X0) / CELL), NZ = Math.ceil((Z1 - Z0) / CELL);
const RADIUS = 0.38; // raio do barista (0.35) + folga

let grid = null;

function build() {
  grid = new Uint8Array(NX * NZ);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x = X0 + (i + 0.5) * CELL, z = Z0 + (j + 0.5) * CELL;
      for (const c of colliders) {
        const dx = x - clamp(x, c.minX, c.maxX), dz = z - clamp(z, c.minZ, c.maxZ);
        if (dx * dx + dz * dz < RADIUS * RADIUS) {
          grid[j * NX + i] = 1;
          break;
        }
      }
    }
  }
}

const cellOf = (x, z) => [clamp(Math.floor((x - X0) / CELL), 0, NX - 1), clamp(Math.floor((z - Z0) / CELL), 0, NZ - 1)];
const center = (i, j) => ({ x: X0 + (i + 0.5) * CELL, z: Z0 + (j + 0.5) * CELL });
const free = (i, j) => i >= 0 && j >= 0 && i < NX && j < NZ && !grid[j * NX + i];

export function isFree(x, z) {
  if (!grid) build();
  const [i, j] = cellOf(x, z);
  return free(i, j);
}

// Célula livre mais próxima (busca em anéis)
function nearestFree(i, j) {
  if (free(i, j)) return [i, j];
  for (let r = 1; r < 40; r++) {
    let best = null, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !free(i + di, j + dj)) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = [i + di, j + dj]; }
      }
    }
    if (best) return best;
  }
  return null;
}

// Linha reta sem bater em nada?
function clear(a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.ceil(d / (CELL * 0.5));
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    if (!isFree(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

// Heap binário mínimo por custo f
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

/**
 * Caminho de `from` até `to` (objetos {x, z}). Retorna a lista de pontos (sem o início)
 * ou null se não houver caminho. Se o destino estiver bloqueado, vai até o ponto livre mais perto.
 */
export function findPath(from, to) {
  if (!grid) build();
  const s = nearestFree(...cellOf(from.x, from.z));
  const g = nearestFree(...cellOf(to.x, to.z));
  if (!s || !g) return null;
  const goal = free(...cellOf(to.x, to.z)) ? { x: to.x, z: to.z } : center(...g);
  if (clear(from, goal)) return [goal];

  const gi = g[1] * NX + g[0];
  const cost = new Float32Array(NX * NZ).fill(Infinity);
  const prev = new Int32Array(NX * NZ).fill(-1);
  const h = (i, j) => Math.hypot(i - g[0], j - g[1]);
  const open = new Heap();
  const si = s[1] * NX + s[0];
  cost[si] = 0;
  open.push({ k: si, f: h(s[0], s[1]) });

  while (open.size) {
    const { k, f } = open.pop();
    if (k === gi) break;
    const i = k % NX, j = (k / NX) | 0;
    if (f - h(i, j) > cost[k] + 1e-4) continue; // entrada velha
    for (const [di, dj, c] of DIRS) {
      const ni = i + di, nj = j + dj;
      if (!free(ni, nj)) continue;
      if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue; // não corta quina
      const nk = nj * NX + ni, nc = cost[k] + c;
      if (nc >= cost[nk]) continue;
      cost[nk] = nc;
      prev[nk] = k;
      open.push({ k: nk, f: nc + h(ni, nj) });
    }
  }
  if (prev[gi] < 0 && gi !== si) return null;

  // Reconstrói e encurta: pula pontos enquanto houver linha reta livre
  const cells = [];
  for (let k = gi; k !== si && k >= 0; k = prev[k]) cells.push(center(k % NX, (k / NX) | 0));
  cells.reverse();
  cells[cells.length - 1] = goal;
  const out = [];
  let a = from, idx = 0;
  while (idx < cells.length) {
    let far = idx;
    for (let k = cells.length - 1; k > idx; k--) {
      if (clear(a, cells[k])) { far = k; break; }
    }
    out.push(cells[far]);
    a = cells[far];
    idx = far + 1;
  }
  return out;
}
