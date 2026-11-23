// Gera todos os PNGs de pixel art do jogo (texturas + sprites), sem dependências.
// Uso: node tools/gen-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEX_DIR = path.join(ROOT, 'assets', 'textures');
const SPR_DIR = path.join(ROOT, 'assets', 'sprites');
fs.mkdirSync(TEX_DIR, { recursive: true });
fs.mkdirSync(SPR_DIR, { recursive: true });

// ------------------------------------------------------------------ PNG
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
function shade(c, f) {
  const [r, g, b] = hex(c);
  const k = (v) => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))));
  return '#' + [k(r), k(g), k(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

class Img {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.d = Buffer.alloc(w * h * 4);
  }
  set(x, y, c) {
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = hex(c);
    const i = (y * this.w + x) * 4;
    this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = 255;
  }
  clear(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[(y * this.w + x) * 4 + 3] = 0;
  }
  on(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.d[(y * this.w + x) * 4 + 3] > 0;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  fill(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, fn(x, y));
  }
  // Contorno externo de 1px dentro de uma região (frame)
  outline(c, x0 = 0, y0 = 0, w = this.w, h = this.h) {
    const pts = [];
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (this.on(x, y)) continue;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return nx >= x0 && ny >= y0 && nx < x0 + w && ny < y0 + h && this.on(nx, ny);
        });
        if (n) pts.push([x, y]);
      }
    }
    for (const [x, y] of pts) this.set(x, y, c);
  }
  save(dir, name) {
    fs.writeFileSync(path.join(dir, name), encodePNG(this.w, this.h, this.d));
    console.log('  ', path.relative(ROOT, path.join(dir, name)), `${this.w}x${this.h}`);
  }
}

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INK = '#2b2135';

// ------------------------------------------------------------------ TEXTURAS
console.log('Texturas:');

// Piso de tábuas
{
  const R = rng(1);
  const img = new Img(32, 32);
  const bases = ['#b07448', '#a76b40', '#b87d4f', '#a2673d'];
  const joints = [5, 21, 13, 27];
  const streaks = bases.map(() => Array.from({ length: 3 }, () => [Math.floor(R() * 32), 2 + Math.floor(R() * 4), 2 + Math.floor(R() * 4)]));
  img.fill((x, y) => {
    const p = Math.floor(y / 8), yy = y % 8;
    if (yy === 7) return '#5e3820';
    if (x === joints[p]) return '#6e4126';
    if (yy === 0 || x === (joints[p] + 1) % 32) return shade(bases[p], 1.15);
    for (const [sx, sy, len] of streaks[p]) if (yy === sy && (x - sx + 32) % 32 < len) return shade(bases[p], 0.86);
    return bases[p];
  });
  img.save(TEX_DIR, 'wood_floor.png');
}

// Parede (tábuas horizontais claras)
{
  const R = rng(2);
  const img = new Img(32, 32);
  img.fill((x, y) => {
    const yy = y % 8;
    if (yy === 0) return '#fff4dc';
    if (yy === 6) return '#e3cda6';
    if (yy === 7) return '#c4a77c';
    return R() < 0.04 ? '#ead6b2' : '#f3e2c4';
  });
  img.save(TEX_DIR, 'wall.png');
}

// Balcão (painéis de madeira escura)
{
  const img = new Img(32, 32);
  img.fill((x, y) => {
    if (y === 0) return '#9a6640';
    if (y === 31) return '#3e2414';
    const inPanel = (px) => x >= px && x <= px + 11 && y >= 4 && y <= 27;
    for (const px of [3, 18]) {
      if (inPanel(px)) {
        if (x === px || y === 4) return '#4a2a16';
        if (x === px + 11 || y === 27) return '#8f5d36';
        return '#7a4c2c';
      }
    }
    return '#6b4226';
  });
  img.save(TEX_DIR, 'counter.png');
}

// Mesa (tampo de madeira)
{
  const img = new Img(16, 16);
  img.fill((x, y) => {
    const yy = y % 4;
    if (yy === 3) return '#6e3f22';
    if (yy === 0) return '#b37a4c';
    return x === 7 && yy === 1 ? '#8a5432' : '#9a623a';
  });
  img.save(TEX_DIR, 'table.png');
}

// Cadeira (madeira amarelada)
{
  const img = new Img(16, 16);
  img.fill((x, y) => {
    const yy = y % 5;
    if (yy === 4) return '#a8772a';
    if (yy === 0) return '#f0c463';
    return x % 8 === 3 && yy === 2 ? '#c99436' : '#d9a441';
  });
  img.save(TEX_DIR, 'chair.png');
}

// Calçada (lajotas 16x16)
{
  const R = rng(3);
  const img = new Img(32, 32);
  img.fill((x, y) => {
    if (x % 16 === 0 || y % 16 === 0) return '#a99f8b';
    if (x % 16 === 1 || y % 16 === 1) return '#e8e1d0';
    if (x % 16 === 15 || y % 16 === 15) return '#c6bca8';
    return R() < 0.05 ? '#cbc1ab' : '#d8cfbb';
  });
  img.save(TEX_DIR, 'sidewalk.png');
}

// Grama (tufos em "v" e florzinhas)
{
  const R = rng(4);
  const img = new Img(32, 32);
  img.fill(() => (R() < 0.12 ? '#6aac48' : '#78bb52'));
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(R() * 32), y = Math.floor(R() * 32);
    img.set(x, y, '#98d46a');
    img.set((x + 31) % 32, (y + 1) % 32, '#5c9c42');
    img.set((x + 1) % 32, (y + 1) % 32, '#5c9c42');
  }
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(R() * 32), y = Math.floor(R() * 32);
    img.set(x, y, ['#ffffff', '#ffd34e', '#ff8fb1'][i]);
  }
  img.save(TEX_DIR, 'grass.png');
}

// Telhado (telhas escalonadas)
{
  const R = rng(5);
  const img = new Img(32, 32);
  img.fill((x, y) => {
    const row = Math.floor(y / 8), yy = y % 8;
    const xx = (x + (row % 2) * 8) % 16;
    if (yy === 7) return '#7a3022';
    if (xx === 0) return '#93402e';
    if (yy === 0) return '#d26e55';
    if (yy === 6) return '#a24735';
    return R() < 0.06 ? '#a84a36' : '#b8543e';
  });
  img.save(TEX_DIR, 'roof.png');
}

// Vaso de terracota
{
  const img = new Img(16, 16);
  img.fill((x, y) => {
    if (y === 0) return '#eca47a';
    if (y < 3) return '#d97a4e';
    if (y === 3) return '#8a3f22';
    if (x === 3) return '#d58256';
    if (x === 12) return '#9e4c2c';
    if (y === 15) return '#8a3f22';
    return '#c0623a';
  });
  img.save(TEX_DIR, 'pot.png');
}

// Folhagem de planta
{
  const R = rng(6);
  const img = new Img(16, 16);
  img.fill(() => '#2f6f34');
  for (let i = 0; i < 9; i++) {
    const cx = Math.floor(R() * 16), cy = Math.floor(R() * 16);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 5) continue;
        const x = (cx + dx + 16) % 16, y = (cy + dy + 16) % 16;
        let c = '#4fa64a';
        if (dx + dy <= -2) c = '#7fd06a';
        else if (dx + dy >= 2) c = '#3a8a3e';
        img.set(x, y, c);
      }
    }
  }
  img.save(TEX_DIR, 'plant.png');
}

// Extras: asfalto, terra, casca, cerca, tijolo, toldo
{
  const R = rng(7);
  const img = new Img(32, 32);
  img.fill(() => { const r = R(); return r < 0.03 ? '#5a5d69' : r < 0.06 ? '#494b55' : '#50535e'; });
  img.save(TEX_DIR, 'asphalt.png');
}
{
  const R = rng(8);
  const img = new Img(16, 16);
  img.fill(() => { const r = R(); return r < 0.1 ? '#8e5d36' : r < 0.2 ? '#5c3820' : '#7a4b2a'; });
  img.save(TEX_DIR, 'soil.png');
}
{
  const img = new Img(16, 16);
  img.fill((x, y) => (x % 5 === 1 ? '#5e3a22' : x % 5 === 3 && y % 6 < 3 ? '#8f6440' : '#7a5032'));
  img.save(TEX_DIR, 'bark.png');
}
{
  const img = new Img(16, 16);
  img.fill((x, y) => (y % 8 === 0 ? '#e0a46a' : y % 8 === 7 ? '#94602e' : x === 9 && y % 8 === 3 ? '#a86f3a' : '#c98a4e'));
  img.save(TEX_DIR, 'fence.png');
}
{
  const img = new Img(16, 16);
  img.fill((x, y) => {
    const row = Math.floor(y / 4), yy = y % 4, xx = (x + (row % 2) * 4) % 8;
    if (yy === 3 || xx === 0) return '#6e3226';
    return yy === 0 ? '#b55d48' : '#9a4b3a';
  });
  img.save(TEX_DIR, 'brick.png');
}
{
  const img = new Img(16, 16);
  img.fill((x) => (Math.floor(x / 4) % 2 ? '#fff1dc' : '#d94a3d'));
  img.save(TEX_DIR, 'awning.png');
}

// ------------------------------------------------------------------ Letreiros (fonte 3x5)
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], C: ['###', '#..', '#..', '#..', '###'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  L: ['#..', '#..', '#..', '#..', '###'], M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'], $: ['.##', '##.', '.#.', '.##', '##.'],
  5: ['###', '#..', '###', '..#', '###'], ' ': ['...', '...', '...', '...', '...'],
};
function text(img, str, x, y, c) {
  [...str].forEach((ch, i) => {
    FONT[ch].forEach((row, j) => [...row].forEach((p, k) => p === '#' && img.set(x + i * 4 + k, y + j, c)));
  });
}
function sign(name, w, h, bg, border, lines) {
  const img = new Img(w, h);
  img.fill((x, y) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? border : bg));
  for (const [str, y, c] of lines) text(img, str, Math.floor((w - (str.length * 4 - 1)) / 2), y, c);
  img.save(TEX_DIR, name);
}
sign('sign_cafe.png', 48, 11, '#4b2c1a', '#d9a441', [['PIXEL CAFE', 3, '#ffd34e']]);
sign('sign_horta.png', 25, 9, '#f4ead8', '#7b4a2c', [['HORTA', 2, '#2f8a3e']]);
sign('menu.png', 34, 18, '#243028', '#7b4a2c', [['MENU', 3, '#ffd34e'], ['CAFE $5', 10, '#f4ead8']]);

// ------------------------------------------------------------------ SPRITES
console.log('Sprites:');

// Sombra elíptica (a cor vem do material)
{
  const img = new Img(16, 8);
  img.fill((x, y) => {
    const dx = (x + 0.5 - 8) / 8, dy = (y + 0.5 - 4) / 4;
    return dx * dx + dy * dy <= 1 ? '#ffffff' : null;
  });
  img.save(SPR_DIR, 'shadow.png');
}

// Personagens: 4 quadros (parado, passo A, parado, passo B) x 3 direções (frente, costas, lado)
function drawCharacter(img, ox, oy, dir, frame, P) {
  const s = (x, y, c) => img.set(ox + x, oy + y, c);
  const r = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) s(x + i, y + j, c); };
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0; // 1 = perna esquerda à frente
  const bob = step !== 0 ? 1 : 0;

  if (dir === 0 || dir === 1) {
    // Pernas
    const legL = step === 1 ? 1 : 0, legR = step === -1 ? 1 : 0;
    r(5, 19, 3, 4 - legL, P.pants);
    r(8, 19, 3, 4 - legR, P.pantsD);
    r(5, 23 - legL, 3, 1, P.shoes);
    r(8, 23 - legR, 3, 1, P.shoes);
    // Tronco
    const ty = 13 + bob;
    r(4, ty, 8, 6, P.shirt);
    r(11, ty, 1, 6, P.shirtD);
    r(4, ty + 5, 8, 1, P.shirtD);
    if (dir === 0) {
      r(7, ty, 2, 1, P.skin);
      if (P.apron) {
        r(5, ty + 1, 6, 6, P.apron);
        r(6, ty + 3, 4, 1, shade(P.apron, 0.75));
      }
    } else if (P.apron) {
      r(7, ty + 2, 2, 1, P.apron);
    }
    // Braços (balanço)
    const aL = step === 1 ? -1 : step === -1 ? 1 : 0;
    r(3, ty + aL, 1, 5, P.shirtD); s(3, ty + 5 + aL, P.skin);
    r(12, ty - aL, 1, 5, P.shirtD); s(12, ty + 5 - aL, P.skin);
    // Cabeça
    const hy = 3 + bob;
    r(3, hy, 10, 10, dir === 0 ? P.skin : P.hair);
    for (const [cx, cy] of [[3, hy], [12, hy], [3, hy + 9], [12, hy + 9]]) s(cx, cy, null);
    if (dir === 0) {
      r(4, hy + 9, 8, 1, P.skinD);
      r(3, hy, 10, 3, P.hair);
      s(3, hy, null); s(12, hy, null);
      r(3, hy + 3, 2, 1, P.hair); r(8, hy + 3, 5, 1, P.hair);
      r(3, hy + 3, 1, P.long ? 7 : 4, P.hair); r(12, hy + 3, 1, P.long ? 7 : 4, P.hair);
      r(5, hy, 3, 1, P.hairL);
      r(5, hy + 5, 1, 2, P.eye); r(10, hy + 5, 1, 2, P.eye);
      s(4, hy + 7, P.blush); s(11, hy + 7, P.blush);
      s(7, hy + 8, P.skinD); s(8, hy + 8, P.skinD);
    } else {
      r(5, hy, 3, 1, P.hairL);
      r(4, hy + 8, 8, 1, P.hairD);
      if (!P.long) { r(5, hy + 9, 6, 1, P.skinD); }
      else r(4, hy + 9, 8, 2, P.hair);
    }
    if (P.hat) {
      r(3, hy - 1, 10, 3, P.hat);
      s(3, hy - 1, null); s(12, hy - 1, null);
      r(4, hy - 1, 3, 1, shade(P.hat, 1.25));
      if (dir === 0) r(2, hy + 2, 12, 1, shade(P.hat, 0.75));
    }
  } else {
    // Lado (virado para a direita)
    const ty = 13 + bob;
    if (step === 0) {
      r(6, 19, 4, 4, P.pants);
      r(6, 23, 5, 1, P.shoes);
    } else {
      const front = step === 1 ? P.pants : P.pantsD, back = step === 1 ? P.pantsD : P.pants;
      r(5, 19, 2, 2, back); r(4, 21, 2, 2, back); r(3, 23, 3, 1, P.shoes);
      r(8, 19, 2, 2, front); r(9, 21, 2, 2, front); r(9, 23, 3, 1, P.shoes);
    }
    r(5, ty, 6, 6, P.shirt);
    r(5, ty + 5, 6, 1, P.shirtD);
    if (P.apron) r(9, ty + 1, 2, 6, P.apron);
    const ax = step === 1 ? 1 : step === -1 ? -1 : 0;
    r(7 + ax, ty + 1, 2, 4, P.shirtD); r(7 + ax, ty + 5, 2, 1, P.skin);
    const hy = 3 + bob;
    r(4, hy, 9, 10, P.skin);
    for (const [cx, cy] of [[4, hy], [12, hy], [4, hy + 9], [12, hy + 9]]) s(cx, cy, null);
    r(4, hy, 9, 3, P.hair);
    s(4, hy, null); s(12, hy, null);
    r(4, hy + 3, 4, P.long ? 7 : 5, P.hair);
    r(5, hy, 3, 1, P.hairL);
    s(13, hy + 6, P.skin);
    r(11, hy + 5, 1, 2, P.eye);
    s(10, hy + 7, P.blush);
    r(5, hy + 9, 7, 1, P.skinD);
    if (P.hat) {
      r(4, hy - 1, 9, 3, P.hat);
      s(4, hy - 1, null); s(12, hy - 1, null);
      r(10, hy + 2, 4, 1, shade(P.hat, 0.75));
    }
  }
}

function palette(o) {
  return {
    skin: o.skin, skinD: shade(o.skin, 0.82), blush: '#f29a9a', eye: INK,
    hair: o.hair, hairD: shade(o.hair, 0.75), hairL: shade(o.hair, 1.3),
    shirt: o.shirt, shirtD: shade(o.shirt, 0.78),
    pants: o.pants, pantsD: shade(o.pants, 0.78), shoes: o.shoes,
    apron: o.apron, hat: o.hat, long: !!o.long,
  };
}

function characterSheet(name, look) {
  const P = palette(look);
  const img = new Img(64, 72);
  for (let dir = 0; dir < 3; dir++) {
    for (let f = 0; f < 4; f++) {
      drawCharacter(img, f * 16, dir * 24, dir, f, P);
      img.outline(INK, f * 16, dir * 24, 16, 24);
    }
  }
  img.save(SPR_DIR, name);
}

characterSheet('player.png', {
  skin: '#f2c7a5', hair: '#4a2c1a', shirt: '#f4f4f4', pants: '#2f3b5c', shoes: '#6b3e22',
  apron: '#7a4a2a', hat: '#2e8b57',
});
// Barista 2 (co-op): boné azul e avental vinho
characterSheet('player2.png', {
  skin: '#c68a5e', hair: '#1a1a1a', shirt: '#f4f4f4', pants: '#3a3a44', shoes: '#222222',
  apron: '#7a2f3a', hat: '#3a6fd0',
});
const NPCS = [
  { skin: '#f5d0b0', hair: '#2b1d14', shirt: '#e8424f', pants: '#2f3b5c', shoes: '#222222' },
  { skin: '#c68a5e', hair: '#1a1a1a', shirt: '#4b8be8', pants: '#3a3a44', shoes: '#f4f4f4', long: true },
  { skin: '#8d5a3b', hair: '#1a1a1a', shirt: '#f2c14e', pants: '#2d5a3d', shoes: '#6b3e22', hat: '#e8424f' },
  { skin: '#ffe0c4', hair: '#d9a441', shirt: '#5bbf5b', pants: '#6b4a2a', shoes: '#222222', long: true },
  { skin: '#e8b48f', hair: '#a0522d', shirt: '#b57be8', pants: '#1f2a44', shoes: '#c0392b' },
  { skin: '#5e3a24', hair: '#2b1d14', shirt: '#f28c3a', pants: '#8a8f9c', shoes: '#222222' },
  { skin: '#f5d0b0', hair: '#dedede', shirt: '#3ec1c1', pants: '#7a2f3a', shoes: '#6b3e22', hat: '#34344a' },
  { skin: '#c68a5e', hair: '#c23b22', shirt: '#ff8fb1', pants: '#3a3a44', shoes: '#f4f4f4', long: true },
];
NPCS.forEach((l, i) => characterSheet(`npc_${i}.png`, l));

// Bandeja com 0..4 xícaras
{
  const img = new Img(80, 8);
  for (let n = 0; n < 5; n++) {
    const ox = n * 16;
    img.rect(ox + 1, 6, 14, 1, '#9aa0ad');
    img.rect(ox + 2, 7, 12, 1, '#6c7280');
    [[3, 3], [6, 2], [9, 3], [12, 2]].slice(0, n).forEach(([x, y]) => {
      img.rect(ox + x - 1, y, 3, 4 - (y - 2), '#f7f2ea');
      img.set(ox + x, y, '#5a3220');
    });
    img.outline(INK, ox, 0, 16, 8);
  }
  img.save(SPR_DIR, 'tray.png');
}

// Pé de café: 0 broto, 1 pequeno, 2 médio, 3 grande, 4 com frutos, 5 terra semeada
{
  const img = new Img(96, 16);
  const R = rng(9);
  const bush = (ox, cx, cy, rx, ry, berries) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        let c = R() < 0.15 ? '#3e9a48' : '#4fa64a';
        if (dx + dy < -0.9) c = '#7fd06a';
        else if (dx + dy > 0.7) c = '#2f7a3a';
        img.set(ox + x, y, c);
      }
    }
    img.rect(ox + 7, Math.min(15, Math.floor(cy + ry)), 2, 16, '#6b4a2a');
    if (berries) {
      for (let i = 0; i < 7; i++) {
        const a = R() * Math.PI * 2, rr = 0.3 + R() * 0.55;
        img.set(ox + Math.floor(cx + Math.cos(a) * rx * rr), Math.floor(cy + Math.sin(a) * ry * rr), i % 3 ? '#d8322a' : '#ff6a5a');
      }
    }
  };
  // broto
  img.rect(7, 11, 2, 5, '#4fa64a');
  img.rect(4, 10, 3, 2, '#5cb85a'); img.rect(9, 9, 3, 2, '#5cb85a'); img.set(4, 10, '#7fd06a');
  bush(16, 8, 11.5, 3.5, 3, false);
  bush(32, 8, 10, 5, 4.5, false);
  bush(48, 8, 8.5, 6.5, 6, false);
  bush(64, 8, 8.5, 6.5, 6, true);
  img.rect(80 + 5, 13, 6, 2, '#5c3820'); img.rect(80 + 6, 12, 4, 1, '#6b4426'); img.set(80 + 7, 12, '#8e5d36');
  for (let n = 0; n < 6; n++) img.outline(INK, n * 16, 0, 16, 16);
  img.save(SPR_DIR, 'coffee_plant.png');
}

// Árvores (2 variações 32x40) e arbustos (2 variações 16x12)
function blobShape(img, ox, oy, w, h, circles, pal, R) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = false, nx = 0, ny = 0;
      for (const [cx, cy, rr] of circles) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= rr * rr) { inside = true; nx = dx / rr; ny = dy / rr; }
      }
      if (!inside) continue;
      let c = R() < 0.12 ? pal[1] : pal[0];
      if (nx + ny < -0.75) c = pal[2];
      else if (nx + ny > 0.6) c = pal[3];
      img.set(ox + x, oy + y, c);
    }
  }
}
{
  const img = new Img(64, 40);
  const R = rng(10);
  const trunk = (ox) => {
    img.rect(ox + 14, 24, 4, 15, '#7a5032');
    img.rect(ox + 14, 24, 1, 15, '#8f6440');
    img.rect(ox + 17, 24, 1, 15, '#5e3a22');
    img.rect(ox + 12, 38, 8, 1, '#5e3a22');
  };
  trunk(0);
  blobShape(img, 0, 0, 32, 32, [[16, 12, 9], [9, 18, 7], [23, 18, 7], [16, 21, 7], [11, 9, 6], [21, 9, 6]],
    ['#4fa64a', '#45964a', '#7fd06a', '#2f7a3a'], R);
  trunk(32);
  blobShape(img, 32, 0, 32, 32, [[16, 11, 8], [9, 17, 7], [23, 17, 7], [16, 22, 8]],
    ['#3d9a55', '#358a4a', '#6cc878', '#246b3a'], R);
  for (let i = 0; i < 6; i++) img.set(32 + 8 + Math.floor(R() * 16), 8 + Math.floor(R() * 16), '#e8424f');
  img.outline(INK, 0, 0, 32, 40);
  img.outline(INK, 32, 0, 32, 40);
  img.save(SPR_DIR, 'tree.png');
}
{
  const img = new Img(32, 12);
  const R = rng(11);
  blobShape(img, 0, 0, 16, 12, [[5, 7, 4.5], [11, 7, 4.5], [8, 5, 4.5]], ['#4fa64a', '#45964a', '#7fd06a', '#2f7a3a'], R);
  blobShape(img, 16, 0, 16, 12, [[5, 7, 4.5], [11, 7, 4.5], [8, 5, 4.5]], ['#3f8f3f', '#367f38', '#5cb85a', '#2a5e2e'], R);
  img.set(16 + 6, 4, '#ff8fb1'); img.set(16 + 10, 6, '#ffffff'); img.set(16 + 4, 7, '#ff8fb1');
  img.outline(INK, 0, 0, 16, 12);
  img.outline(INK, 16, 0, 16, 12);
  img.save(SPR_DIR, 'bush.png');
}

console.log('OK');
