import * as THREE from 'three';
import { trackV3, track, type V3 } from '../timeline/tracks';
import { inOutSine, inOutCubic, inQuad, outQuad, smoothstep } from '../timeline/ease';
import { noise1 } from '../timeline/random';
import { SHOTS, shotAt } from '../timeline/timeline';
import { B0, B1, H, FACE_DIR, FACE_YAW, T } from './layout';
import { arrivalPos, landingSeat, flightPos, poseAt } from './action';

export interface CameraState {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  /** Фокусное расстояние, мм (кадр 35 мм). */
  focal: number;
  /** Дистанция фокуса; 0 — DOF выключен. */
  focus: number;
  focusRange: number;
  bokeh: number;
  /** Центр и полуразмер области теней. */
  shadowCenter: THREE.Vector3;
  shadowSize: number;
}

const v = (x: THREE.Vector3): V3 => [x.x, x.y, x.z];
const add = (a: THREE.Vector3, x: number, y: number, z: number) => a.clone().add(new THREE.Vector3(x, y, z));

// Перпендикуляр к линии «Бумс → цветок» в сторону камеры (+Z).
const SIDE = new THREE.Vector3(-FACE_DIR.z, 0, FACE_DIR.x);

function shake(t: number, t0: number, amp: number, decay: number, out: THREE.Vector3) {
  if (t < t0) return out;
  const k = amp * Math.exp(-(t - t0) * decay);
  return out.add(new THREE.Vector3(noise1(t * 28, 1) * k, noise1(t * 31, 2) * k, noise1(t * 26, 3) * k * 0.5));
}

/** Сглаженная «точка интереса» Бумса без подпрыгиваний — чтобы камера не дёргалась. */
function bumsAnchor(t: number): THREE.Vector3 {
  if (t < T.approach0) return arrivalPos(t);
  if (t < T.sneeze) {
    const k = smoothstep(T.approach0, T.approach1, t);
    const p = B0.clone().lerp(B1, k);
    p.y += -0.45 * Math.pow(smoothstep(T.pre1, T.sneeze, t), 1.4);
    return p;
  }
  if (t < T.land) return flightPos(t);
  return landingSeat(t);
}

export function cameraAt(t: number): CameraState {
  const shot = shotAt(t);
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  let focal = 35;
  let focusRange = 6;
  let bokeh = 2;
  let shadowSize = 16;
  let shadowCenter = H.clone();
  let focusPoint: THREE.Vector3;

  switch (shot.id) {
    case 's01': {
      // Общий план, низкий ракурс справа-спереди: Бумс в 3/4, влетает слева. Медленный наезд.
      trackV3(t, [[0, v(add(H, 4.2, -2.2, 19.0))], [3.0, v(add(H, 3.3, -1.8, 16.2)), inOutSine]], pos);
      const follow = arrivalPos(Math.min(t, T.arrive));
      const base = add(H, -2.3, 0.35, -0.9);
      target.copy(base).lerp(follow, 0.3 * (1 - smoothstep(1.5, 2.7, t)));
      focal = 34;
      focusPoint = bumsAnchor(t);
      focusRange = 6;
      bokeh = 3.2;
      break;
    }
    case 's02': {
      // Крупный план 3/4 чуть сверху (над лепестками), наезд ускоряется на «а-а-а».
      const subj = bumsAnchor(t);
      const dist = track(t, [[3.0, 6.0], [T.pre1, 5.6, inOutSine], [T.sneeze, 4.6, inQuad]]);
      const camDir = new THREE.Vector3(Math.sin(FACE_YAW - 0.62), 0, Math.cos(FACE_YAW - 0.62));
      const height = track(t, [[3.0, 1.6], [T.sneeze, 1.75, inOutCubic]]);
      pos.copy(subj).addScaledVector(camDir, dist).add(new THREE.Vector3(0, height, 0));
      target.copy(subj).addScaledVector(FACE_DIR, 0.75).add(new THREE.Vector3(0, 0.05, 0));
      focal = 42;
      focusPoint = subj.clone().addScaledVector(FACE_DIR, 0.75).add(new THREE.Vector3(0, 0.2, 0));
      focusRange = 1.8;
      bokeh = 4.5;
      shadowSize = 9;
      shadowCenter = subj.clone();
      break;
    }
    case 's03': {
      // Средний план: Бумс слева, цветок справа. Тряска на чихе.
      const mid = B1.clone().add(new THREE.Vector3(0, -0.45, 0)).lerp(H, 0.42);
      // Почти профиль (чуть к мордочке): цветок справа не перекрывает Бумса, выстрел чиха идёт поперёк кадра.
      const dir = SIDE.clone().addScaledVector(FACE_DIR, 0.3).normalize();
      const back = track(t, [[6.6, 9.4], [T.sneeze, 9.4], [7.2, 10.6, outQuad], [7.5, 10.8]]);
      pos.copy(mid).addScaledVector(dir, back).add(new THREE.Vector3(0, 3.4, 0));
      target.copy(mid).add(new THREE.Vector3(-0.3, 0.1, 0));
      shake(t, T.sneeze, 0.3, 5.5, pos);
      focal = 36;
      focusPoint = B1.clone();
      focusRange = 5;
      bokeh = 2.8;
      shadowSize = 14;
      shadowCenter = mid.clone();
      break;
    }
    default: {
      // Общий план сверху-сбоку: полёт над лугом и волна цветения. Камера ведёт Бумса:
      // в полёте он справа (простор по ходу движения), к приземлению — на левой трети.
      const land = landingSeat(T.land);
      // Камера смотрит вдоль −SIDE, значит «вправо по экрану» = FACE_DIR.
      const right = FACE_DIR;
      const k = smoothstep(7.7, 9.6, t);
      const fly = bumsAnchor(Math.min(t, T.land));
      const lead = fly.clone().addScaledVector(right, -3.2).add(new THREE.Vector3(0, -1.2, 0));
      const settle = land.clone().addScaledVector(right, 3.6).add(new THREE.Vector3(0, 0.4, 0));
      target.copy(lead).lerp(settle, k);
      // Мягкий «догоняющий» сдвиг: цель чуть отстаёт от героя.
      target.lerp(flightPos(Math.max(T.launch, t - 0.25)).addScaledVector(right, -3.2), 0.3 * (1 - k));
      const dist = track(t, [[7.5, 19], [10.0, 12.5, inOutSine]]);
      pos.copy(target).addScaledVector(SIDE, dist).add(new THREE.Vector3(0, dist * 0.3, 0));
      shake(t, T.land, 0.06, 6, pos);
      focal = track(t, [[7.5, 30], [10.0, 36]]);
      focusPoint = bumsAnchor(t);
      focusRange = 9;
      bokeh = 2.2;
      shadowSize = 22;
      shadowCenter = target.clone();
      break;
    }
  }

  const focus = pos.distanceTo(focusPoint);
  return { pos, target, focal, focus, focusRange, bokeh, shadowCenter, shadowSize };
}

export { SHOTS, poseAt };
