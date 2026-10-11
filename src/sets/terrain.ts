import * as THREE from 'three';
import { fbm2 } from '../timeline/random';
import { smoothstep } from '../timeline/ease';
import { PALETTE } from './palette';

// Рельеф: почти ровная площадка действия и холмы, уходящие в дымку.
export const ACTION_CENTER = { x: -18, z: -6 };

export function heightAt(x: number, z: number): number {
  const dx = x - ACTION_CENTER.x;
  const dz = z - ACTION_CENTER.z;
  const r = Math.hypot(dx, dz);
  const local = fbm2(x * 0.03, z * 0.03, 3, 7) * 1.4;
  const hills = smoothstep(90, 260, r) * (28 + fbm2(x * 0.006, z * 0.006, 3, 11) * 40);
  return local + hills;
}

export function createGround(): THREE.Mesh {
  const size = 1400;
  const seg = 220;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  // Сгущаем сетку к центру: квадратичное отображение координат.
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let z = pos.getZ(i);
    const nx = x / (size / 2), nz = z / (size / 2);
    x = Math.sign(nx) * nx * nx * (size / 2) + ACTION_CENTER.x;
    z = Math.sign(nz) * nz * nz * (size / 2) + ACTION_CENTER.z;
    pos.setXYZ(i, x, heightAt(x, z), z);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSoil = { value: PALETTE.soil };
    shader.uniforms.uSoilLight = { value: PALETTE.soilLight };
    shader.uniforms.uGrassDeep = { value: PALETTE.grassDeep };
    shader.uniforms.uGrassMid = { value: PALETTE.grassMid };
    shader.uniforms.uHill = { value: PALETTE.hillNear };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
uniform vec3 uSoil, uSoilLight, uGrassDeep, uGrassMid, uHill;
float gh(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
float gfbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * gn(p); p *= 2.1; a *= 0.5; } return s; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 p = vWPos.xz;
  float n = gfbm(p * 0.35);
  float n2 = gfbm(p * 2.3 + 7.0);
  vec3 soil = mix(uSoil, uSoilLight, n2);
  vec3 grass = mix(uGrassDeep, uGrassMid, smoothstep(0.35, 0.75, n));
  float cover = smoothstep(0.3, 0.6, n + n2 * 0.3);
  vec3 col = mix(soil, grass, cover);
  float far = smoothstep(80.0, 220.0, length(p - vec2(${ACTION_CENTER.x.toFixed(1)}, ${ACTION_CENTER.z.toFixed(1)})));
  col = mix(col, uHill * (0.85 + 0.3 * n), far);
  diffuseColor.rgb *= col;
}`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}
