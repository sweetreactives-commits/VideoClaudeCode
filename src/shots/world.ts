import * as THREE from 'three';
import { PALETTE } from '../sets/palette';
import { createSky, createEnvironment } from '../sets/sky';
import { createGround, heightAt } from '../sets/terrain';
import { createGrass, createGrassMaterial, defaultGrassRects } from '../sets/grass';
import { FlowerField, createPetalMaterial, type FlowerSpec, type FlowerKind } from '../sets/flowers';
import { HeroFlower } from '../sets/heroFlower';
import { createStones } from '../sets/stones';
import { createBackdrop } from '../sets/backdrop';
import { Bumble, dirFrom, surfacePoint } from '../characters/bumble';
import { rng } from '../timeline/random';
import { SHOTS } from '../timeline/timeline';
import { HERO_BASE, HERO_HEIGHT, HERO_UP, H, FACE_DIR, BACK_DIR, T } from './layout';
import { poseAt, flightSamples, LANDING_SPEC } from './action';
import { cameraAt, type CameraState } from './cameras';
import { FilmEffects } from './effects';

export const SUN_DIR = new THREE.Vector3(0.33, 0.53, -0.78).normalize();

export interface WorldOptions {
  quality: 'final' | 'draft';
  /** Только персонаж на нейтральном фоне (лист персонажа). */
  characterOnly?: boolean;
}

/** Отрезки «камера → цель» по всем кадрам: в них не должно быть цветов и высокой травы. */
function cameraCorridors(): { a: THREE.Vector3; b: THREE.Vector3 }[] {
  const out: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
  for (const s of SHOTS) {
    for (let k = 0; k <= 6; k++) {
      const t = s.start + (s.end - s.start - 0.001) * (k / 6);
      const c = cameraAt(t);
      out.push({ a: c.pos.clone(), b: c.target.clone() });
      // Плюс луч до самого Бумса, чтобы его не загораживало.
      out.push({ a: c.pos.clone(), b: poseAt(t).pos.clone() });
    }
  }
  return out;
}

function distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, maxFrac = 1): number {
  const ab = b.clone().sub(a);
  const k = Math.max(0, Math.min(maxFrac, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, k));
}

function scatterFlowers(corridors: { a: THREE.Vector3; b: THREE.Vector3 }[]): FlowerSpec[] {
  const r = rng(20261011);
  const specs: FlowerSpec[] = [];
  const kinds: FlowerKind[] = ['cosmos', 'cosmos', 'cosmos', 'daisy', 'daisy', 'buttercup', 'buttercup'];
  const palettes: Record<FlowerKind, THREE.Color[]> = {
    cosmos: [PALETTE.petalPink, PALETTE.petalMagenta, PALETTE.petalWhite, PALETTE.petalLilac, PALETTE.petalPink],
    daisy: [PALETTE.petalWhite],
    buttercup: [PALETTE.petalButter, PALETTE.petalCoral, PALETTE.petalButter],
  };
  const path = flightSamples(90);
  const pathPts = path.map((s) => s.p);
  const keepOut = [H, ...pathPts, poseAt(2.5).pos, poseAt(4.5).pos];
  let guard = 0;
  while (specs.length < 430 && guard++ < 20000) {
    const x = -58 + r() * 82;
    const z = -42 + r() * 66;
    if (Math.hypot(x - HERO_BASE.x, z - HERO_BASE.z) < 3.6) continue;
    if (Math.hypot(x - LANDING_SPEC.x, z - LANDING_SPEC.z) < 3.2) continue;
    if (specs.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < 2.2 * 2.2)) continue;
    const stemH = 2.4 + r() * r() * 5.2;
    const y = heightAt(x, z);
    const head = new THREE.Vector3(x, y + stemH, z);
    if (keepOut.some((p) => p.distanceTo(head) < 2.6)) continue;
    if (corridors.some((c) => distToSegment(head, c.a, c.b, 0.92) < 2.0)) continue;
    const kind = kinds[Math.floor(r() * kinds.length)];
    const pal = palettes[kind];
    const color = pal[Math.floor(r() * pal.length)].clone().offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.05);
    const center = kind === 'daisy' ? PALETTE.petalButter.clone().lerp(PALETTE.flowerCenter, 0.5) : PALETTE.flowerCenter.clone();
    specs.push({
      x, y, z, kind, stemH,
      scale: 1.0 + r() * 0.75,
      color, center,
      leanDir: r() * Math.PI * 2,
      leanAmt: r() * 0.16,
      openAt: r() < 0.45 ? -Infinity : Infinity,
      seed: Math.floor(r() * 100000),
    });
  }

  // Волна цветения: бутоны под траекторией раскрываются вслед за Бумсом.
  for (const s of specs) {
    if (s.openAt !== Infinity) continue;
    let best = Infinity;
    let bestT = 0;
    for (const sm of path) {
      const d = Math.hypot(sm.p.x - s.x, sm.p.z - s.z);
      if (d < best) {
        best = d;
        bestT = sm.t;
      }
    }
    if (best < 12) s.openAt = bestT + 0.2 + best * 0.06 + r() * 0.12;
    // Облако чиха над цветком-героем: соседние бутоны раскрываются первыми.
    const dh = Math.hypot(s.x - H.x, s.z - H.z);
    if (dh < 9) s.openAt = Math.min(s.openAt, T.sneeze + 0.35 + dh * 0.09 + r() * 0.1);
  }
  specs.push(LANDING_SPEC);
  return specs;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 4000);
  readonly bumble: Bumble;
  readonly hero?: HeroFlower;
  readonly flowers?: FlowerField;
  readonly effects?: FilmEffects;
  private sun: THREE.DirectionalLight;
  private key: THREE.DirectionalLight;
  private rim: THREE.DirectionalLight;
  private grassMats: THREE.MeshStandardMaterial[] = [];
  private skyMat?: THREE.ShaderMaterial;
  readonly fog: THREE.Fog;
  lastCam?: CameraState;

  constructor(renderer: THREE.WebGLRenderer, readonly opts: WorldOptions) {
    const scene = this.scene;
    this.fog = new THREE.Fog(PALETTE.fog, 85, 560);
    scene.fog = this.fog;
    scene.background = PALETTE.skyHorizon.clone();
    scene.environment = createEnvironment(renderer, SUN_DIR);
    scene.environmentIntensity = 0.7;

    // Свет: солнце-контровой (с тенями), тёплый ключевой со стороны камеры, холодный кант, небо/земля.
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    this.key = new THREE.DirectionalLight('#fff0dc', 1.35);
    scene.add(this.key, this.key.target);
    this.rim = new THREE.DirectionalLight('#cfe4ff', 0.9);
    scene.add(this.rim, this.rim.target);
    scene.add(new THREE.HemisphereLight(PALETTE.skyMid, PALETTE.grassMid, 0.55));

    const sky = createSky(SUN_DIR);
    this.skyMat = sky.material;
    scene.add(sky.mesh);

    this.bumble = new Bumble(poseAt, { shells: opts.quality === 'final' ? 5 : 3 });
    scene.add(this.bumble.root);

    if (opts.characterOnly) {
      // Студия для листа персонажа: мягкий пол, принимающий тени.
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#cfd9b0', roughness: 0.95 }),
      );
      floor.receiveShadow = true;
      scene.add(floor);
      this.fog.near = 20;
      this.fog.far = 90;
      return;
    }

    scene.add(createGround());
    scene.add(createBackdrop());
    scene.add(createStones(heightAt));

    const corridors = cameraCorridors();
    const rects = defaultGrassRects();
    const gm = createGrassMaterial();
    gm.userData.uniforms.uSunDir.value.copy(SUN_DIR);
    this.grassMats.push(gm);
    const draft = opts.quality === 'draft';
    const avoid = [{ x: HERO_BASE.x, z: HERO_BASE.z, r: 1.2 }, { x: LANDING_SPEC.x, z: LANDING_SPEC.z, r: 1.0 }];
    const near = createGrass({ count: draft ? 30000 : 80000, seed: 11, rect: rects.near, height: [1.2, 5.2], width: [0.16, 0.3], avoid }, gm);
    const mid = createGrass({ count: draft ? 15000 : 40000, seed: 12, rect: rects.mid, height: [1.5, 6.0], width: [0.3, 0.55], avoid }, gm);
    scene.add(near, mid);
    clearCorridors(near, corridors);
    clearCorridors(mid, corridors);

    const petalMat = createPetalMaterial(SUN_DIR);
    const specs = scatterFlowers(corridors);
    this.flowers = new FlowerField(specs, petalMat);
    this.flowers.stemMaterial.userData.uniforms.uSunDir.value.copy(SUN_DIR);
    this.grassMats.push(this.flowers.stemMaterial);
    scene.add(this.flowers.group);

    this.hero = new HeroFlower(HERO_BASE, HERO_HEIGHT, HERO_UP, petalMat, {
      sneezeAt: T.sneeze,
      sniff: [T.sniff0, T.sniff1],
      awayDir: FACE_DIR.clone(),
    });
    scene.add(this.hero.group);

    const noseLocal = surfacePoint(dirFrom(-0.02, 0)).multiplyScalar(1.03).add(new THREE.Vector3(0, -0.03, 0.17));
    const m = new THREE.Matrix4();
    this.effects = new FilmEffects({
      noseAt: (t) => noseLocal.clone().applyMatrix4(this.bumble.bodyWorldMatrix(poseAt(t), m)),
      heroCenterAt: (t) => this.hero!.centerAt(t),
      bloomingFlowers: specs.filter((s) => isFinite(s.openAt)),
      petalMaterial: petalMat,
    });
    scene.add(this.effects.group);
    void BACK_DIR;
  }

  update(t: number, heightPx: number, camOverride?: CameraState) {
    const cam = camOverride ?? cameraAt(t);
    this.lastCam = cam;
    this.camera.position.copy(cam.pos);
    this.camera.lookAt(cam.target);
    this.camera.filmGauge = 35;
    this.camera.setFocalLength(cam.focal);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    this.bumble.update(t);
    this.hero?.update(t);
    this.flowers?.update(t);
    for (const m of this.grassMats) m.userData.uniforms.uTime.value = t;
    if (this.skyMat) this.skyMat.uniforms.uTime.value = t;

    // Свет привязан к кадру: тени следуют за точкой интереса.
    const c = cam.shadowCenter;
    this.sun.position.copy(c).addScaledVector(SUN_DIR, 80);
    this.sun.target.position.copy(c);
    const sc = this.sun.shadow.camera;
    sc.left = -cam.shadowSize;
    sc.right = cam.shadowSize;
    sc.top = cam.shadowSize;
    sc.bottom = -cam.shadowSize;
    sc.near = 20;
    sc.far = 160;
    sc.updateProjectionMatrix();

    // Ключевой — слева-спереди от камеры, кант — сзади-слева.
    const fwd = cam.target.clone().sub(cam.pos).normalize();
    const right = fwd.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const keyDir = right.clone().multiplyScalar(-0.75).add(new THREE.Vector3(0, 0.7, 0)).addScaledVector(fwd, -0.65).normalize();
    this.key.position.copy(c).addScaledVector(keyDir, 50);
    this.key.target.position.copy(c);
    const rimDir = right.clone().multiplyScalar(-0.8).add(new THREE.Vector3(0, 0.45, 0)).addScaledVector(fwd, 0.9).normalize();
    this.rim.position.copy(c).addScaledVector(rimDir, 50);
    this.rim.target.position.copy(c);

    if (this.effects) {
      this.effects.setView(this.camera, heightPx, this.fog);
      this.effects.update(t, cam.target);
    }
    return cam;
  }
}

/** Квадрат расстояния от точки до отрезка (без аллокаций — вызывается миллионы раз). */
function segDist2(px: number, py: number, pz: number, c: Corridor, maxFrac: number): number {
  const abx = c.b.x - c.a.x, aby = c.b.y - c.a.y, abz = c.b.z - c.a.z;
  let k = ((px - c.a.x) * abx + (py - c.a.y) * aby + (pz - c.a.z) * abz) / c.len2;
  k = k < 0 ? 0 : k > maxFrac ? maxFrac : k;
  const dx = px - (c.a.x + abx * k), dy = py - (c.a.y + aby * k), dz = pz - (c.a.z + abz * k);
  return dx * dx + dy * dy + dz * dz;
}

type Corridor = { a: THREE.Vector3; b: THREE.Vector3; len2: number };

/** Убираем травинки, которые торчат в коридорах обзора у самой камеры. */
function clearCorridors(mesh: THREE.InstancedMesh, corridors: { a: THREE.Vector3; b: THREE.Vector3 }[]) {
  const cs: Corridor[] = corridors.map((c) => ({ ...c, len2: Math.max(1e-6, c.a.distanceToSquared(c.b)) }));
  const arr = mesh.instanceMatrix.array as Float32Array;
  const col = mesh.instanceColor?.array as Float32Array | undefined;
  let removed = 0;
  let i = 0;
  // Удаляем инстанс, переставляя на его место последний (порядок не важен).
  while (i < mesh.count) {
    const o = i * 16;
    const px = arr[o + 12], py = arr[o + 13], pz = arr[o + 14];
    // Ось Y инстанса (с масштабом) — вектор от основания к кончику травинки.
    const tx = px + arr[o + 4], ty = py + arr[o + 5], tz = pz + arr[o + 6];
    const mx = px + arr[o + 4] * 0.6, my = py + arr[o + 5] * 0.6, mz = pz + arr[o + 6] * 0.6;
    let hit = false;
    for (const c of cs) {
      if (segDist2(tx, ty, tz, c, 0.7) < 1.21 || segDist2(mx, my, mz, c, 0.7) < 1.0) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      i++;
      continue;
    }
    const last = mesh.count - 1;
    arr.copyWithin(o, last * 16, last * 16 + 16);
    if (col) col.copyWithin(i * 3, last * 3, last * 3 + 3);
    mesh.count--;
    removed++;
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
  return removed;
}
