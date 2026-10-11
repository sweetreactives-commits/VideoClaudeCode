import * as THREE from 'three';
import { rng, noise2 } from '../timeline/random';
import { PALETTE } from './palette';
import { ACTION_CENTER, heightAt } from './terrain';

/**
 * Задник: кроны деревьев на холмах, растворяющиеся в утренней дымке.
 * Каждое дерево — ствол и гроздь «облачков» листвы (инстансы).
 */
export function createBackdrop(): THREE.Group {
  const group = new THREE.Group();
  const blobGeo = new THREE.IcosahedronGeometry(1, 3);
  const bp = blobGeo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i);
    v.multiplyScalar(1 + noise2(v.x * 2.2 + v.y, v.z * 2.2 - v.y, 4) * 0.1);
    bp.setXYZ(i, v.x, v.y, v.z);
  }
  blobGeo.computeVertexNormals();
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 0.9 });

  const trees = 70;
  const blobsPer = 9;
  const blobs = new THREE.InstancedMesh(blobGeo, leafMat, trees * blobsPer);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 1, 1, 8).translate(0, 0.5, 0), trunkMat, trees);
  const r = rng(5150);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  let bi = 0;
  for (let i = 0; i < trees; i++) {
    // Деревья — дугой позади сцены (туда смотрят все камеры) и чуть по бокам.
    const ang = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.5;
    const dist = 260 + r() * 260;
    const x = ACTION_CENTER.x + Math.cos(ang) * dist;
    const z = ACTION_CENTER.z + Math.sin(ang) * dist;
    const y = heightAt(x, z);
    const size = 12 + r() * 16;
    const trunkH = size * (0.7 + r() * 0.5);
    m.compose(p.set(x, y - 1, z), q.identity(), s.set(size * 0.07, trunkH, size * 0.07));
    trunks.setMatrixAt(i, m);
    const tint = r();
    for (let k = 0; k < blobsPer; k++) {
      const a = r() * Math.PI * 2;
      const rr = r() * size * 0.55;
      const bs = size * (0.35 + r() * 0.3);
      p.set(x + Math.cos(a) * rr, y + trunkH + (r() - 0.3) * size * 0.5, z + Math.sin(a) * rr);
      m.compose(p, q.identity(), s.set(bs, bs * 0.85, bs));
      blobs.setMatrixAt(bi, m);
      c.copy(PALETTE.treeFar).lerp(PALETTE.hillNear, tint * 0.4).offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.08);
      blobs.setColorAt(bi, c);
      bi++;
    }
  }
  blobs.castShadow = false;
  blobs.receiveShadow = false;
  group.add(blobs, trunks);
  group.name = 'backdrop';
  return group;
}
