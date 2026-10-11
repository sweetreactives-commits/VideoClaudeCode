import * as THREE from 'three';
import { rng, noise2 } from '../timeline/random';
import { PALETTE } from './palette';
import { ACTION_CENTER } from './terrain';

/** Окатыши-камни: в масштабе насекомых это валуны. Сверху мох. */
export function createStones(heightAt: (x: number, z: number) => number): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise2(v.x * 1.7 + v.z, v.y * 1.7 - v.z, 3) * 0.12 + noise2(v.x * 4 + 9, v.y * 4 + v.z * 3, 5) * 0.04;
    v.multiplyScalar(1 + n);
    v.y *= 0.62;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMoss = { value: PALETTE.moss };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN;\nvarying vec3 vSP;')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
#ifdef USE_INSTANCING
  vWN = normalize(mat3(instanceMatrix) * objectNormal);
#else
  vWN = objectNormal;
#endif
  vSP = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN;\nvarying vec3 vSP;\nuniform vec3 uMoss;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    float speck = fract(sin(dot(floor(vSP * 24.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    diffuseColor.rgb *= 0.85 + speck * 0.25;
    float moss = smoothstep(0.45, 0.85, normalize(vWN).y + (speck - 0.5) * 0.3);
    diffuseColor.rgb = mix(diffuseColor.rgb, uMoss, moss * 0.85);
  }`,
      );
  };

  const count = 46;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const r = rng(909);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = ACTION_CENTER.x - 60 + r() * 110;
    const z = ACTION_CENTER.z - 50 + r() * 85;
    const size = 0.5 + Math.pow(r(), 2.2) * 3.4;
    p.set(x, heightAt(x, z) - size * 0.18, z);
    e.set((r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3);
    q.setFromEuler(e);
    s.set(size * (0.9 + r() * 0.5), size, size * (0.9 + r() * 0.4));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    c.copy(PALETTE.stone).offsetHSL((r() - 0.5) * 0.04, (r() - 0.5) * 0.1, (r() - 0.5) * 0.12);
    mesh.setColorAt(i, c);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'stones';
  return mesh;
}
