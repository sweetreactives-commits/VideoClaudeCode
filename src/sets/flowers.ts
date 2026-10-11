import * as THREE from 'three';
import { outBack, clamp01, smoothstep } from '../timeline/ease';
import { rng } from '../timeline/random';
import { PALETTE } from './palette';
import { windAt, WIND_DIR } from './wind';
import { createGrassMaterial } from './grass';

// ─── Геометрия ────────────────────────────────────────────────────────────────

/** Лепесток: основание в начале координат, растёт вдоль +Z, слегка «лодочкой». */
export function petalGeometry(segU = 6, segV = 8, cup = 0.22, notch = 0.0): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    // Профиль ширины: узкое основание, широкая середина, скруглённый кончик.
    let w = Math.pow(Math.sin(Math.PI * Math.min(1, v * 0.92 + 0.04)), 0.75) * (0.35 + 0.65 * Math.sqrt(v));
    if (v > 0.95) w *= 1 - (v - 0.95) * 6;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU * 2 - 1;
      const x = u * w * 0.5;
      // Выемка на кончике (у «космеи»).
      const tipCut = notch * Math.max(0, v - 0.8) * 5 * (1 - Math.abs(u));
      const z = v - tipCut * 0.08;
      // «Лодочка» поперёк и мягкий загиб вниз к кончику.
      const y = cup * u * u * w + Math.sin(v * Math.PI) * 0.06 - v * v * 0.08;
      pos.push(x, y, z);
      uv.push(i / segU, v);
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i;
      const b = a + 1;
      const c = a + segU + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Лист на стебле: заострённый эллипс с центральной жилкой-сгибом. */
export function leafGeometry(): THREE.BufferGeometry {
  const segU = 4, segV = 8;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    const w = Math.sin(Math.PI * v) * (1 - v * 0.35) * 0.32;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU * 2 - 1;
      const x = u * w;
      const y = Math.abs(u) * w * 0.35 + Math.sin(v * Math.PI * 0.9) * 0.12 - v * v * 0.25;
      pos.push(x, y, v);
      uv.push(i / segU, v);
    }
  }
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
    const a = j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ─── Материалы ────────────────────────────────────────────────────────────────

export function createPetalMaterial(sunDir: THREE.Vector3): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0,
    sheen: 0.7,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#ffffff'),
    side: THREE.DoubleSide,
  });
  const uniforms = { uSunDir: { value: sunDir }, uSunColor: { value: PALETTE.sun.clone() } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPUv;\nvarying vec3 vPW;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
  vPUv = uv;
#ifdef USE_INSTANCING
  vPW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vPW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPUv;\nvarying vec3 vPW;\nuniform vec3 uSunDir, uSunColor;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    float v = vPUv.y;
    float u = abs(vPUv.x * 2.0 - 1.0);
    // Насыщенное основание, светлый край и тонкие прожилки.
    vec3 base = diffuseColor.rgb;
    vec3 deep = base * vec3(0.78, 0.62, 0.72);
    vec3 col = mix(deep, base, smoothstep(0.0, 0.45, v));
    col = mix(col, mix(base, vec3(1.0), 0.35), smoothstep(0.7, 1.0, v) * 0.6);
    float vein = 1.0 - smoothstep(0.0, 0.06, abs(fract(vPUv.x * 5.0) - 0.5) * (1.2 - v));
    col *= 1.0 - vein * 0.07 * (1.0 - u);
    diffuseColor.rgb = col;
  }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  {
    vec3 V = normalize(cameraPosition - vPW);
    float back = pow(clamp(dot(-V, uSunDir), 0.0, 1.0), 2.0);
    totalEmissiveRadiance += uSunColor * diffuseColor.rgb * (0.12 + back * 0.85);
  }`,
      );
  };
  return mat;
}

export function createCenterMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    // Соцветия-«трубочки» по спирали Фибоначчи — читаются как бугристая серединка.
    vec2 p = vOP.xz;
    float r = length(p);
    float a = atan(p.y, p.x);
    float k = sin(a * 21.0 + r * 40.0) * sin(a * 13.0 - r * 33.0);
    float dots = smoothstep(0.2, 0.9, k);
    vec3 base = diffuseColor.rgb;
    diffuseColor.rgb = mix(base * 0.55, base * 1.15, dots);
    diffuseColor.rgb = mix(diffuseColor.rgb, base * vec3(0.55, 0.4, 0.2), smoothstep(0.55, 1.0, r) * 0.6);
  }`,
      );
  };
  return mat;
}

// ─── Поле цветов ──────────────────────────────────────────────────────────────

export type FlowerKind = 'cosmos' | 'daisy' | 'buttercup';

interface KindSpec {
  petals: number;
  petalLen: number;
  petalWidth: number;
  openLift: number;
  centerR: number;
}

const KINDS: Record<FlowerKind, KindSpec> = {
  cosmos: { petals: 8, petalLen: 1.25, petalWidth: 0.95, openLift: 0.12, centerR: 0.34 },
  daisy: { petals: 14, petalLen: 1.15, petalWidth: 0.38, openLift: 0.04, centerR: 0.32 },
  buttercup: { petals: 5, petalLen: 0.85, petalWidth: 1.15, openLift: 0.55, centerR: 0.26 },
};

export interface FlowerSpec {
  x: number;
  y: number;
  z: number;
  kind: FlowerKind;
  stemH: number;
  scale: number;
  color: THREE.Color;
  center: THREE.Color;
  leanDir: number;
  leanAmt: number;
  /** Время начала раскрытия: -Infinity = уже раскрыт, Infinity = так и останется бутоном. */
  openAt: number;
  seed: number;
}

const BUD_LIFT = 1.42;

export function bloomAmount(t: number, openAt: number): number {
  if (openAt === -Infinity) return 1;
  if (openAt === Infinity) return 0;
  const x = clamp01((t - openAt) / 0.55);
  return outBack(2.2)(x);
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _head = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export class FlowerField {
  readonly group = new THREE.Group();
  private stems: THREE.InstancedMesh;
  private centers: THREE.InstancedMesh;
  private sepals: THREE.InstancedMesh;
  private leaves: THREE.InstancedMesh;
  private petals: Record<FlowerKind, THREE.InstancedMesh>;
  readonly stemMaterial: THREE.MeshStandardMaterial;
  private petalOffsets: Map<FlowerSpec, number> = new Map();

  constructor(readonly specs: FlowerSpec[], petalMaterial: THREE.Material) {
    const n = specs.length;
    this.stemMaterial = createGrassMaterial({
      flutter: 0,
      tip: PALETTE.stem,
      baseShade: 0.45,
      translucency: 0.5,
      roughness: 0.55,
    });
    const stemGeo = new THREE.CylinderGeometry(1, 1.25, 1, 7, 6, true).translate(0, 0.5, 0);
    this.stems = new THREE.InstancedMesh(stemGeo, this.stemMaterial, n);
    this.leaves = new THREE.InstancedMesh(
      leafGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }),
      n * 2,
    );
    this.centers = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1),
      createCenterMaterial(),
      n,
    );
    this.sepals = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.8, 1),
      new THREE.MeshStandardMaterial({ color: PALETTE.leaf, roughness: 0.6 }),
      n,
    );

    const counts: Record<FlowerKind, number> = { cosmos: 0, daisy: 0, buttercup: 0 };
    for (const s of specs) {
      this.petalOffsets.set(s, counts[s.kind]);
      counts[s.kind] += KINDS[s.kind].petals;
    }
    const geos: Record<FlowerKind, THREE.BufferGeometry> = {
      cosmos: petalGeometry(6, 8, 0.18, 1),
      daisy: petalGeometry(3, 6, 0.1, 0),
      buttercup: petalGeometry(6, 6, 0.42, 0),
    };
    this.petals = {
      cosmos: new THREE.InstancedMesh(geos.cosmos, petalMaterial, Math.max(1, counts.cosmos)),
      daisy: new THREE.InstancedMesh(geos.daisy, petalMaterial, Math.max(1, counts.daisy)),
      buttercup: new THREE.InstancedMesh(geos.buttercup, petalMaterial, Math.max(1, counts.buttercup)),
    };

    // Статические цвета.
    const col = new THREE.Color();
    specs.forEach((s, i) => {
      this.stems.setColorAt(i, col.copy(PALETTE.stem));
      this.leaves.setColorAt(i * 2, col.copy(PALETTE.leaf));
      this.leaves.setColorAt(i * 2 + 1, col.copy(PALETTE.leaf).offsetHSL(0, 0, 0.03));
      this.centers.setColorAt(i, s.center);
      const r = rng(s.seed);
      const off = this.petalOffsets.get(s)!;
      for (let k = 0; k < KINDS[s.kind].petals; k++) {
        col.copy(s.color).offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.08, (r() - 0.5) * 0.06);
        this.petals[s.kind].setColorAt(off + k, col);
      }
    });

    for (const m of [this.stems, this.leaves, this.centers, this.sepals, ...Object.values(this.petals)]) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.group.add(m);
    }
    this.stems.castShadow = false;
    this.leaves.castShadow = false;

    // Стебли и листья статичны в пространстве инстанса — ветер добавляет шейдер.
    specs.forEach((s, i) => {
      _e.set(Math.cos(s.leanDir) * s.leanAmt, 0, Math.sin(s.leanDir) * s.leanAmt);
      _q.setFromEuler(_e);
      const r = 0.07 * s.scale;
      _m.compose(_v.set(s.x, s.y - 0.1, s.z), _q, _s.set(r, s.stemH, r));
      this.stems.setMatrixAt(i, _m);
      const rr = rng(s.seed + 5);
      for (let k = 0; k < 2; k++) {
        // Лист как отдельный «стебель» малой высоты — ветер качает его так же.
        const h = s.stemH * (0.18 + 0.2 * k + rr() * 0.08);
        _e.set(-1.0 - rr() * 0.3, s.leanDir + k * Math.PI + rr() * 0.8, 0, 'YXZ');
        _q.setFromEuler(_e);
        const ls = (0.7 + rr() * 0.4) * s.scale;
        _m.compose(_v.set(s.x, s.y + h, s.z), _q, _s.set(ls, ls, ls * 1.5));
        this.leaves.setMatrixAt(i * 2 + k, _m);
      }
    });
    this.stems.instanceMatrix.needsUpdate = true;
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  /** Позиция верхушки стебля с учётом ветра (совпадает с шейдером). */
  static tip(s: FlowerSpec, t: number, out: THREE.Vector3): THREE.Vector3 {
    _e.set(Math.cos(s.leanDir) * s.leanAmt, 0, Math.sin(s.leanDir) * s.leanAmt);
    _q2.setFromEuler(_e);
    out.set(0, s.stemH, 0).applyQuaternion(_q2);
    const w = windAt(s.x, s.z, t) * s.stemH;
    out.x += s.x + WIND_DIR.x * w;
    out.z += s.z + WIND_DIR.z * w;
    out.y += s.y - 0.1 - Math.abs(w) * 0.3;
    return out;
  }

  update(t: number) {
    const tip = new THREE.Vector3();
    const headQ = new THREE.Quaternion();
    const windAxis = new THREE.Vector3(-WIND_DIR.z, 0, WIND_DIR.x);
    this.specs.forEach((s, i) => {
      const K = KINDS[s.kind];
      const b = bloomAmount(t, s.openAt);
      FlowerField.tip(s, t, tip);
      // Ориентация головки: наклон стебля + покачивание ветром.
      _e.set(Math.cos(s.leanDir) * s.leanAmt * 1.6, 0, Math.sin(s.leanDir) * s.leanAmt * 1.6);
      headQ.setFromEuler(_e);
      _q2.setFromAxisAngle(windAxis, -windAt(s.x, s.z, t) * 2.2);
      headQ.premultiply(_q2);
      // Лёгкий «кивок» при раскрытии.
      const pop = b > 0 && b < 1.2 ? Math.sin(clamp01((t - s.openAt) / 0.55) * Math.PI) * 0.12 : 0;
      const hs = s.scale * (1 + pop);
      const head = _head.compose(tip, headQ, _s.set(hs, hs, hs));

      const cScale = K.centerR * (0.45 + 0.55 * Math.min(1, b));
      _m.makeScale(cScale, cScale * (0.6 + 0.4 * Math.min(1, b)), cScale).premultiply(head);
      this.centers.setMatrixAt(i, _m);
      const sep = K.centerR * 1.05 * (1 - 0.2 * Math.min(1, b));
      _m.makeScale(sep, sep * 1.2, sep).premultiply(head);
      this.sepals.setMatrixAt(i, _m);

      const lift = BUD_LIFT + (K.openLift - BUD_LIFT) * b;
      const len = K.petalLen * (0.62 + 0.38 * Math.min(1.08, b));
      const wid = K.petalWidth * len * (0.7 + 0.3 * smoothstep(0, 1, b));
      const off = this.petalOffsets.get(s)!;
      const r = rng(s.seed + 11);
      for (let k = 0; k < K.petals; k++) {
        const phi = (k / K.petals) * Math.PI * 2 + r() * 0.12 + s.seed * 0.7;
        const jl = lift + (r() - 0.5) * 0.12;
        _m.makeRotationY(phi);
        _m.multiply(_m2.makeTranslation(0, 0, K.centerR * 0.55 * (0.5 + 0.5 * Math.min(1, b))));
        _m.multiply(_m2.makeRotationX(-jl));
        _m.multiply(_m2.makeScale(wid, len * 0.9, len));
        _m.premultiply(head);
        this.petals[s.kind].setMatrixAt(off + k, _m);
      }
    });
    this.centers.instanceMatrix.needsUpdate = true;
    this.sepals.instanceMatrix.needsUpdate = true;
    for (const p of Object.values(this.petals)) p.instanceMatrix.needsUpdate = true;
    this.stemMaterial.userData.uniforms.uTime.value = t;
  }
}
