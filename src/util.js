import * as THREE from 'three';
import { CONFIG } from './config.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function lerpAngle(a, b, t) {
  const TAU = Math.PI * 2;
  const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return a + d * t;
}

// Gerador pseudo-aleatório com semente (mundo sempre igual)
export function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Materiais toon (3 tons, visual pixel-art)
let grad = null;
export function gradientMap() {
  if (grad) return grad;
  grad = new THREE.DataTexture(new Uint8Array([70, 125, 170, 215, 255]), 5, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  return grad;
}

// ---------- Texturas pixel art (assets/textures/*.png)
const TEX_URLS = import.meta.glob('../assets/textures/*.png', { eager: true, query: '?url', import: 'default' });
const SPR_URLS = import.meta.glob('../assets/sprites/*.png', { eager: true, query: '?url', import: 'default' });
const loader = new THREE.TextureLoader();
const texCache = new Map();
function loadPixelTexture(url, size) {
  const t = loader.load(url, (tx) => size && size.set(tx.image.width, tx.image.height));
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function tex(name) {
  const key = 't:' + name;
  if (!texCache.has(key)) {
    const t = loadPixelTexture(TEX_URLS[`../assets/textures/${name}.png`]);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache.set(key, t);
  }
  return texCache.get(key);
}
export function spriteTex(name) {
  const key = 's:' + name;
  if (!texCache.has(key)) texCache.set(key, loadPixelTexture(SPR_URLS[`../assets/sprites/${name}.png`]));
  return texCache.get(key);
}

// ---------- Shader extra: UV em espaço de mundo (1 texel ≈ 1 pixel) + fade pontilhado (Bayer)
const WORLD_UV = /* glsl */ `
#if defined(USE_MAP) && defined(WORLD_UV)
  vec3 wpT = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vec3 wnT = abs(normalize(mat3(modelMatrix) * objectNormal));
  vec2 wuv = (wnT.y >= wnT.x && wnT.y >= wnT.z) ? vec2(wpT.x, -wpT.z)
           : (wnT.x >= wnT.z ? vec2(-wpT.z, wpT.y) : vec2(wpT.x, wpT.y));
  vMapUv = wuv / uTile;
#endif
`;
const FRAG_HEAD = /* glsl */ `
uniform float uFade;
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
`;
const DITHER = /* glsl */ `
  if (uFade < 0.999 && bayer4(gl_FragCoord.xy) >= uFade) discard;
`;

// Adiciona UV de mundo e fade pontilhado a qualquer material do three
export function decorate(m, { worldUV = false, texSize = 32 } = {}) {
  m.userData.uFade = { value: 1 };
  m.userData.uTile = { value: new THREE.Vector2(texSize * CONFIG.texel, texSize * CONFIG.texel) };
  if (worldUV) m.defines = { ...(m.defines || {}), WORLD_UV: '' };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFade = m.userData.uFade;
    sh.uniforms.uTile = m.userData.uTile;
    sh.vertexShader = 'uniform vec2 uTile;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WORLD_UV);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + DITHER);
  };
  return m;
}

export function setFade(m, v) {
  m.userData.uFade.value = v;
}

const matCache = new Map();
export function mat(color) {
  let m = matCache.get(color);
  if (!m) {
    m = decorate(new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() }));
    matCache.set(color, m);
  }
  return m;
}

export function uniqueMat(color, extra = {}) {
  return decorate(new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...extra }));
}

// Material texturizado com UV de mundo. texSize = tamanho do PNG em pixels.
const TEX_SIZES = { wood_floor: 64, table: 16, chair: 16, pot: 16, plant: 16, soil: 16, bark: 16, fence: 16, brick: 16, awning: 16 };
export function tmat(name, { tint = 0xffffff, unique = false } = {}) {
  const key = `${name}|${tint}`;
  if (!unique && matCache.has(key)) return matCache.get(key);
  const m = decorate(new THREE.MeshToonMaterial({ color: tint, map: tex(name), gradientMap: gradientMap() }), {
    worldUV: true, texSize: TEX_SIZES[name] || 32,
  });
  if (!unique) matCache.set(key, m);
  return m;
}

const geoCache = new Map();
export function boxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(k, g);
  }
  return g;
}

// Caixa posicionada pela base (y = chão da caixa)
export function box(parent, w, h, d, color, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof color === 'number' ? mat(color) : color);
  m.position.set(x, y + h / 2, z);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  parent.add(m);
  return m;
}

// ---------- Colisão (AABB no plano XZ)
export const colliders = [];
export function solid(x0, x1, z0, z1) {
  colliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
}
export function solidBox(cx, cz, w, d) {
  solid(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2);
}

export function resolveCircle(pos, r) {
  for (const c of colliders) {
    const nx = clamp(pos.x, c.minX, c.maxX);
    const nz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x += (dx / d) * (r - d);
      pos.z += (dz / d) * (r - d);
    } else {
      const l = pos.x - c.minX, rr = c.maxX - pos.x, t = pos.z - c.minZ, b = c.maxZ - pos.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) pos.x = c.minX - r;
      else if (m === rr) pos.x = c.maxX + r;
      else if (m === t) pos.z = c.minZ - r;
      else pos.z = c.maxZ + r;
    }
  }
}

// ---------- Layout
export const CAFE = { x0: -9, x1: 5, z0: -12, z1: 0 };

export function groundY(x, z) {
  if (x > CAFE.x0 && x < CAFE.x1 && z > CAFE.z0 && z < CAFE.z1) return 0.12;
  if ((z >= 0 && z <= 3) || (z >= 9 && z <= 11.6)) return 0.12;
  if (z > 3 && z < 9) return 0.03;
  return 0;
}
