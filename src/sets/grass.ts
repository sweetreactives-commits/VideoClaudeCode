import * as THREE from 'three';
import { rng, fbm2 } from '../timeline/random';
import { heightAt, ACTION_CENTER } from './terrain';
import { PALETTE } from './palette';
import { WIND_GLSL } from './wind';

// Травинка: сужающаяся лента высотой 1 с изгибом вперёд. Масштабируется инстансом.
function bladeGeometry(segments = 5): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const v = i / segments;
    const w = 0.5 * Math.pow(1 - v, 0.85) * (1 - 0.15 * v);
    const bend = 0.28 * v * v;
    const y = v * (1 - 0.06 * v * v);
    pos.push(-w, y, bend, w, y, bend);
    nrm.push(-0.25, 0.25, 1, 0.25, 0.25, 1);
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  // Острый кончик: последние две вершины сводим в одну точку.
  const last = segments * 2;
  pos[last * 3] = 0;
  pos[(last + 1) * 3] = 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface GrassOptions {
  count: number;
  seed: number;
  /** Прямоугольник распределения [xmin, xmax, zmin, zmax]. */
  rect: [number, number, number, number];
  height: [number, number];
  width: [number, number];
  /** Пропуск травы рядом с точками (например, у корня героя-цветка). */
  avoid?: { x: number; z: number; r: number }[];
}

export interface SwayOptions {
  /** Мелкая дрожь кончиков (только для травы). */
  flutter: number;
  /** Цвет кончика; градиент от основания к кончику. */
  tip: THREE.Color;
  /** Насколько затемнять основание (фейковый AO у земли). */
  baseShade: number;
  translucency: number;
  roughness: number;
}

const GRASS_SWAY: SwayOptions = { flutter: 1, tip: PALETTE.grassTip, baseShade: 0.28, translucency: 0.9, roughness: 0.62 };

/** Материал для всего, что качается ветром: трава, стебли цветов. */
export function createGrassMaterial(o: SwayOptions = GRASS_SWAY): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: o.roughness,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: PALETTE.sun.clone() },
    uTip: { value: o.tip.clone() },
    uDry: { value: PALETTE.grassDry.clone() },
    uFlutter: { value: o.flutter },
    uBaseShade: { value: o.baseShade },
    uTranslucency: { value: o.translucency },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}\nvarying float vH;\nvarying vec3 vWPos;\nvarying float vDry;\nuniform float uFlutter;`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
#ifdef USE_INSTANCING
  objectNormal = normalize(mix(objectNormal, inverse(mat3(instanceMatrix)) * vec3(0.0, 1.0, 0.0), 0.45));
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  float hN = clamp(position.y, 0.0, 1.0);
  vH = hN;
#ifdef USE_INSTANCING
  vec3 iPos = instanceMatrix[3].xyz;
  float bladeH = length(instanceMatrix[1].xyz);
  float ph = fract(sin(dot(iPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
  vDry = ph;
  float w = windAt(iPos.xz, uTime) * bladeH;
  float flutter = sin(uTime * (5.0 + ph * 3.0) + ph * 40.0) * 0.012 * bladeH * uFlutter;
  vec3 off = vec3(WIND_DIR.x, 0.0, WIND_DIR.y) * (w + flutter) * hN * hN;
  off.y = -abs(w) * hN * hN * 0.3;
  transformed += inverse(mat3(instanceMatrix)) * off;
  vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vDry = 0.0;
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying float vH;\nvarying vec3 vWPos;\nvarying float vDry;\nuniform vec3 uSunDir, uSunColor, uTip, uDry;\nuniform float uFlutter, uBaseShade, uTranslucency;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  vec3 tip = mix(uTip, uDry, step(0.86, vDry) * 0.8 * uFlutter);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.4 + tip * 0.75, smoothstep(0.15, 1.0, vH));
  diffuseColor.rgb *= mix(uBaseShade, 1.0, smoothstep(0.0, 0.65, vH));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  {
    vec3 V = normalize(cameraPosition - vWPos);
    float back = pow(clamp(dot(-V, uSunDir), 0.0, 1.0), 2.5);
    totalEmissiveRadiance += uSunColor * diffuseColor.rgb * back * smoothstep(0.2, 1.0, vH) * uTranslucency;
  }`,
      );
  };
  return mat;
}

export function createGrass(opts: GrassOptions, material: THREE.Material): THREE.InstancedMesh {
  const geo = bladeGeometry();
  const mesh = new THREE.InstancedMesh(geo, material, opts.count);
  const r = rng(opts.seed);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const [x0, x1, z0, z1] = opts.rect;
  let placed = 0;
  let guard = 0;
  while (placed < opts.count && guard < opts.count * 6) {
    guard++;
    const x = x0 + (x1 - x0) * r();
    const z = z0 + (z1 - z0) * r();
    // Кластеры: плотность модулируется шумом.
    const density = 0.55 + 0.45 * fbm2(x * 0.08, z * 0.08, 3, opts.seed + 3);
    if (r() > density + 0.25) continue;
    if (opts.avoid?.some((a) => (x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r)) continue;
    const clump = fbm2(x * 0.15, z * 0.15, 2, opts.seed + 9) * 0.5 + 0.5;
    const h = opts.height[0] + (opts.height[1] - opts.height[0]) * Math.pow(r(), 1.3) * (0.6 + clump * 0.6);
    const w = opts.width[0] + (opts.width[1] - opts.width[0]) * r();
    p.set(x, heightAt(x, z) - 0.05, z);
    e.set((r() - 0.5) * 0.35, r() * Math.PI * 2, (r() - 0.5) * 0.35);
    q.setFromEuler(e);
    s.set(w, h, w);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    // Оттенок: от глубокого зелёного к среднему, немного жёлтых.
    const k = r();
    col.copy(PALETTE.grassDeep).lerp(PALETTE.grassMid, 0.35 + k * 0.65);
    col.offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.1, (r() - 0.5) * 0.04);
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.name = 'grass';
  return mesh;
}

export function defaultGrassRects() {
  const cx = ACTION_CENTER.x, cz = ACTION_CENTER.z;
  return {
    near: [cx - 48, cx + 38, cz - 30, cz + 36] as [number, number, number, number],
    mid: [cx - 110, cx + 80, cz - 90, cz + 60] as [number, number, number, number],
  };
}
