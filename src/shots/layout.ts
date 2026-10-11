import * as THREE from 'three';
import { heightAt } from '../sets/terrain';

// Ключевые точки мизансцены. Всё в мировых единицах (1 ед. ≈ радиус Бумса).

export const HERO_BASE = new THREE.Vector3(1.15, 0, 0.05);
HERO_BASE.y = heightAt(HERO_BASE.x, HERO_BASE.z);
export const HERO_HEIGHT = 8.0;
/** Ориентация «лица» цветка-героя: к Бумсу и чуть к камере. */
export const HERO_UP = new THREE.Vector3(-0.4, 0.92, 0.06).normalize();

/** Центр головки героя-цветка в покое (без ветра). */
export function heroHeadRest(): THREE.Vector3 {
  const lean = HERO_UP.clone().setY(0).multiplyScalar(HERO_HEIGHT * 0.35);
  return HERO_BASE.clone().add(new THREE.Vector3(0, HERO_HEIGHT, 0)).add(lean);
}

export const H = heroHeadRest();
/** Направление взгляда Бумса на цветок (горизонтальное). */
export const FACE_DIR = new THREE.Vector3(0.867, 0, 0.499).normalize();
export const BACK_DIR = FACE_DIR.clone().negate();
export const FACE_YAW = Math.atan2(FACE_DIR.x, FACE_DIR.z);

/** Точка зависания после прилёта. */
export const B0 = H.clone().addScaledVector(FACE_DIR, -3.9).add(new THREE.Vector3(0, 0.75, 0));
/** Точка нюха — ближе к цветку. */
export const B1 = H.clone().addScaledVector(FACE_DIR, -2.9).add(new THREE.Vector3(0, 1.0, 0));
/** Старт прилёта (за кадром слева-сзади). */
export const S0 = B0.clone().add(new THREE.Vector3(-17, 5.5, -8));

/** Бутон, в который Бумс приземляется в конце. */
export const LANDING_XZ = B1.clone().addScaledVector(BACK_DIR, 34).add(new THREE.Vector3(-3, 0, 4));
export const LANDING_STEM = 4.4;
export const LANDING_GROUND = heightAt(LANDING_XZ.x, LANDING_XZ.z);

/** Ключевые моменты действия. */
export const T = {
  arrive: 2.3,
  approach0: 3.3,
  approach1: 3.85,
  sniff0: 3.85,
  sniff1: 4.62,
  twitch1: 4.72,
  twitch2: 4.86,
  pre1: 4.95,
  pre2: 5.4,
  pre3: 5.95,
  sneeze: 6.7,
  launch: 6.76,
  land: 9.3,
  landBloom: 9.38,
};
