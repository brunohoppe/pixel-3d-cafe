import * as THREE from 'three';
import { clamp, setFade } from '../util.js';
import { CAM } from '../sprites.js';

// Paredes/telhado/árvores que tapam o jogador LOCAL somem com pontilhado (dither)
export function createFade(world) {
  const ray = new THREE.Ray();
  const rayO = new THREE.Vector3();
  let fade = 1;
  return function updateFade(dt, p) {
    const inside = p.x > -9.2 && p.x < 5.2 && p.z > -12.2 && p.z < 0.25;
    ray.set(rayO.set(p.x, p.y + 0.7, p.z), CAM.toCam);
    const behind = !inside && ray.intersectsBox(world.cafeBox);
    const target = inside ? 0 : behind ? 0.4 : 1;
    fade += clamp(target - fade, -dt * 4, dt * 4);
    const f = Math.round(fade * 16) / 16;
    for (const m of world.fadeMats) setFade(m, f);
    for (const m of world.shellMats) setFade(m, behind ? Math.max(f, 0.4) : 1);
    world.fadeGroup.visible = f > 0.01;
    for (const o of world.occluders) {
      const hit = ray.intersectsBox(o.box);
      if (hit !== o.on) {
        o.on = hit;
        for (const m of o.meshes) m.material = hit ? o.faded : o.solid;
      }
    }
  };
}
