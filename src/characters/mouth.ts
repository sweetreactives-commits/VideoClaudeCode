import * as THREE from 'three';
import { PALETTE } from '../sets/palette';

/**
 * Параметрический рот на поверхности тела. Формы рта (улыбка, «о», «а-а-а», чих)
 * задаются набором параметров и плавно перетекают друг в друга; геометрия
 * перестраивается только при изменении параметров.
 */
export interface MouthState {
  /** Ширина (1 — обычная). */
  w: number;
  /** Раскрытие 0…1. */
  open: number;
  /** Улыбка −1…1 (уголки вверх/вниз). */
  smile: number;
  /** Скруглённость нижней губы 0…1 (1 — «о»/«U»). */
  round: number;
  /** Асимметрия уголков −1…1. */
  skew: number;
}

export type SurfaceFn = (dir: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3;

export class Mouth {
  readonly group = new THREE.Group();
  private interior: THREE.Mesh;
  private lip: THREE.Mesh;
  private last = '';
  private T: THREE.Vector3;
  private B: THREE.Vector3;

  constructor(private center: THREE.Vector3, private surface: SurfaceFn, private scale = 1) {
    this.center = center.clone().normalize();
    this.T = new THREE.Vector3(0, 1, 0).cross(this.center).normalize();
    this.B = this.center.clone().cross(this.T).normalize();

    const interiorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    interiorMat.onBeforeCompile = (shader) => {
      shader.uniforms.uMouth = { value: PALETTE.bumsMouth };
      shader.uniforms.uTongue = { value: PALETTE.bumsTongue };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aM;\nvarying vec2 vM;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvM = aM;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vM;\nuniform vec3 uMouth, uTongue;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  {
    // Глубина рта: темнее к верху; язык — эллипс внизу.
    vec3 col = uMouth * mix(0.35, 1.0, smoothstep(1.0, 0.2, vM.y));
    float tg = length((vM - vec2(0.0, 0.12)) / vec2(0.62, 0.42));
    float tongue = 1.0 - smoothstep(0.85, 1.0, tg);
    vec3 tcol = uTongue * (0.75 + 0.25 * smoothstep(0.0, 0.4, vM.y));
    tcol *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.06, abs(vM.x)));
    col = mix(col, tcol, tongue);
    diffuseColor.rgb = col;
  }`,
        );
    };
    this.interior = new THREE.Mesh(new THREE.BufferGeometry(), interiorMat);
    this.interior.receiveShadow = true;
    this.lip = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: PALETTE.bumsChoc.clone().lerp(PALETTE.bumsMouth, 0.35), roughness: 0.5 }),
    );
    this.group.add(this.interior, this.lip);
  }

  private outline(s: MouthState): THREE.Vector2[] {
    const W = 0.36 * s.w * this.scale;
    const cornerY = (s.smile * 0.075) * this.scale;
    const skew = s.skew * 0.04 * this.scale;
    const L = new THREE.Vector2(-W / 2, cornerY - skew);
    const R = new THREE.Vector2(W / 2, cornerY + skew);
    // Верхняя губа: почти прямая, при раскрытии выгибается вверх.
    const upY = (s.open * 0.07 - s.smile * 0.012) * this.scale;
    // Нижняя губа: глубина = раскрытие + улыбка.
    const loY = -(0.018 + s.open * 0.3 + Math.max(0, s.smile) * 0.07) * this.scale;
    const k = 0.35 + 0.6 * s.round;
    const pts: THREE.Vector2[] = [];
    const N = 22;
    const cubic = (p0: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2, p3: THREE.Vector2, t: number) => {
      const u = 1 - t;
      return new THREE.Vector2(
        u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      );
    };
    // Верх: слева направо.
    const u1 = new THREE.Vector2(-W * 0.25, upY + cornerY * 0.2);
    const u2 = new THREE.Vector2(W * 0.25, upY + cornerY * 0.2);
    for (let i = 0; i <= N; i++) pts.push(cubic(L, u1, u2, R, i / N));
    // Низ: справа налево.
    const l1 = new THREE.Vector2(W * 0.5 * k, loY);
    const l2 = new THREE.Vector2(-W * 0.5 * k, loY);
    for (let i = 1; i < N; i++) pts.push(cubic(R, l1, l2, L, i / N));
    return pts;
  }

  private wrap(p: THREE.Vector2, lift: number, out: THREE.Vector3): THREE.Vector3 {
    const dir = new THREE.Vector3().copy(this.center).addScaledVector(this.T, p.x).addScaledVector(this.B, p.y).normalize();
    this.surface(dir, out);
    return out.addScaledVector(dir, lift);
  }

  apply(s: MouthState) {
    const key = [s.w, s.open, s.smile, s.round, s.skew].map((v) => v.toFixed(3)).join(',');
    if (key === this.last) return;
    this.last = key;
    const pts = this.outline(s);

    // Внутренность рта.
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    let minY = Infinity, maxY = -Infinity, maxX = 0;
    for (const p of pts) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      maxX = Math.max(maxX, Math.abs(p.x));
    }
    const pos = new Float32Array(pts.length * 3);
    const am = new Float32Array(pts.length * 2);
    const v = new THREE.Vector3();
    pts.forEach((p, i) => {
      this.wrap(p, 0.006, v);
      pos.set([v.x, v.y, v.z], i * 3);
      am.set([p.x / Math.max(1e-4, maxX), (p.y - minY) / Math.max(1e-4, maxY - minY)], i * 2);
    });
    const idx: number[] = [];
    for (const t of tris) idx.push(t[0], t[1], t[2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aM', new THREE.BufferAttribute(am, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Нормали всех вершин — наружу от центра рта (рот плоский на поверхности).
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, this.center.x, this.center.y, this.center.z);
    this.interior.geometry.dispose();
    this.interior.geometry = g;

    // Кромка губ — трубка по контуру.
    const lipPts = pts.filter((_, i) => i % 2 === 0).map((p) => this.wrap(p, 0.012, new THREE.Vector3()));
    const curve = new THREE.CatmullRomCurve3(lipPts, true, 'centripetal');
    this.lip.geometry.dispose();
    this.lip.geometry = new THREE.TubeGeometry(curve, 72, 0.022 * this.scale, 6, true);
  }
}
