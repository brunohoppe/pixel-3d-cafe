import * as THREE from 'three';
import { CONFIG, DEG } from './config.js';
import { spriteTex, decorate } from './util.js';

const T = CONFIG.texel;
const YAW = CONFIG.camYaw * DEG;
const PITCH = CONFIG.camPitch * DEG;

// Eixos fixos da câmera (a câmera só translada, nunca gira)
export const CAM = {
  yaw: YAW,
  pitch: PITCH,
  toCam: new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH)),
  right: new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW)),
  up: new THREE.Vector3(-Math.sin(YAW) * Math.sin(PITCH), Math.cos(PITCH), -Math.cos(YAW) * Math.sin(PITCH)),
  // direções no chão que correspondem a "direita" e "cima" da tela
  groundRight: new THREE.Vector2(Math.cos(YAW), -Math.sin(YAW)),
  groundUp: new THREE.Vector2(-Math.sin(YAW), -Math.cos(YAW)),
};

// Deslocamento (mundo) que leva o ponto p à grade de pixels do render target
const _o = new THREE.Vector3();
export function pixelSnapOffset(p, out = _o) {
  const r = p.dot(CAM.right), u = p.dot(CAM.up);
  out.set(0, 0, 0);
  out.addScaledVector(CAM.right, Math.round(r / T) * T - r);
  out.addScaledVector(CAM.up, Math.round(u / T) * T - u);
  return out;
}

// Plano vertical virado para a câmera, base no chão, 1 texel = 1 pixel
const geoCache = new Map();
function billboardGeo(fw, fh) {
  const k = `${fw}x${fh}`;
  if (!geoCache.has(k)) {
    const w = fw * T, h = (fh * T) / Math.cos(PITCH);
    geoCache.set(k, new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0));
  }
  return geoCache.get(k);
}

export function makeSprite(sheet, fw, fh, cols, rows, { shared = false } = {}) {
  const base = spriteTex(sheet);
  const map = shared ? base : base.clone();
  map.repeat.set(1 / cols, 1 / rows);
  const material = decorate(new THREE.MeshBasicMaterial({ map, alphaTest: 0.5 }));
  const mesh = new THREE.Mesh(billboardGeo(fw, fh), material);
  mesh.rotation.y = YAW;
  let cur = '';
  return {
    mesh,
    material,
    setFrame(col, row, flip = false) {
      const k = `${col}|${row}|${flip}`;
      if (k === cur) return;
      cur = k;
      map.repeat.x = (flip ? -1 : 1) / cols;
      map.offset.x = (flip ? col + 1 : col) / cols;
      map.offset.y = 1 - (row + 1) / rows;
    },
  };
}

// Sombra curta, cor sólida (multiplica o chão), elipse pixelada
let shadowMat = null;
const shadowGeos = new Map();
export function blob(parent, w, d, x = 0, y = 0.012, z = 0) {
  if (!shadowMat) {
    shadowMat = new THREE.MeshBasicMaterial({
      map: spriteTex('shadow'), color: CONFIG.shadowColor, alphaTest: 0.5,
      transparent: true, premultipliedAlpha: true, blending: THREE.MultiplyBlending,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
  }
  const k = `${w}x${d}`;
  if (!shadowGeos.has(k)) shadowGeos.set(k, new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2));
  const m = new THREE.Mesh(shadowGeos.get(k), shadowMat);
  m.position.set(x, y, z);
  m.renderOrder = 1;
  parent.add(m);
  return m;
}

// Direção do sprite a partir do ângulo de movimento no mundo
// row: 0 = frente, 1 = costas, 2 = lado (flip = esquerda)
export function facingRow(angle) {
  const dx = Math.sin(angle), dz = Math.cos(angle);
  const sx = dx * CAM.groundRight.x + dz * CAM.groundRight.y;
  const sy = dx * CAM.groundUp.x + dz * CAM.groundUp.y;
  if (Math.abs(sx) > Math.abs(sy) * 1.15) return { row: 2, flip: sx < 0, sx, sy };
  return { row: sy > 0 ? 1 : 0, flip: false, sx, sy };
}
