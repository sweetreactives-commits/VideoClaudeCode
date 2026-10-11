import * as THREE from 'three';
import { ParticleLayer } from '../sets/particles';
import { hash1, noise1 } from '../timeline/random';
import { smoothstep, clamp01, inQuad, outCubic } from '../timeline/ease';
import { PALETTE } from '../sets/palette';
import { WIND_DIR } from '../sets/wind';
import { FlowerField, type FlowerSpec } from '../sets/flowers';
import { T, FACE_DIR, H } from './layout';
import { flightPos, landingSeat } from './action';

/**
 * Пыльца фильма. Каждая частица — функция (t, индекс): рождение, полёт с сопротивлением
 * воздуха (замкнутая формула), ветер и турбулентность через детерминированный шум.
 */

const POLLEN = PALETTE.pollen;
const DUST = new THREE.Color('#fff1cf');
const _c = new THREE.Color();

/** Позиция частицы с сопротивлением: x0 + v/k·(1−e^{−kτ}) + g·τ² + ветер·τ. */
function ballistic(out: THREE.Vector3, x0: THREE.Vector3, v: THREE.Vector3, k: number, tau: number, grav: number, wind: number) {
  const f = (1 - Math.exp(-k * tau)) / k;
  out.copy(x0).addScaledVector(v, f);
  out.y -= grav * tau * tau * 0.5;
  out.x += WIND_DIR.x * wind * tau;
  out.z += WIND_DIR.z * wind * tau;
  return out;
}

function randUnit(seed: number, out: THREE.Vector3) {
  const u = hash1(seed) * 2 - 1;
  const a = hash1(seed + 1) * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return out.set(r * Math.cos(a), u, r * Math.sin(a));
}

function lifeAlpha(tau: number, life: number, fadeIn = 0.06) {
  if (tau < 0 || tau > life) return 0;
  return smoothstep(0, fadeIn, tau) * (1 - smoothstep(life * 0.55, life, tau));
}

export interface EffectsDeps {
  /** Мировая позиция носа Бумса в момент t. */
  noseAt: (t: number) => THREE.Vector3;
  /** Центр головки цветка-героя в момент t. */
  heroCenterAt: (t: number) => THREE.Vector3;
  bloomingFlowers: FlowerSpec[];
}

export class FilmEffects {
  readonly motes = new ParticleLayer(500, { additive: true, maxPx: 10 });
  readonly pollen = new ParticleLayer(4200, { maxPx: 110 });
  readonly sparkles = new ParticleLayer(900, { additive: true, maxPx: 30 });
  readonly group = new THREE.Group();

  constructor(private deps: EffectsDeps) {
    this.group.add(this.motes.points, this.pollen.points, this.sparkles.points);
  }

  setView(camera: THREE.PerspectiveCamera, heightPx: number, fog: THREE.Fog | null) {
    this.motes.setView(camera, heightPx, fog);
    this.pollen.setView(camera, heightPx, fog);
    this.sparkles.setView(camera, heightPx, fog);
  }

  update(t: number, camTarget: THREE.Vector3) {
    const p = new THREE.Vector3();
    const v = new THREE.Vector3();
    const r = new THREE.Vector3();

    // ── Пылинки, искрящиеся в контровом свете: облако вокруг точки интереса камеры ──
    this.motes.begin();
    const box = 26;
    for (let i = 0; i < 500; i++) {
      const hx = hash1(i * 7 + 1), hy = hash1(i * 7 + 2), hz = hash1(i * 7 + 3);
      // Медленный дрейф по ветру с «заворачиванием» внутри куба вокруг цели камеры.
      let x = hx * box * 2 + WIND_DIR.x * t * 0.6 + noise1(t * 0.3 + i, 11) * 1.2;
      let z = hz * box * 2 + WIND_DIR.z * t * 0.6 + noise1(t * 0.27 + i, 12) * 1.2;
      x = ((x - camTarget.x + box) % (box * 2) + box * 2) % (box * 2) + camTarget.x - box;
      z = ((z - camTarget.z + box) % (box * 2) + box * 2) % (box * 2) + camTarget.z - box;
      const y = camTarget.y - 6 + hy * 16 + Math.sin(t * 0.7 + i) * 0.4;
      const tw = 0.55 + 0.45 * Math.sin(t * (1.5 + hash1(i * 7 + 4) * 3) + i);
      const size = 0.018 + hash1(i * 7 + 5) * 0.03;
      this.motes.push(x, y, z, size, 0.4 * tw, DUST, 1.7);
    }
    this.motes.end();

    this.pollen.begin();
    this.sparkles.begin();

    // ── Нюх: струйка пыльцы из серединки цветка в нос ──
    if (t > T.sniff0 - 0.1 && t < T.sniff1 + 0.6) {
      const N = 140;
      const nose = this.deps.noseAt(t);
      for (let i = 0; i < N; i++) {
        const birth = T.sniff0 + 0.05 + (i / N) * (T.sniff1 - T.sniff0 - 0.1);
        const life = 0.5 + hash1(i + 300) * 0.25;
        const tau = t - birth;
        if (tau < 0 || tau > life) continue;
        const k = inQuad(clamp01(tau / life));
        const start = this.deps.heroCenterAt(birth);
        randUnit(i + 310, r);
        start.addScaledVector(r, 0.55).add(new THREE.Vector3(0, 0.25, 0));
        const mid = start.clone().lerp(nose, 0.5).add(new THREE.Vector3(0, 0.5 + hash1(i + 320) * 0.4, 0));
        // Квадратичная кривая start → mid → нос, со спиральным завихрением.
        const a = start.clone().lerp(mid, k);
        const b = mid.clone().lerp(nose, k);
        p.copy(a).lerp(b, k);
        const sw = Math.sin(tau * 14 + i) * 0.12 * (1 - k);
        p.x += sw;
        p.z += Math.cos(tau * 14 + i) * 0.12 * (1 - k);
        const alpha = smoothstep(0, 0.1, tau) * (1 - smoothstep(0.85, 1, k));
        this.pollen.push(p.x, p.y, p.z, 0.028 + 0.025 * (1 - k), alpha * 0.9, POLLEN, 1.35);
      }
    }

    // ── ПЧХИ: облако из носа в сторону цветка ──
    if (t >= T.sneeze) {
      const nose = this.deps.noseAt(T.sneeze + 0.02);
      const N = 2200;
      for (let i = 0; i < N; i++) {
        const birth = T.sneeze + hash1(i + 1000) * 0.07;
        const tau = t - birth;
        const big = i % 5 === 0;
        const life = big ? 2.2 + hash1(i + 1001) * 1.5 : 1.4 + hash1(i + 1002) * 2.4;
        const al = lifeAlpha(tau, life, 0.03);
        if (al <= 0) continue;
        randUnit(i + 1003, r);
        v.copy(FACE_DIR).multiplyScalar(1).addScaledVector(r, 0.62).add(new THREE.Vector3(0, 0.1, 0)).normalize();
        const speed = 7 + hash1(i + 1004) * 15;
        v.multiplyScalar(speed);
        ballistic(p, nose, v, 3.0 + hash1(i + 1005) * 1.5, tau, 0.35, 0.7);
        // Турбулентность разрастается со временем.
        const tb = Math.min(tau, 2) * 0.55;
        p.x += noise1(tau * 1.3 + i * 0.37, 21) * tb;
        p.y += noise1(tau * 1.1 + i * 0.41, 22) * tb + tau * 0.12;
        p.z += noise1(tau * 1.2 + i * 0.29, 23) * tb;
        const grow = 1 + Math.min(tau, 1.5) * 1.2;
        const size = big ? (0.35 + hash1(i + 1006) * 0.6) * grow : (0.045 + hash1(i + 1007) * 0.06) * (1 + tau * 0.3);
        _c.copy(POLLEN).lerp(DUST, hash1(i + 1008) * 0.35);
        this.pollen.push(p.x, p.y, p.z, size, al * (big ? 0.13 : 0.95), _c, big ? 1.05 : 1.6);
      }

      // Ответный «выдох» цветка: пыльца срывается с серединки.
      const hc = this.deps.heroCenterAt(T.sneeze + 0.05);
      for (let i = 0; i < 520; i++) {
        const birth = T.sneeze + 0.03 + hash1(i + 2000) * 0.12;
        const tau = t - birth;
        const life = 1.8 + hash1(i + 2001) * 2.2;
        const al = lifeAlpha(tau, life, 0.05);
        if (al <= 0) continue;
        randUnit(i + 2002, r);
        r.y = Math.abs(r.y) * 0.8 + 0.2;
        v.copy(r).addScaledVector(FACE_DIR, 0.9).normalize().multiplyScalar(3 + hash1(i + 2003) * 6);
        ballistic(p, hc, v, 2.4, tau, 0.25, 0.9);
        const tb = Math.min(tau, 2.5) * 0.5;
        p.x += noise1(tau + i * 0.5, 31) * tb;
        p.y += noise1(tau * 0.9 + i * 0.6, 32) * tb;
        p.z += noise1(tau * 1.1 + i * 0.7, 33) * tb;
        const big = i % 4 === 0;
        const size = big ? 0.4 + tau * 0.45 : 0.03 + hash1(i + 2004) * 0.05;
        this.pollen.push(p.x, p.y, p.z, size, al * (big ? 0.1 : 0.85), POLLEN, 1.2);
      }
    }

    // ── Шлейф пыльцы за летящим Бумсом ──
    if (t > T.launch) {
      const N = 1500;
      for (let i = 0; i < N; i++) {
        const q = i / N;
        const birth = T.launch + 0.02 + (T.land - T.launch) * Math.pow(q, 1.25);
        const tau = t - birth;
        const life = 1.4 + hash1(i + 3000) * 1.6;
        const al = lifeAlpha(tau, life, 0.04);
        if (al <= 0) continue;
        const origin = flightPos(birth);
        randUnit(i + 3001, r);
        origin.addScaledVector(r, 0.55);
        v.copy(r).multiplyScalar(0.8 + hash1(i + 3002) * 1.2);
        ballistic(p, origin, v, 1.8, tau, 0.9, 0.8);
        p.y += noise1(tau + i * 0.31, 41) * 0.3 * tau;
        const density = 1 - q * 0.45;
        const big = i % 5 === 0;
        const size = big ? 0.32 + tau * 0.5 : 0.035 + hash1(i + 3003) * 0.06;
        this.pollen.push(p.x, p.y, p.z, size, al * density * (big ? 0.2 : 0.9), POLLEN, 1.25);
      }
    }

    // ── Приземление: пуф пыльцы из бутона ──
    if (t > T.land) {
      const o = landingSeat(T.land).add(new THREE.Vector3(0, -0.7, 0));
      for (let i = 0; i < 380; i++) {
        const birth = T.land + hash1(i + 4000) * 0.06;
        const tau = t - birth;
        const life = 1.0 + hash1(i + 4001) * 1.4;
        const al = lifeAlpha(tau, life, 0.03);
        if (al <= 0) continue;
        randUnit(i + 4002, r);
        r.y = Math.abs(r.y) * 0.6 + 0.15;
        v.copy(r).normalize().multiplyScalar(3 + hash1(i + 4003) * 5);
        ballistic(p, o, v, 3.2, tau, 0.6, 0.6);
        const big = i % 6 === 0;
        this.pollen.push(p.x, p.y, p.z, big ? 0.3 + tau * 0.4 : 0.06 + hash1(i + 4004) * 0.07, al * (big ? 0.2 : 0.9), POLLEN, 1.2);
      }
    }

    // ── Искорки при раскрытии цветов волной ──
    const tip = new THREE.Vector3();
    this.deps.bloomingFlowers.forEach((s, fi) => {
      if (!isFinite(s.openAt)) return;
      const tau0 = t - s.openAt;
      if (tau0 < 0 || tau0 > 1.6) return;
      FlowerField.tip(s, s.openAt, tip);
      for (let k = 0; k < 7; k++) {
        const i = fi * 7 + k;
        const tau = tau0 - hash1(i + 5000) * 0.15;
        const life = 0.9 + hash1(i + 5001) * 0.6;
        const al = lifeAlpha(tau, life, 0.04);
        if (al <= 0) continue;
        randUnit(i + 5002, r);
        r.y = Math.abs(r.y) + 0.4;
        v.copy(r).normalize().multiplyScalar((1.5 + hash1(i + 5003) * 2) * s.scale);
        ballistic(p, tip, v, 2.5, tau, -0.2, 0.4);
        this.sparkles.push(p.x, p.y, p.z, 0.07 * s.scale, al * outCubic(1 - clamp01(tau / life)), POLLEN, 3.5);
      }
    });

    this.pollen.end();
    this.sparkles.end();
  }
}

export { H };
