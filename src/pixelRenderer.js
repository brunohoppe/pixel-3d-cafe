import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CAM } from './sprites.js';

const T = CONFIG.texel;
const DIST = 60;

// Passo final: amplia o render target com escala inteira (nearest), aplica
// contorno de 1px por profundidade e posterize de luminância.
const FINAL_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 rtSize;
uniform vec2 screenSize;
uniform float scale;
uniform vec2 shift;
uniform float levels;
uniform float outlineOn;
uniform float outlineDepth;
uniform float outlineDark;
uniform float depthRange;

float depthAt(vec2 px) {
  return texture2D(tDepth, (px + 0.5) / rtSize).r * depthRange;
}
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 rtc = (gl_FragCoord.xy - screenSize * 0.5) / scale + rtSize * 0.5 - shift;
  vec2 px = floor(rtc);
  vec3 c = texture2D(tColor, (px + 0.5) / rtSize).rgb;

  if (outlineOn > 0.5) {
    float d = depthAt(px);
    float diff = 0.0;
    diff = max(diff, depthAt(px + vec2(1.0, 0.0)) - d);
    diff = max(diff, depthAt(px - vec2(1.0, 0.0)) - d);
    diff = max(diff, depthAt(px + vec2(0.0, 1.0)) - d);
    diff = max(diff, depthAt(px - vec2(0.0, 1.0)) - d);
    if (diff > outlineDepth) c *= outlineDark;
  }

  vec3 s = toSRGB(c);
  if (levels > 0.5) {
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    float q = floor(l * levels + 0.5) / levels;
    s *= clamp(q / max(l, 1e-4), 0.7, 1.35);
  }
  gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
}
`;

export class PixelRenderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 140);
    this.zoom = 0; // somado à escala inteira
    this.shift = new THREE.Vector2();
    this.scale = 1;
    this.dpr = 1;

    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType, generateMipmaps: false,
    });
    this.rt.depthTexture = new THREE.DepthTexture(2, 2);

    this.uniforms = {
      tColor: { value: this.rt.texture },
      tDepth: { value: this.rt.depthTexture },
      rtSize: { value: new THREE.Vector2() },
      screenSize: { value: new THREE.Vector2() },
      scale: { value: 1 },
      shift: { value: this.shift },
      levels: { value: CONFIG.posterizeLevels },
      outlineOn: { value: CONFIG.outline ? 1 : 0 },
      outlineDepth: { value: CONFIG.outlineDepth },
      outlineDark: { value: CONFIG.outlineDarkness },
      depthRange: { value: 139 },
    };
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FINAL_FRAG,
      depthTest: false, depthWrite: false,
    })));

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  get pixelCss() {
    return this.scale / this.dpr;
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    const W = Math.round(innerWidth * this.dpr), H = Math.round(innerHeight * this.dpr);
    this.W = W;
    this.H = H;
    this.renderer.setSize(W, H, false);
    const el = this.renderer.domElement;
    el.style.width = `${innerWidth}px`;
    el.style.height = `${innerHeight}px`;

    this.scale = Math.max(1, Math.round(H / CONFIG.targetHeight) + this.zoom);
    const even = (v) => v + (v % 2);
    this.rtW = even(Math.ceil(W / this.scale) + 2);
    this.rtH = even(Math.ceil(H / this.scale) + 2);
    this.rt.setSize(this.rtW, this.rtH);

    const c = this.camera;
    c.left = (-this.rtW / 2) * T;
    c.right = (this.rtW / 2) * T;
    c.top = (this.rtH / 2) * T;
    c.bottom = (-this.rtH / 2) * T;
    c.updateProjectionMatrix();

    this.uniforms.rtSize.value.set(this.rtW, this.rtH);
    this.uniforms.screenSize.value.set(W, H);
    this.uniforms.scale.value = this.scale;
    this.uniforms.depthRange.value = c.far - c.near;
    document.documentElement.style.setProperty('--px', `${this.pixelCss}px`);
    document.documentElement.style.setProperty('--ipx', `${this.pixelCss}px`);
  }

  setZoom(z) {
    this.zoom = z;
    this.resize();
  }

  // Câmera fixa na grade de pixels: só translada em passos de 1 texel.
  // O resto sub-pixel vira um deslocamento suave na hora de ampliar.
  follow(target) {
    const want = target.clone().addScaledVector(CAM.toCam, DIST);
    const r = want.dot(CAM.right), u = want.dot(CAM.up);
    const dr = Math.round(r / T) * T - r, du = Math.round(u / T) * T - u;
    this.camera.position.copy(want).addScaledVector(CAM.right, dr).addScaledVector(CAM.up, du);
    this.camera.lookAt(this.camera.position.clone().sub(CAM.toCam));
    this.camera.updateMatrixWorld();
    if (CONFIG.subpixelSmooth) this.shift.set(dr / T, du / T);
    else this.shift.set(0, 0);
  }

  render(scene) {
    const u = this.uniforms;
    u.levels.value = CONFIG.posterizeLevels;
    u.outlineOn.value = CONFIG.outline ? 1 : 0;
    u.outlineDepth.value = CONFIG.outlineDepth;
    u.outlineDark.value = CONFIG.outlineDarkness;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  // Mundo → pixels CSS da tela, alinhado à grade de pixels
  project(pos, yOff = 0) {
    const v = new THREE.Vector3(pos.x, pos.y + yOff, pos.z).project(this.camera);
    const rx = Math.round(((v.x + 1) / 2) * this.rtW), ry = Math.round(((v.y + 1) / 2) * this.rtH);
    const fx = (rx + this.shift.x - this.rtW / 2) * this.scale + this.W / 2;
    const fy = (ry + this.shift.y - this.rtH / 2) * this.scale + this.H / 2;
    return {
      x: Math.round(fx / this.dpr),
      y: Math.round((this.H - fy) / this.dpr),
      on: v.x > -1.15 && v.x < 1.15 && v.y > -1.15 && v.y < 1.25,
    };
  }
}
