import * as THREE from 'three';
import type { BumblePose, ArmPose } from '../characters/bumble';
import { FACES, type Face } from '../characters/expressions';
import { track, trackParams, bezier3, type Key } from '../timeline/tracks';
import {
  outBack, outQuad, inQuad, inOutSine, outCubic, outQuart, inOutCubic, smoothstep, clamp01, wobble, bump, lerp,
} from '../timeline/ease';
import { noise1 } from '../timeline/random';
import { FlowerField, type FlowerSpec } from '../sets/flowers';
import { PALETTE } from '../sets/palette';
import { B0, B1, S0, H, FACE_DIR, BACK_DIR, FACE_YAW, T, LANDING_XZ, LANDING_STEM, LANDING_GROUND } from './layout';

/**
 * Игра Бумса на всём таймлайне. Чистая функция t → поза: никакого состояния,
 * поэтому превью и покадровый рендер совпадают.
 */

export const LANDING_SPEC: FlowerSpec = {
  x: LANDING_XZ.x,
  y: LANDING_GROUND,
  z: LANDING_XZ.z,
  kind: 'cosmos',
  stemH: LANDING_STEM,
  scale: 2.3,
  color: PALETTE.petalButter.clone(),
  center: PALETTE.flowerCenter.clone(),
  leanDir: 0,
  leanAmt: 0,
  openAt: T.landBloom,
  seed: 4242,
};

const UP = new THREE.Vector3(0, 1, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// ─── Траектории ───────────────────────────────────────────────────────────────

const IN_P = [S0, S0.clone().add(new THREE.Vector3(7, -4, 3)), B0.clone().add(new THREE.Vector3(-5.5, 2.4, -1.2)), B0];

function arrivalS(t: number): number {
  return outBack(1.1)(clamp01(t / T.arrive));
}

export function arrivalPos(t: number, out = new THREE.Vector3()) {
  return bezier3(IN_P[0], IN_P[1], IN_P[2], IN_P[3], arrivalS(t), out);
}

/** Где цветок-бутон держит Бумса после приземления. */
export function landingSeat(t: number, out = new THREE.Vector3()) {
  FlowerField.tip(LANDING_SPEC, t, out);
  return out.add(new THREE.Vector3(0, 0.95, 0));
}

const L_LAND = landingSeat(T.land);

/** Позиция начала отлёта: точка нюха с учётом «просадки» во время набора чиха. */
function sinkAt(t: number): number {
  return -0.45 * Math.pow(smoothstep(T.pre1, T.sneeze, t), 1.4);
}
const LAUNCH_P0 = B1.clone().add(new THREE.Vector3(0, sinkAt(T.launch), 0));
const FLY_P = [
  LAUNCH_P0,
  LAUNCH_P0.clone().addScaledVector(BACK_DIR, 9).add(new THREE.Vector3(0, 8.5, 0)),
  L_LAND.clone().addScaledVector(FACE_DIR, 7).add(new THREE.Vector3(0, 8, 0)),
  L_LAND,
];

export function flightU(t: number): number {
  return clamp01((t - T.launch) / (T.land - T.launch));
}

export function flightPos(t: number, out = new THREE.Vector3()) {
  const u = flightU(t);
  const s = 0.55 * u + 0.45 * outCubic(u);
  return bezier3(FLY_P[0], FLY_P[1], FLY_P[2], FLY_P[3], s, out);
}

// ─── Руки ─────────────────────────────────────────────────────────────────────

const arm = (raise: number, swing: number, elbow: number): ArmPose => ({ raise, swing, elbow });
const ARMS = {
  rest: arm(0.3, 0.1, 0.35),
  flyBack: arm(0.45, -1.0, 0.25),
  akimbo: arm(0.95, -0.25, 2.0),
  reach: arm(0.3, 0.75, 1.1),
  hold: arm(0.45, 1.15, 1.95),
  fling: arm(1.35, 0.35, 0.15),
  plop: arm(1.0, 0.1, 0.35),
};

function mixArm(a: ArmPose, b: ArmPose, k: number): ArmPose {
  return { raise: lerp(a.raise, b.raise, k), swing: lerp(a.swing, b.swing, k), elbow: lerp(a.elbow, b.elbow, k) };
}

function armTrack(t: number, keys: [number, ArmPose, ((x: number) => number)?][]): ArmPose {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, a] = keys[i - 1];
      const [t1, b, e] = keys[i];
      return mixArm(a, b, (e ?? inOutCubic)((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

// ─── Лицо ─────────────────────────────────────────────────────────────────────

const FACE_KEYS: Key<Face>[] = [
  [0, { ...FACES.proud, lookY: 0.05 }],
  [2.0, { ...FACES.proud, lookY: -0.1 }],
  [2.5, { ...FACES.proud, mOpen: 0.15, lookY: -0.12 }],
  [3.15, { ...FACES.proud, mOpen: 0.1, lookY: -0.15 }],
  [3.6, { ...FACES.neutral, upL: 0.68, upR: 0.68, mSmile: 0.6, mOpen: 0.12, browL: 0.4, browR: 0.4, lookY: -0.2, pupil: 1.15 }],
  [4.05, FACES.bliss],
  [4.66, { ...FACES.bliss, mSmile: 1.0, blush: 0.75 }],
  [4.8, { ...FACES.bliss, upL: -0.9, upR: -1.2, mSmile: 0.4, browTilt: 0.5 }],
  [4.9, FACES.worry, outQuad],
  [T.pre1 + 0.15, FACES.pre1, outQuad],
  [T.pre2 + 0.15, FACES.pre2, outQuad],
  [T.pre3 + 0.18, FACES.pre3, outQuad],
  [T.sneeze, { ...FACES.pre3, upL: -0.9, upR: -0.8, mOpen: 1.0, mW: 1.25 }],
  [T.sneeze + 0.04, FACES.sneeze, inQuad],
  [7.0, FACES.sneeze],
  [7.25, { ...FACES.surprised, mOpen: 0.75, mW: 0.7 }, outQuad],
  [8.7, { ...FACES.surprised, mOpen: 0.6, upL: 0.95, upR: 0.95 }],
  [T.land + 0.02, { ...FACES.surprised, upL: -0.6, upR: -0.6, mOpen: 0.4 }],
  [T.land + 0.25, FACES.dazed],
  [10.0, { ...FACES.dazed, mSmile: 0.55, mSkew: 0.4 }],
];

/** Моргания: короткие закрытия век поверх основной эмоции. */
const BLINKS = [1.15, 2.62, 3.5];

function faceAt(t: number): Face {
  const f = trackParams(t, FACE_KEYS);
  for (const b of BLINKS) {
    const k = bump(b, b + 0.16, t, 0.45);
    if (k > 0) {
      f.upL = lerp(f.upL, -1.42, k);
      f.upR = lerp(f.upR, -1.42, k);
    }
  }
  // Дрожь век на пике набора чиха.
  const tremble = smoothstep(T.pre3, T.pre3 + 0.4, t) * (t < T.sneeze ? 1 : 0);
  f.upL += tremble * 0.06 * Math.sin(t * 95);
  f.upR += tremble * 0.06 * Math.sin(t * 88 + 1);
  // Во время полёта глаза мечутся.
  if (t > 7.25 && t < T.land) {
    f.lookX = noise1(t * 3.2, 5) * 0.35;
    f.lookY = noise1(t * 2.7, 9) * 0.25;
  }
  return f;
}

// ─── Поза целиком ─────────────────────────────────────────────────────────────

const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();

export function poseAt(t: number): BumblePose {
  const face = faceAt(t);
  const pos = new THREE.Vector3();
  let yaw = FACE_YAW;
  let lean = 0;
  let roll = 0;
  let stretch = 1;
  let stretchAxis = Y_AXIS;
  let inhale = 0;
  let wing = 1;
  let wingHz = 9.5;
  let legTuck = 0.3;
  let noseTwitch = 0;
  let armL: ArmPose;
  let armR: ArmPose;

  // Лёгкое «дыхание» и парение в простое.
  const breathe = Math.sin(t * Math.PI * 2 * 0.55) * 0.5 + 0.5;

  if (t < T.approach0) {
    // ── Кадр 1: прилёт ──
    arrivalPos(t, pos);
    const bobAmp = 0.24 * (1 - smoothstep(1.9, 2.7, t)) + 0.07;
    pos.y += Math.sin(t * Math.PI * 2 * 1.6) * bobAmp;
    // Курс по касательной к траектории, к концу — разворот на цветок.
    arrivalPos(Math.min(t + 0.05, T.arrive), _p2);
    arrivalPos(Math.max(0, t - 0.05), _p);
    const dir = _p2.sub(_p);
    const pathYaw = dir.lengthSq() > 1e-6 ? Math.atan2(dir.x, dir.z) : FACE_YAW;
    yaw = lerpAngle(pathYaw, FACE_YAW, smoothstep(1.3, 2.35, t));
    lean = track(t, [
      [0, 0.38],
      [1.7, 0.3],
      [2.28, -0.34, outQuad],
      [2.62, 0.12, inOutSine],
      [3.0, -0.02, inOutSine],
      [3.3, 0.0],
    ]);
    roll = track(t, [[0, 0.22], [1.1, -0.28], [2.0, 0.05], [2.4, 0.0]]);
    stretch = track(t, [[0, 1.04], [1.9, 1.04], [2.28, 0.84, outQuad], [2.48, 1.1, inOutSine], [2.72, 0.96], [2.95, 1.0]]);
    inhale = track(t, [[2.4, 0], [2.75, 0.55, outQuad], [3.3, 0.35]]) + breathe * 0.08;
    legTuck = track(t, [[0, 1], [2.1, 1], [2.6, 0.3]]);
    armL = armTrack(t, [[0, ARMS.flyBack], [2.15, ARMS.flyBack], [2.6, ARMS.akimbo, outBack(1.6)]]);
    armR = armL;
  } else if (t < T.sneeze) {
    // ── Кадр 2: подлёт, нюх, набор чиха ──
    const ant = B0.clone().addScaledVector(FACE_DIR, -0.3).add(new THREE.Vector3(0, 0.1, 0));
    const a = clamp01((t - T.approach0) / 0.18);
    const b = clamp01((t - (T.approach0 + 0.18)) / (T.approach1 - T.approach0 - 0.18));
    if (t < T.approach0 + 0.18) pos.lerpVectors(B0, ant, inOutSine(a));
    else pos.lerpVectors(ant, B1, outBack(1.3)(b));
    pos.y += Math.sin(t * Math.PI * 2 * 1.1) * 0.06 * (1 - smoothstep(T.pre1, T.pre1 + 0.3, t));
    pos.y += sinkAt(t);
    lean = track(t, [
      [T.approach0, 0.0],
      [T.approach0 + 0.18, -0.14, inOutSine],
      [T.approach1, 0.3, outQuad],
      [4.05, 0.12],
      [4.6, -0.12],
      [4.9, 0.06, outQuad],
      [T.pre1 + 0.2, -0.2, outQuad],
      [T.pre2 + 0.22, -0.38, outQuad],
      [T.pre3 + 0.25, -0.56, outQuad],
      [T.sneeze, -0.6],
    ]);
    // Дрожь на пике.
    lean += smoothstep(T.pre3 + 0.2, T.sneeze, t) * 0.012 * Math.sin(t * 90);
    roll = smoothstep(T.pre3 + 0.2, T.sneeze, t) * 0.01 * Math.sin(t * 77 + 2);
    inhale = track(t, [
      [T.sniff0, 0.3],
      [4.0, 0.55, outQuad],
      [4.08, 0.45],
      [4.25, 0.8, outQuad],
      [4.33, 0.7],
      [T.sniff1, 1.15, inOutSine],
      [4.9, 0.85],
      [T.pre1 + 0.2, 0.95, outQuad],
      [T.pre2 + 0.2, 1.12, outQuad],
      [T.pre3 + 0.22, 1.35, outQuad],
      [T.sneeze, 1.4],
    ]);
    stretch = track(t, [
      [T.approach0, 1.0],
      [T.approach0 + 0.18, 0.94],
      [T.approach0 + 0.35, 1.06],
      [T.approach1 + 0.1, 1.0],
      [T.pre1, 1.0],
      [T.pre1 + 0.2, 1.06, outQuad],
      [T.pre2 + 0.2, 1.12, outQuad],
      [T.pre3 + 0.22, 1.2, outQuad],
      [T.sneeze, 1.22],
    ]);
    noseTwitch = wobble(t - T.twitch1, 9, 9) * 0.8 + wobble(t - T.twitch2, 11, 7) * 1.2 +
      smoothstep(T.pre1, T.sneeze, t) * Math.sin(t * 47) * 0.25;
    wing = track(t, [[T.pre1, 1], [T.pre1 + 0.35, 0.05, outQuad]]);
    legTuck = 0.3;
    armL = armTrack(t, [
      [T.approach0, ARMS.akimbo],
      [T.approach1, ARMS.reach],
      [4.6, mixArm(ARMS.reach, ARMS.rest, 0.5)],
      [4.95, ARMS.rest],
      [T.pre2, mixArm(ARMS.rest, ARMS.hold, 0.6)],
      [T.pre3 + 0.25, ARMS.hold],
    ]);
    const tr = smoothstep(T.pre2, T.sneeze, t) * 0.06 * Math.sin(t * 61);
    armL = { ...armL, swing: armL.swing + tr };
    armR = { ...armL, swing: armL.swing - tr * 1.3 };
  } else {
    // ── Кадры 3–4: ПЧХИ, отлёт, полёт, приземление ──
    const ts = t - T.sneeze;
    if (t < T.launch) {
      // Рывок вперёд: голова «клюёт» к цветку.
      pos.copy(B1).add(new THREE.Vector3(0, sinkAt(t), 0)).addScaledVector(FACE_DIR, 0.25 * outQuad(clamp01(ts / 0.04)));
    } else if (t < T.land) {
      flightPos(t, pos);
    } else {
      landingSeat(t, pos);
      const tl = t - T.land;
      pos.y += 0.55 * Math.max(0, Math.sin(Math.min(tl, 0.42) / 0.42 * Math.PI)) * smoothstep(0.02, 0.08, tl);
    }
    const u = flightU(t);
    // В полёте — пол-оборота вокруг вертикали: к приземлению Бумс сидит лицом к камере.
    yaw = FACE_YAW + (t > T.launch ? -1.62 * outCubic(u) : 0);
    if (t < T.launch) {
      lean = lerp(-0.6, 0.55, inQuad(clamp01(ts / 0.04)));
    } else if (t < T.land) {
      // Два сальто назад, замедляющихся к концу.
      lean = 0.55 + (-4 * Math.PI - 0.55) * outQuart(u);
      roll = Math.sin(u * Math.PI) * 0.35;
    } else {
      lean = 0.08 * wobble(t - T.land, 2.2, 3);
      roll = 0.12 * Math.sin((t - T.land) * 5.5) * Math.exp(-(t - T.land) * 0.8) + 0.06;
    }
    // Сжатие-растяжение: удар чиха сжимает вдоль «вперёд», отлёт растягивает.
    if (t < T.sneeze + 0.012) {
      stretch = 1.0;
      stretchAxis = Y_AXIS;
    } else if (t < T.land) {
      stretchAxis = Z_AXIS;
      stretch = track(t, [
        [T.sneeze + 0.012, 1.0],
        [T.sneeze + 0.045, 0.74, outQuad],
        [T.launch + 0.03, 1.38, outQuad],
        [7.35, 1.08],
        [8.4, 1.0],
      ]);
    } else {
      stretchAxis = Y_AXIS;
      stretch = track(t, [
        [T.land, 1.0],
        [T.land + 0.05, 0.62, outQuad],
        [T.land + 0.2, 1.18, outQuad],
        [T.land + 0.38, 0.9],
        [T.land + 0.55, 1.04],
        [T.land + 0.75, 1.0],
      ]);
    }
    inhale = track(t, [[T.sneeze, 1.4], [T.sneeze + 0.04, -0.2, outQuad], [7.2, 0.1], [T.land, 0.0], [T.land + 0.4, 0.5], [10, 0.25]]);
    noseTwitch = wobble(ts, 7, 4) * 0.6;
    wing = t < T.land ? 1 : track(t, [[T.land, 0.8], [T.land + 0.3, 0.0]]);
    wingHz = t < T.land ? 14 : 9.5;
    legTuck = 0;
    if (t < T.land) {
      const fl = ARMS.fling;
      const wob = smoothstep(T.launch, 7.0, t);
      armL = { raise: fl.raise + Math.sin(t * 9.0) * 0.3 * wob, swing: fl.swing + Math.sin(t * 7.3) * 0.5 * wob, elbow: fl.elbow + 0.3 * wob };
      armR = { raise: fl.raise + Math.sin(t * 8.1 + 1) * 0.3 * wob, swing: fl.swing + Math.sin(t * 6.7 + 2) * 0.5 * wob, elbow: fl.elbow + 0.3 * wob };
    } else {
      armL = armTrack(t, [[T.land, ARMS.fling], [T.land + 0.3, ARMS.plop, outBack(1.5)]]);
      armR = armL;
    }
  }

  return {
    pos, yaw, lean, roll, stretch, stretchAxis, inhale, wing, wingHz, face,
    armL, armR, legTuck, noseTwitch,
  };
}

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** Выборка траектории полёта для волны цветения и шлейфа пыльцы. */
export function flightSamples(n = 80): { t: number; p: THREE.Vector3 }[] {
  const out: { t: number; p: THREE.Vector3 }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = T.launch + (T.land - T.launch) * (i / n);
    out.push({ t, p: flightPos(t) });
  }
  return out;
}

export { H, UP };
