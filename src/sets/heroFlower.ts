import * as THREE from 'three';
import { wobble, smoothstep, bump } from '../timeline/ease';
import { rng } from '../timeline/random';
import { PALETTE } from './palette';
import { petalGeometry, leafGeometry, createCenterMaterial } from './flowers';
import { windAt, WIND_DIR } from './wind';

/**
 * Цветок-герой: крупная розовая «космея» с пушистой пыльцевой серединкой.
 * Реагирует на нюх Бумса (тянется к нему) и на чих (отлетает назад и пружинит).
 */
export interface HeroFlowerEvents {
  /** Момент чиха (головка отлетает от Бумса). */
  sneezeAt: number;
  /** Интервал вдоха-нюха. */
  sniff: [number, number];
  /** Направление «от Бумса» в мировых координатах (горизонтальное). */
  awayDir: THREE.Vector3;
}

const PETALS = 9;

export class HeroFlower {
  readonly group = new THREE.Group();
  readonly head = new THREE.Group();
  private stem: THREE.Mesh;
  private petals: THREE.Mesh[] = [];
  private petalLift: number[] = [];
  private petalPhi: number[] = [];
  private stemMat: THREE.MeshStandardMaterial;
  private restUp: THREE.Vector3;
  readonly base: THREE.Vector3;
  readonly height: number;
  /** Мировая позиция центра серединки (обновляется в update). */
  readonly centerWorld = new THREE.Vector3();

  constructor(base: THREE.Vector3, height: number, restUp: THREE.Vector3, petalMaterial: THREE.Material, private ev: HeroFlowerEvents) {
    this.base = base.clone();
    this.height = height;
    this.restUp = restUp.clone().normalize();

    this.stemMat = new THREE.MeshStandardMaterial({ color: PALETTE.stem, roughness: 0.5 });
    this.stem = new THREE.Mesh(new THREE.BufferGeometry(), this.stemMat);
    this.stem.castShadow = true;
    this.stem.receiveShadow = true;
    this.group.add(this.stem);

    // Листья у основания стебля.
    const leafMat = new THREE.MeshStandardMaterial({ color: PALETTE.leaf, roughness: 0.55, side: THREE.DoubleSide });
    const lg = leafGeometry();
    for (let k = 0; k < 3; k++) {
      const leaf = new THREE.Mesh(lg, leafMat);
      leaf.position.set(this.base.x, this.base.y + 1.2 + k * 1.6, this.base.z);
      leaf.rotation.set(-0.9 - k * 0.15, k * 2.3 + 0.6, 0, 'YXZ');
      leaf.scale.setScalar(3.2 - k * 0.5).multiply(new THREE.Vector3(1, 1, 1.5));
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      this.group.add(leaf);
    }

    // Головка.
    this.group.add(this.head);
    const sepal = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.7, 1),
      new THREE.MeshStandardMaterial({ color: PALETTE.leaf, roughness: 0.55 }),
    );
    sepal.castShadow = true;
    this.head.add(sepal);

    const pg = petalGeometry(10, 14, 0.26, 1);
    const r = rng(777);
    for (let k = 0; k < PETALS; k++) {
      const mat = (petalMaterial as THREE.MeshPhysicalMaterial).clone();
      mat.color.copy(PALETTE.petalPink).lerp(PALETTE.petalMagenta, 0.15 + r() * 0.2);
      mat.onBeforeCompile = (petalMaterial as THREE.MeshPhysicalMaterial).onBeforeCompile;
      const p = new THREE.Mesh(pg, mat);
      p.castShadow = true;
      p.receiveShadow = true;
      this.petals.push(p);
      this.petalLift.push(0.18 + (r() - 0.5) * 0.12);
      this.petalPhi.push((k / PETALS) * Math.PI * 2 + (r() - 0.5) * 0.15);
      this.head.add(p);
    }

    const centerMat = createCenterMaterial();
    centerMat.color.copy(PALETTE.flowerCenter);
    const center = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), centerMat);
    center.scale.set(0.95, 0.5, 0.95);
    center.castShadow = true;
    center.receiveShadow = true;
    this.head.add(center);

    // Пыльцевые зёрна на серединке.
    const grainCount = 760;
    const grains = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: PALETTE.pollen, roughness: 0.6, emissive: PALETTE.pollen, emissiveIntensity: 0.12 }),
      grainCount,
    );
    const gm = new THREE.Matrix4();
    const gp = new THREE.Vector3();
    const gq = new THREE.Quaternion();
    const gs = new THREE.Vector3();
    for (let i = 0; i < grainCount; i++) {
      // Спираль Фибоначчи по куполу.
      const k = (i + 0.5) / grainCount;
      const rr = Math.sqrt(k) * 0.9;
      const a = i * 2.39996;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const y = Math.sqrt(Math.max(0, 1 - (rr / 0.95) ** 2)) * 0.5;
      gp.set(x * 0.95 / 0.9 * 0.97, y + 0.02, z * 0.95 / 0.9 * 0.97);
      const sz = 0.026 + r() * 0.018;
      gm.compose(gp, gq, gs.set(sz, sz, sz));
      grains.setMatrixAt(i, gm);
    }
    grains.castShadow = false;
    this.head.add(grains);

    // Тычинки по краю серединки.
    const stamenMat = new THREE.MeshStandardMaterial({ color: '#f7e08a', roughness: 0.5 });
    const knobMat = new THREE.MeshStandardMaterial({ color: '#f5b52a', roughness: 0.5, emissive: '#f5b52a', emissiveIntensity: 0.1 });
    const stalk = new THREE.CylinderGeometry(0.011, 0.015, 1, 5).translate(0, 0.5, 0);
    const knob = new THREE.SphereGeometry(0.035, 8, 6);
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2 + r() * 0.2;
      const s = new THREE.Mesh(stalk, stamenMat);
      s.position.set(Math.cos(a) * 0.62, 0.22, Math.sin(a) * 0.62);
      s.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
      const len = 0.24 + r() * 0.14;
      s.scale.set(1, len, 1);
      const kn = new THREE.Mesh(knob, knobMat);
      kn.position.set(0, 1, 0);
      kn.scale.set(1, 1 / len, 1);
      s.add(kn);
      this.head.add(s);
    }
  }

  /** Отклонение головки (рад) от покоя в момент t. */
  private headBend(t: number): { away: number; toward: number } {
    const e = this.ev;
    const sniff = bump(e.sniff[0], e.sniff[1] + 0.25, t, 0.4);
    const blast = t >= e.sneezeAt ? 0.62 * wobble(t - e.sneezeAt + 0.06, 1.25, 2.6) + 0.1 * Math.exp(-(t - e.sneezeAt) * 1.2) : 0;
    return { away: blast, toward: sniff * 0.12 };
  }

  /** Положение верха стебля и ось головки в момент t (чистая математика, без геометрии). */
  headAt(t: number, tip: THREE.Vector3, up: THREE.Vector3) {
    const bend = this.headBend(t);
    const away = this.ev.awayDir;
    up.copy(this.restUp);
    const w = windAt(this.base.x, this.base.z, t) * 0.45;
    up.x += WIND_DIR.x * w * 1.2;
    up.z += WIND_DIR.z * w * 1.2;
    up.addScaledVector(away, bend.away * 1.4 - bend.toward);
    up.normalize();
    tip.copy(this.base);
    tip.y += this.height;
    tip.addScaledVector(away, bend.away * this.height * 0.28 - bend.toward * this.height * 0.08);
    tip.x += WIND_DIR.x * w * this.height * 0.6 + this.restUp.x * this.height * 0.35;
    tip.z += WIND_DIR.z * w * this.height * 0.6 + this.restUp.z * this.height * 0.35;
  }

  /** Центр серединки в момент t. */
  centerAt(t: number, out = new THREE.Vector3()) {
    const up = new THREE.Vector3();
    this.headAt(t, out, up);
    return out.addScaledVector(up, 0.45);
  }

  update(t: number) {
    const e = this.ev;
    const tip = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.headAt(t, tip, up);

    // Стебель: плавная кривая от основания к головке, касательная у верха = up.
    const p0 = this.base.clone();
    const p1 = this.base.clone().add(new THREE.Vector3(0, this.height * 0.45, 0));
    const p2 = tip.clone().addScaledVector(up, -this.height * 0.3);
    const curve = new THREE.CubicBezierCurve3(p0, p1, p2, tip);
    this.stem.geometry.dispose();
    this.stem.geometry = new THREE.TubeGeometry(curve, 40, 0.16, 10, false);

    this.head.position.copy(tip);
    this.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    // Поворот вокруг собственной оси, чтобы лепестки не стояли «по сетке».
    this.head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4));
    this.head.scale.setScalar(1.0);

    // Лепестки: покой + трепет от чиха бегущей волной.
    const tb = t - e.sneezeAt;
    for (let k = 0; k < PETALS; k++) {
      const p = this.petals[k];
      const flap = tb > 0 ? 0.55 * wobble(tb - k * 0.012, 3.1, 3.2) * (1 + 0.4 * Math.sin(k * 2.1)) : 0;
      const sniffRipple = smoothstep(e.sniff[0], e.sniff[1], t) * (1 - smoothstep(e.sniff[1], e.sniff[1] + 0.4, t)) * Math.sin(t * 9 + k) * 0.05;
      const lift = this.petalLift[k] + flap + sniffRipple;
      p.rotation.set(0, 0, 0);
      p.position.set(0, 0.05, 0);
      p.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.petalPhi[k]);
      p.translateZ(0.62);
      p.rotateX(-lift);
      p.scale.set(1.05, 1.75, 2.05);
    }
    this.head.updateMatrixWorld(true);
    this.centerWorld.set(0, 0.45, 0).applyMatrix4(this.head.matrixWorld);
  }
}
