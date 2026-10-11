import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';
import { PALETTE } from '../sets/palette';

/**
 * Мультяшный глаз: глазное яблоко с нарисованной в шейдере радужкой и зрачком,
 * блики в пространстве глазницы (не крутятся вместе со взглядом),
 * верхнее и нижнее веко-полусферы с тёмной кромкой-ресницами.
 */
export interface EyeState {
  /** Высота кромки верхнего века над центром глаза, рад (−1.4 закрыт … 0.75 широко). */
  upper: number;
  /** Высота кромки нижнего века, рад (−1.2 расслаблено … 0 прищур). */
  lower: number;
  /** Наклон век вокруг оси взгляда, рад: > 0 грусть/тревога, < 0 злость. */
  tilt: number;
  lookX: number;
  lookY: number;
  pupil: number;
}

export class Eye {
  readonly socket = new THREE.Group();
  readonly ball: THREE.Mesh;
  private upperPivot = new THREE.Group();
  private lowerPivot = new THREE.Group();
  private upperLid: THREE.Mesh;
  private lowerLid: THREE.Mesh;
  private pupilU: { value: number };
  private side: number;

  constructor(readonly radius: number, side: 1 | -1, lidMaterial: THREE.Material) {
    this.side = side;
    const r = radius;
    const ballMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.35,
      clearcoat: 0.55,
      clearcoatRoughness: 0.06,
      metalness: 0,
      envMapIntensity: 0.45,
    });
    this.pupilU = { value: 1 };
    ballMat.onBeforeCompile = (shader) => {
      shader.uniforms.uPupil = this.pupilU;
      shader.uniforms.uIris = { value: PALETTE.bumsIris };
      shader.uniforms.uIrisRim = { value: PALETTE.bumsIrisRim };
      shader.uniforms.uIrisLight = { value: PALETTE.bumsIrisLight };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEyeP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyeP = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\n${NOISE_GLSL}\nvarying vec3 vEyeP;\nuniform float uPupil;\nuniform vec3 uIris, uIrisRim, uIrisLight;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  {
    vec3 d = normalize(vEyeP);
    float a = acos(clamp(d.z, -1.0, 1.0));
    float ang = atan(d.y, d.x);
    float IR = 0.6;
    float PR = 0.27 * uPupil;
    // Белок: тёплый, к краям розовеет — Бумс аллергик, глаза слегка воспалены.
    vec3 sclera = mix(vec3(1.0, 0.985, 0.96), vec3(1.0, 0.82, 0.8), smoothstep(0.9, 1.6, a));
    // Радужка: светлое кольцо у зрачка, тёмный лимб, радиальные волокна.
    float rr = a / IR;
    float fib = vnoise3(vec3(ang * 9.0, rr * 4.0, 1.0));
    vec3 iris = mix(uIrisLight, uIris, smoothstep(0.25, 0.85, rr));
    iris *= 0.82 + 0.36 * fib;
    iris = mix(iris, uIrisRim, smoothstep(0.82, 0.98, rr));
    float aa = fwidth(a) * 1.2;
    vec3 col = mix(iris, sclera, smoothstep(IR - aa, IR + aa, a));
    col = mix(vec3(0.015, 0.01, 0.012), col, smoothstep(PR - aa, PR + aa, a));
    diffuseColor.rgb = col;
  }`,
        );
    };
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), ballMat);
    this.ball.castShadow = false;
    this.ball.receiveShadow = true;
    this.socket.add(this.ball);

    // Блики: крупный сверху-сбоку, маленький снизу. Не вращаются со взглядом.
    const glintMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.6, 2.5), toneMapped: false });
    const addGlint = (dir: THREE.Vector3, sx: number, sy: number) => {
      const g = new THREE.Mesh(new THREE.CircleGeometry(1, 20), glintMat);
      dir.normalize();
      g.position.copy(dir).multiplyScalar(r * 1.012);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      g.scale.set(sx * r, sy * r, 1);
      this.socket.add(g);
    };
    // Блики одинаковы для обоих глаз — как от одного источника света.
    addGlint(new THREE.Vector3(-0.42, 0.46, 0.78), 0.24, 0.19);
    addGlint(new THREE.Vector3(0.3, -0.32, 0.9), 0.09, 0.08);

    // Веки.
    const lr = r * 1.06;
    const lash = new THREE.MeshStandardMaterial({ color: PALETTE.bumsChoc, roughness: 0.6 });
    this.upperLid = new THREE.Mesh(new THREE.SphereGeometry(lr, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), lidMaterial);
    const upperLash = new THREE.Mesh(new THREE.TorusGeometry(lr, r * 0.09, 6, 36, Math.PI), lash);
    upperLash.rotation.x = Math.PI / 2;
    this.upperLid.add(upperLash);
    this.lowerLid = new THREE.Mesh(new THREE.SphereGeometry(lr, 40, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidMaterial);
    const lowerLash = new THREE.Mesh(new THREE.TorusGeometry(lr, r * 0.04, 6, 36, Math.PI), lash);
    lowerLash.rotation.x = Math.PI / 2;
    this.lowerLid.add(lowerLash);
    for (const m of [this.upperLid, this.lowerLid]) {
      m.castShadow = false;
      m.receiveShadow = true;
    }
    this.upperPivot.add(this.upperLid);
    this.lowerPivot.add(this.lowerLid);
    this.socket.add(this.upperPivot, this.lowerPivot);
  }

  apply(s: EyeState) {
    // Закрытие: верхнее веко опускается, нижнее поднимается навстречу, и они смыкаются чуть ниже
    // центра — закрытый глаз читается изогнутой линией ресниц. Купол при этом слегка утапливается.
    const closed = Math.min(1, Math.max(0, (0.25 - s.upper) / 1.55));
    const k = closed * closed * (3 - 2 * closed);
    this.socket.scale.set(1 - 0.04 * k, 1 - 0.04 * k, 1 - 0.22 * k);
    this.ball.rotation.set(-s.lookY, s.lookX, 0, 'YXZ');
    this.pupilU.value = s.pupil;
    const MEET = -0.3;
    const lower = s.lower + (MEET - 0.02 - s.lower) * k;
    const upper = Math.max(s.upper, lower + 0.03);
    // Кромка века на высоте e: поворот полусферы вокруг X на −e.
    this.upperLid.rotation.x = -upper;
    this.lowerLid.rotation.x = -Math.min(lower, upper - 0.03);
    // tilt > 0 — внешние уголки век опускаются (грусть/тревога), < 0 — злость.
    this.upperPivot.rotation.z = -s.tilt * this.side;
    this.lowerPivot.rotation.z = s.tilt * this.side * 0.4;
  }
}
