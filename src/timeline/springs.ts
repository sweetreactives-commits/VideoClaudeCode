import * as THREE from 'three';

/**
 * Детерминированная пружинная физика для вторичной анимации (антенны, ножки, хохолок).
 *
 * Симуляция всегда считается от t=0 фиксированным шагом DT, поэтому состояние в момент t
 * не зависит от FPS и от того, в каком порядке запрашивались кадры. Кэш позволяет при
 * последовательном проигрывании досчитывать только новые шаги; при перемотке назад
 * симуляция пересчитывается с нуля (это дёшево: несколько тысяч шагов).
 */
export interface SpringPointSpec {
  /** Жёсткость пружины к точке покоя (1/с²). */
  k: number;
  /** Демпфирование (1/с). */
  c: number;
  /** Если задано, точка удерживается на этой дистанции от базы (стебель антенны). */
  length?: number;
}

export type SpringTargets = (t: number, rest: THREE.Vector3[], base: THREE.Vector3[]) => void;

const DT = 1 / 240;

export class SpringRig {
  private n: number;
  private p: THREE.Vector3[];
  private v: THREE.Vector3[];
  private step = -1;
  private rest: THREE.Vector3[];
  private base: THREE.Vector3[];
  private tmpP: THREE.Vector3[];
  private tmpV: THREE.Vector3[];
  readonly out: THREE.Vector3[];

  constructor(private specs: SpringPointSpec[], private targets: SpringTargets) {
    this.n = specs.length;
    const mk = () => specs.map(() => new THREE.Vector3());
    this.p = mk();
    this.v = mk();
    this.rest = mk();
    this.base = mk();
    this.tmpP = mk();
    this.tmpV = mk();
    this.out = mk();
  }

  private reset() {
    this.targets(0, this.rest, this.base);
    for (let i = 0; i < this.n; i++) {
      this.p[i].copy(this.rest[i]);
      this.v[i].set(0, 0, 0);
    }
    this.step = 0;
  }

  private advance(p: THREE.Vector3[], v: THREE.Vector3[], k: number) {
    // Шаг из состояния k в k+1 (полунеявный Эйлер).
    const tNext = (k + 1) * DT;
    this.targets(tNext, this.rest, this.base);
    for (let i = 0; i < this.n; i++) {
      const s = this.specs[i];
      const ax = s.k * (this.rest[i].x - p[i].x) - s.c * v[i].x;
      const ay = s.k * (this.rest[i].y - p[i].y) - s.c * v[i].y;
      const az = s.k * (this.rest[i].z - p[i].z) - s.c * v[i].z;
      v[i].x += ax * DT;
      v[i].y += ay * DT;
      v[i].z += az * DT;
      p[i].x += v[i].x * DT;
      p[i].y += v[i].y * DT;
      p[i].z += v[i].z * DT;
      if (s.length !== undefined) {
        // Нерастяжимый стебель: проецируем точку на сферу вокруг базы и гасим радиальную скорость.
        const b = this.base[i];
        const dx = p[i].x - b.x, dy = p[i].y - b.y, dz = p[i].z - b.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        const nx = dx / d, ny = dy / d, nz = dz / d;
        p[i].set(b.x + nx * s.length, b.y + ny * s.length, b.z + nz * s.length);
        const vr = v[i].x * nx + v[i].y * ny + v[i].z * nz;
        v[i].x -= vr * nx;
        v[i].y -= vr * ny;
        v[i].z -= vr * nz;
      }
    }
  }

  /** Сбросить кэш (нужно, если сменилась сама функция позы — например, в листе персонажа). */
  invalidate() {
    this.step = -1;
  }

  /** Позиции точек в момент t (мировые координаты). */
  sample(t: number): THREE.Vector3[] {
    const target = Math.max(0, Math.floor(t / DT + 1e-9));
    if (this.step < 0 || target < this.step) this.reset();
    while (this.step < target) {
      this.advance(this.p, this.v, this.step);
      this.step++;
    }
    const frac = t / DT - target;
    if (frac <= 1e-9) {
      for (let i = 0; i < this.n; i++) this.out[i].copy(this.p[i]);
      return this.out;
    }
    for (let i = 0; i < this.n; i++) {
      this.tmpP[i].copy(this.p[i]);
      this.tmpV[i].copy(this.v[i]);
    }
    this.advance(this.tmpP, this.tmpV, this.step);
    for (let i = 0; i < this.n; i++) this.out[i].lerpVectors(this.p[i], this.tmpP[i], frac);
    return this.out;
  }
}
