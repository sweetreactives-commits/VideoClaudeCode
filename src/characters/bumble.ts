import * as THREE from 'three';
import { createFurMaterial, createFuzzShellMaterial, createLidMaterial, type FurUniforms } from './fur';
import { Eye } from './eye';
import { Mouth } from './mouth';
import type { Face } from './expressions';
import { SpringRig } from '../timeline/springs';
import { PALETTE } from '../sets/palette';

/**
 * Бумс — шмель-стажёр. Тело — почти шар радиуса 1 (мир в масштабе насекомых: 1 ед. ≈ радиус Бумса).
 * Локальные оси тела: +Z — мордочка, +Y — макушка, +X — его левый бок (правый для зрителя).
 */

export interface ArmPose {
  /** Отведение вбок-вверх (0 — вдоль тела, π/2 — горизонтально). */
  raise: number;
  /** Мах вперёд (+) / назад (−). */
  swing: number;
  /** Сгиб локтя. */
  elbow: number;
}

export interface BumblePose {
  pos: THREE.Vector3;
  yaw: number;
  /** Наклон: > 0 — вперёд (мордочкой вниз), < 0 — откинуться назад. */
  lean: number;
  roll: number;
  /** Растяжение вдоль оси stretchAxis (объём сохраняется). 1 — нейтрально. */
  stretch: number;
  stretchAxis: THREE.Vector3;
  /** Вдох: тело раздувается. */
  inhale: number;
  /** Амплитуда взмахов крыльев 0…1 и частота, Гц. */
  wing: number;
  wingHz: number;
  face: Face;
  armL: ArmPose;
  armR: ArmPose;
  /** Подогнуть ножки (в полёте). */
  legTuck: number;
  /** Дрожь носа (смещение). */
  noseTwitch: number;
}

export type PoseFn = (t: number) => BumblePose;

// ─── Поверхность тела ─────────────────────────────────────────────────────────

export function dirFrom(lat: number, lon: number, out = new THREE.Vector3()) {
  return out.set(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat));
}

/** Деформация единичной сферы в форму тела: слегка приплюснутая груша. */
export function deformBody(p: THREE.Vector3): THREE.Vector3 {
  p.y *= 0.95;
  if (p.y < 0) {
    const k = 1 + 0.08 * (-p.y / 0.95);
    p.x *= k;
    p.z *= k;
  }
  return p;
}

export function surfacePoint(dir: THREE.Vector3, out = new THREE.Vector3()) {
  return deformBody(out.copy(dir).normalize());
}

function bodyGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 112, 80);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    deformBody(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Базис «наружу из поверхности»: z — нормаль, y — вверх по телу. */
function surfaceFrame(dir: THREE.Vector3, out = new THREE.Quaternion()) {
  const z = dir.clone().normalize();
  const x = new THREE.Vector3(0, 1, 0).cross(z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = z.clone().cross(x).normalize();
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// ─── Персонаж ─────────────────────────────────────────────────────────────────

const ANTENNA_LEN = 0.95;
const TUFT_LEN = 0.42;
const LEG_LEN = 0.48;

export class Bumble {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly furUniforms: FurUniforms;
  private eyeL: Eye;
  private eyeR: Eye;
  private browL: THREE.Mesh;
  private browR: THREE.Mesh;
  private browDirL: THREE.Vector3;
  private browDirR: THREE.Vector3;
  private nose = new THREE.Group();
  private noseBase = new THREE.Vector3();
  private mouth: Mouth;
  private arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  private legs: { hip: THREE.Group; base: THREE.Vector3 }[] = [];
  private wings: { pivot: THREE.Group; ghost: number; side: number; hind: boolean }[] = [];
  private antennae: { mesh: THREE.Mesh; ball: THREE.Mesh; base: THREE.Vector3; rest: THREE.Vector3 }[] = [];
  private tuft: { meshes: THREE.Mesh[]; base: THREE.Vector3; rest: THREE.Vector3 };
  private springs: SpringRig;
  private stretchM = new THREE.Matrix4();
  readonly shells: THREE.Mesh[] = [];
  private choc: THREE.MeshPhysicalMaterial;
  /** Мировые позиции для эффектов (нос — источник чиха). */
  readonly noseWorld = new THREE.Vector3();
  readonly mouthWorld = new THREE.Vector3();

  constructor(private poseFn: PoseFn, opts: { shells?: number } = {}) {
    this.root.add(this.body);
    this.body.matrixAutoUpdate = false;

    // Тело и ворс.
    const fur = createFurMaterial();
    this.furUniforms = fur.uniforms;
    fur.uniforms.uBlushL.value.copy(dirFrom(-0.1, 0.66));
    fur.uniforms.uBlushR.value.copy(dirFrom(-0.1, -0.66));
    const bodyGeo = bodyGeometry();
    const bodyMesh = new THREE.Mesh(bodyGeo, fur.material);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.name = 'bums-body';
    this.body.add(bodyMesh);
    const shellCount = opts.shells ?? 8;
    for (let i = 0; i < shellCount; i++) {
      const s = new THREE.Mesh(bodyGeo, createFuzzShellMaterial(i, shellCount, fur.uniforms));
      s.castShadow = false;
      s.receiveShadow = true;
      s.renderOrder = 1 + i;
      this.shells.push(s);
      this.body.add(s);
    }

    this.choc = new THREE.MeshPhysicalMaterial({
      color: PALETTE.bumsChoc,
      roughness: 0.55,
      sheen: 0.6,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color('#a07050'),
      clearcoat: 0.25,
      clearcoatRoughness: 0.4,
    });
    const lidMat = createLidMaterial();

    // Глаза.
    const eyeR = 0.31;
    const mkEye = (side: 1 | -1) => {
      const e = new Eye(eyeR, side, lidMat);
      const dir = dirFrom(0.24, 0.4 * side);
      e.socket.position.copy(surfacePoint(dir)).multiplyScalar(0.82);
      surfaceFrame(dir, e.socket.quaternion);
      // Глаза чуть «смотрят» вперёд, а не строго по нормали — меньше «рыбьего» взгляда.
      e.socket.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, -0.22 * side, 0)));
      this.body.add(e.socket);
      return e;
    };
    this.eyeL = mkEye(1);
    this.eyeR = mkEye(-1);

    // Брови: изогнутые капсулы.
    const browGeo = new THREE.CapsuleGeometry(0.052, 0.24, 6, 12).rotateZ(Math.PI / 2);
    const bp = browGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i);
      const taper = 1 - Math.abs(x) * 1.1;
      bp.setY(i, bp.getY(i) * Math.max(0.45, taper) - x * x * 0.9);
      bp.setZ(i, bp.getZ(i) * 0.7);
    }
    browGeo.computeVertexNormals();
    this.browL = new THREE.Mesh(browGeo, this.choc);
    this.browR = new THREE.Mesh(browGeo, this.choc);
    this.browDirL = dirFrom(0.7, 0.42);
    this.browDirR = dirFrom(0.7, -0.42);
    for (const b of [this.browL, this.browR]) {
      b.castShadow = true;
      this.body.add(b);
    }

    // Нос: красная распухшая кнопка с ноздрями.
    const noseMat = new THREE.MeshPhysicalMaterial({
      color: PALETTE.bumsNose,
      roughness: 0.32,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15,
      sheen: 0.4,
      sheenColor: new THREE.Color('#ffb0a0'),
    });
    const noseBall = new THREE.Mesh(new THREE.SphereGeometry(0.155, 32, 20), noseMat);
    noseBall.scale.set(1.25, 1.0, 1.0);
    noseBall.castShadow = true;
    this.nose.add(noseBall);
    const nostrilMat = new THREE.MeshStandardMaterial({ color: '#3a0a0c', roughness: 0.8 });
    for (const s of [1, -1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), nostrilMat);
      n.position.set(0.065 * s, -0.075, 0.095);
      n.scale.set(1.2, 0.7, 0.8);
      this.nose.add(n);
    }
    const noseDir = dirFrom(-0.02, 0);
    this.noseBase.copy(surfacePoint(noseDir)).multiplyScalar(1.03);
    this.nose.position.copy(this.noseBase);
    surfaceFrame(noseDir, this.nose.quaternion);
    this.body.add(this.nose);

    // Рот.
    this.mouth = new Mouth(dirFrom(-0.31, 0), (d, out) => surfacePoint(d, out), 1.15);
    this.body.add(this.mouth.group);

    // Руки.
    for (const side of [1, -1]) {
      const shoulder = new THREE.Group();
      const sDir = dirFrom(-0.18, 1.42 * side);
      shoulder.position.copy(surfacePoint(sDir)).multiplyScalar(0.93);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.26, 4, 10).translate(0, -0.2, 0), this.choc);
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.36, 0);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.22, 4, 10).translate(0, -0.17, 0), this.choc);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), this.choc);
      hand.position.set(0, -0.37, 0.01);
      hand.scale.set(1, 0.9, 1.1);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), this.choc);
      thumb.position.set(-0.07 * side, -0.31, 0.07);
      for (const m of [upper, fore, hand, thumb]) m.castShadow = true;
      elbow.add(fore, hand, thumb);
      shoulder.add(upper, elbow);
      this.body.add(shoulder);
      this.arms.push({ shoulder, elbow });
    }

    // Ножки: болтаются на пружинах.
    for (const side of [1, -1]) {
      const hip = new THREE.Group();
      const base = surfacePoint(dirFrom(-0.8, 0.42 * side)).multiplyScalar(0.92);
      hip.position.copy(base);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, LEG_LEN - 0.12, 4, 10).translate(0, -LEG_LEN / 2 + 0.02, 0), this.choc);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), this.choc);
      foot.position.set(0, -LEG_LEN + 0.02, 0.05);
      foot.scale.set(1, 0.7, 1.45);
      leg.castShadow = true;
      foot.castShadow = true;
      hip.add(leg, foot);
      this.body.add(hip);
      this.legs.push({ hip, base });
    }

    // Жало: крошечный конус сзади.
    const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 12).rotateX(Math.PI / 2).translate(0, 0, 0.08), this.choc);
    const stDir = dirFrom(-0.12, Math.PI);
    stinger.position.copy(surfacePoint(stDir)).multiplyScalar(0.98);
    surfaceFrame(stDir, stinger.quaternion);
    this.body.add(stinger);

    // Крылья: маленькие (гэг: явно не держат такой вес), по две на сторону + шлейф размытия.
    const wingMat = (opacity: number) =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#f4f8ff'),
        roughness: 0.12,
        metalness: 0,
        transparent: true,
        opacity,
        iridescence: 1,
        iridescenceIOR: 1.5,
        iridescenceThicknessRange: [250, 650],
        side: THREE.DoubleSide,
        depthWrite: false,
        emissive: new THREE.Color('#fff8ee'),
        emissiveIntensity: 0.1,
      });
    const wingShape = (len: number, wid: number) => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(len * 0.25, wid * 0.75, len * 0.85, wid * 0.7, len, wid * 0.1);
      s.bezierCurveTo(len * 1.03, -wid * 0.25, len * 0.6, -wid * 0.45, len * 0.25, -wid * 0.3);
      s.bezierCurveTo(len * 0.1, -wid * 0.2, 0.02, -0.03, 0, 0);
      return new THREE.ShapeGeometry(s, 16).rotateX(-Math.PI / 2);
    };
    for (const side of [1, -1]) {
      for (const hind of [false, true]) {
        const geo = wingShape(hind ? 0.55 : 0.8, hind ? 0.32 : 0.44);
        for (let ghost = 0; ghost < 3; ghost++) {
          const root = new THREE.Group();
          root.position.copy(surfacePoint(dirFrom(hind ? 0.5 : 0.66, (Math.PI - (hind ? 0.62 : 0.75)) * side))).multiplyScalar(0.98);
          const pivot = new THREE.Group();
          const sweep = new THREE.Group();
          sweep.rotation.y = (hind ? 0.85 : 0.5) * side;
          const mesh = new THREE.Mesh(geo, wingMat([0.62, 0.24, 0.12][ghost]));
          if (side < 0) mesh.scale.x = -1;
          mesh.renderOrder = 10 + ghost;
          sweep.add(mesh);
          pivot.add(sweep);
          root.add(pivot);
          this.body.add(root);
          this.wings.push({ pivot, ghost, side, hind });
        }
      }
    }

    // Антенны.
    const antMat = this.choc;
    for (const side of [1, -1]) {
      const base = surfacePoint(dirFrom(1.02, 0.42 * side)).multiplyScalar(0.97);
      const restDir = new THREE.Vector3(0.38 * side, 0.85, 0.32).normalize();
      const rest = base.clone().addScaledVector(restDir, ANTENNA_LEN);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), antMat);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), antMat);
      mesh.castShadow = true;
      ball.castShadow = true;
      this.body.add(mesh, ball);
      this.antennae.push({ mesh, ball, base, rest });
    }

    // Хохолок на макушке.
    const tuftBase = surfacePoint(dirFrom(1.42, 0)).multiplyScalar(0.98);
    const tuftRest = tuftBase.clone().add(new THREE.Vector3(0, TUFT_LEN, 0.08));
    const tuftMat = new THREE.MeshPhysicalMaterial({ color: PALETTE.bumsOrange, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#ffd090') });
    const tuftMeshes = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), tuftMat);
      m.castShadow = true;
      this.body.add(m);
      return m;
    });
    this.tuft = { meshes: tuftMeshes, base: tuftBase, rest: tuftRest };

    // Пружины: кончики антенн, хохолок, ступни.
    this.springs = new SpringRig(
      [
        { k: 160, c: 6.5, length: ANTENNA_LEN },
        { k: 160, c: 6.5, length: ANTENNA_LEN },
        { k: 240, c: 8, length: TUFT_LEN },
        { k: 70, c: 5, length: LEG_LEN },
        { k: 70, c: 5, length: LEG_LEN },
      ],
      (t, rest, base) => {
        const m = this.bodyWorldMatrix(this.poseFn(t), _mA);
        rest[0].copy(this.antennae[0].rest).applyMatrix4(m);
        base[0].copy(this.antennae[0].base).applyMatrix4(m);
        rest[1].copy(this.antennae[1].rest).applyMatrix4(m);
        base[1].copy(this.antennae[1].base).applyMatrix4(m);
        rest[2].copy(this.tuft.rest).applyMatrix4(m);
        base[2].copy(this.tuft.base).applyMatrix4(m);
        for (let i = 0; i < 2; i++) {
          const legRest = this.legs[i].base.clone().add(new THREE.Vector3(0, -LEG_LEN, 0.06));
          rest[3 + i].copy(legRest).applyMatrix4(m);
          base[3 + i].copy(this.legs[i].base).applyMatrix4(m);
        }
      },
    );

    this.root.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  /** Подменить функцию позы (лист персонажа) и сбросить пружины. */
  setPoseFn(fn: PoseFn) {
    this.poseFn = fn;
    this.springs.invalidate();
  }

  /** Матрица «тело → мир» для позы (корень + растяжение + вдох). */
  bodyWorldMatrix(p: BumblePose, out: THREE.Matrix4): THREE.Matrix4 {
    _q.setFromEuler(_e.set(p.lean, p.yaw, p.roll, 'YXZ'));
    out.compose(p.pos, _q, _one);
    this.stretchMatrix(p, _mB);
    return out.multiply(_mB);
  }

  private stretchMatrix(p: BumblePose, out: THREE.Matrix4) {
    const s = p.stretch;
    const a = p.stretchAxis;
    const k = 1 / Math.sqrt(s);
    const d = s - k;
    const inh = 1 + 0.07 * p.inhale;
    out.set(
      (k + d * a.x * a.x) * inh, d * a.x * a.y * inh, d * a.x * a.z * inh, 0,
      d * a.y * a.x * inh, (k + d * a.y * a.y) * inh, d * a.y * a.z * inh, 0,
      d * a.z * a.x * inh, d * a.z * a.y * inh, (k + d * a.z * a.z) * inh, 0,
      0, 0, 0, 1,
    );
    return out;
  }

  update(t: number) {
    const p = this.poseFn(t);
    this.root.position.copy(p.pos);
    this.root.quaternion.setFromEuler(_e.set(p.lean, p.yaw, p.roll, 'YXZ'));
    this.stretchMatrix(p, this.stretchM);
    this.body.matrix.copy(this.stretchM);
    this.root.updateMatrixWorld(true);

    // Лицо.
    const F = p.face;
    this.eyeL.apply({ upper: F.upL, lower: F.low, tilt: F.tilt, lookX: F.lookX, lookY: F.lookY, pupil: F.pupil });
    this.eyeR.apply({ upper: F.upR, lower: F.low, tilt: F.tilt, lookX: F.lookX, lookY: F.lookY, pupil: F.pupil });
    this.placeBrow(this.browL, this.browDirL, F.browL, F.browTilt, 1);
    this.placeBrow(this.browR, this.browDirR, F.browR, F.browTilt, -1);
    this.mouth.apply({ w: F.mW, open: F.mOpen, smile: F.mSmile, round: F.mRound, skew: F.mSkew });
    const flare = 1 + 0.18 * F.noseFlare;
    this.nose.scale.set(flare, 1 + 0.06 * F.noseFlare, 1 + 0.05 * F.noseFlare);
    this.nose.position.copy(this.noseBase).add(_v.set(0, p.noseTwitch * 0.05, 0));
    this.nose.rotation.z = 0;
    surfaceFrame(dirFrom(-0.02, 0), this.nose.quaternion);
    this.nose.rotateZ(p.noseTwitch * 0.25);
    this.furUniforms.uCheekPuff.value = F.cheekPuff;
    this.furUniforms.uBlush.value = F.blush;

    // Руки.
    const arms = [p.armL, p.armR];
    this.arms.forEach((a, i) => {
      const side = i === 0 ? 1 : -1;
      const ap = arms[i];
      a.shoulder.rotation.set(-ap.swing, 0, ap.raise * side, 'XYZ');
      a.elbow.rotation.set(-ap.elbow, 0, 0);
    });

    // Крылья: взмах + два «призрака» с запаздыванием фазы — дешёвый моушн-блюр.
    for (const w of this.wings) {
      const phaseLag = w.ghost * 0.11;
      const ph = (t * p.wingHz - phaseLag) * Math.PI * 2 + (w.hind ? 0.7 : 0);
      const flap = p.wing * (0.75 * Math.sin(ph)) + 0.35 - (1 - p.wing) * 0.15;
      w.pivot.rotation.set(0, 0, flap * w.side);
      w.pivot.visible = w.ghost === 0 || p.wing > 0.3;
    }

    // Пружинная вторичка.
    this.root.updateMatrixWorld(true);
    const sp = this.springs.sample(t);
    const inv = _mC.copy(this.body.matrixWorld).invert();
    for (let i = 0; i < 2; i++) {
      const a = this.antennae[i];
      const tip = _v.copy(sp[i]).applyMatrix4(inv);
      const restDir = _v2.copy(a.rest).sub(a.base).normalize();
      const ctrl = a.base.clone().addScaledVector(restDir, ANTENNA_LEN * 0.45);
      const curve = new THREE.QuadraticBezierCurve3(a.base.clone(), ctrl, tip.clone());
      a.mesh.geometry.dispose();
      a.mesh.geometry = new THREE.TubeGeometry(curve, 16, 0.032, 7, false);
      a.ball.position.copy(tip);
    }
    {
      const tip = _v.copy(sp[2]).applyMatrix4(inv);
      const b = this.tuft.base;
      this.tuft.meshes.forEach((m, k) => {
        const off = new THREE.Vector3((k - 1) * 0.07, 0, (k - 1) * -0.03);
        const end = tip.clone().add(off.clone().multiplyScalar(2.2)).add(new THREE.Vector3(0, -k * 0.04, 0));
        const ctrl = b.clone().add(off).add(new THREE.Vector3(0, TUFT_LEN * 0.55, 0));
        const curve = new THREE.QuadraticBezierCurve3(b.clone().add(off), ctrl, end);
        m.geometry.dispose();
        m.geometry = taperedTube(curve, 0.05, 0.012);
      });
    }
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const tip = _v.copy(sp[3 + i]).applyMatrix4(inv);
      const dir = tip.sub(L.base).normalize();
      // Подогнутые ножки в полёте.
      const tuck = _v2.set(0, -0.55, 0.85).normalize();
      dir.lerp(tuck, p.legTuck * 0.7).normalize();
      L.hip.quaternion.setFromUnitVectors(_down, dir);
    }

    this.root.updateMatrixWorld(true);
    this.noseWorld.set(0, -0.02, 0.17).applyMatrix4(this.nose.matrixWorld);
    this.mouthWorld.copy(surfacePoint(dirFrom(-0.36, 0))).applyMatrix4(this.body.matrixWorld);
  }

  private placeBrow(b: THREE.Mesh, dir0: THREE.Vector3, raise: number, tilt: number, side: number) {
    const lat = Math.asin(dir0.y) + raise * 0.1;
    const lon = Math.atan2(dir0.x, dir0.z) - raise * 0.02 * side;
    const d = dirFrom(lat, lon);
    b.position.copy(surfacePoint(d)).multiplyScalar(1.035);
    surfaceFrame(d, b.quaternion);
    b.rotateZ(-tilt * 0.45 * side);
    b.scale.set(1 + 0.08 * Math.abs(raise), 1, 1);
  }
}

/** Трубка с убывающим радиусом (волоски хохолка). */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number): THREE.BufferGeometry {
  const g = new THREE.TubeGeometry(curve, 12, 1, 6, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const seg = 12, rad = 6;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    curve.getPointAt(u, c);
    const r = r0 + (r1 - r0) * u;
    for (let j = 0; j <= rad; j++) {
      const idx = i * (rad + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _down = new THREE.Vector3(0, -1, 0);
const _mA = new THREE.Matrix4();
const _mB = new THREE.Matrix4();
const _mC = new THREE.Matrix4();
