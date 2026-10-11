import * as THREE from 'three';
import { inOutCubic, type Ease } from './ease';

/**
 * Ключ: [время, значение, easing сегмента ДО этого ключа].
 * Easing относится к переходу из предыдущего ключа в этот.
 */
export type Key<T> = [number, T, Ease?];

export function track(t: number, keys: Key<number>[]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const x = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      const k = (e ?? inOutCubic)(x);
      return v0 + (v1 - v0) * k;
    }
  }
  return keys[keys.length - 1][1];
}

export type V3 = [number, number, number];

export function trackV3(t: number, keys: Key<V3>[], out = new THREE.Vector3()): THREE.Vector3 {
  if (t <= keys[0][0]) return out.fromArray(keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const x = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      const k = (e ?? inOutCubic)(x);
      return out.set(v0[0] + (v1[0] - v0[0]) * k, v0[1] + (v1[1] - v0[1]) * k, v0[2] + (v1[2] - v0[2]) * k);
    }
  }
  return out.fromArray(keys[keys.length - 1][1]);
}

/** Набор именованных числовых параметров, которые интерполируются вместе (позы лица и т.п.). */
export type Params = Record<string, number>;

export function trackParams<P extends Params>(t: number, keys: Key<P>[]): P {
  if (t <= keys[0][0]) return { ...keys[0][1] };
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const x = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      const k = (e ?? inOutCubic)(x);
      const out = { ...v0 } as Params;
      for (const name in v1) {
        const a = v0[name] ?? v1[name];
        out[name] = a + (v1[name] - a) * k;
      }
      return out as P;
    }
  }
  return { ...keys[keys.length - 1][1] };
}

/** Квадратичная/кубическая кривая Безье в 3D. */
export function bezier3(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, s: number, out = new THREE.Vector3()) {
  const u = 1 - s;
  const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
  return out.set(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    a * p0.z + b * p1.z + c * p2.z + d * p3.z,
  );
}
