import * as THREE from 'three';
import { PALETTE } from './palette';

// Небо: градиент зенит → горизонт, мягкое свечение солнца и процедурные кучевые облака.
// Тот же материал рендерится в PMREM для окружения (отражения и рассеянный свет).

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const fragment = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uClouds;
varying vec3 vDir;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = h21(i), b = h21(i + vec2(1, 0)), c = h21(i + vec2(0, 1)), d = h21(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col;
  if (y >= 0.0) {
    float t1 = smoothstep(0.0, 0.18, y);
    float t2 = smoothstep(0.12, 0.75, y);
    col = mix(uHorizon, uMid, t1);
    col = mix(col, uZenith, t2);
  } else {
    col = mix(uHorizon, uGround, smoothstep(0.0, -0.25, y));
  }

  float sd = max(dot(d, uSunDir), 0.0);
  // Ореол солнца и тёплая дымка вокруг него.
  col += uSunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 64.0) * 1.2 + pow(sd, 900.0) * 18.0);
  col = mix(col, col * vec3(1.06, 0.98, 0.9), pow(sd, 3.0) * 0.5);

  // Облака: проецируем направление на «купол» и берём fbm.
  if (y > 0.0 && uClouds > 0.0) {
    vec2 uv = d.xz / (y + 0.12) * 1.3 + vec2(uTime * 0.004, 0.0);
    float n = fbm(uv * 1.1);
    float n2 = fbm(uv * 2.7 + 3.0);
    float cover = smoothstep(0.52, 0.78, n + n2 * 0.25);
    cover *= smoothstep(0.02, 0.12, y) * (1.0 - smoothstep(0.45, 0.9, y));
    float lit = 0.75 + 0.25 * smoothstep(0.4, 0.9, n2) + pow(sd, 4.0) * 0.6;
    vec3 cloudCol = mix(uHorizon * 1.02, vec3(1.0, 0.97, 0.93), 0.65) * lit;
    col = mix(col, cloudCol, cover * 0.85 * uClouds);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSkyMaterial(sunDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: PALETTE.skyZenith.clone() },
      uMid: { value: PALETTE.skyMid.clone() },
      uHorizon: { value: PALETTE.skyHorizon.clone() },
      uGround: { value: PALETTE.skyGround.clone() },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: PALETTE.sun.clone() },
      uTime: { value: 0 },
      uClouds: { value: 1 },
    },
  });
}

export function createSky(sunDir: THREE.Vector3) {
  const material = createSkyMaterial(sunDir);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3000, 64, 32), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return { mesh, material };
}

/** Карта окружения из того же неба + «земля» снизу, свёрнутая через PMREM. */
export function createEnvironment(renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3): THREE.Texture {
  const envScene = new THREE.Scene();
  const mat = createSkyMaterial(sunDir);
  mat.uniforms.uClouds.value = 0.6;
  // Солнечный диск в окружении даёт пересвеченные блики — приглушаем.
  mat.uniforms.uSunColor.value = PALETTE.sun.clone().multiplyScalar(0.25);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), mat);
  envScene.add(sky);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(90, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: PALETTE.envGround }),
  );
  ground.position.y = -6;
  envScene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.02, 0.1, 400);
  pmrem.dispose();
  return rt.texture;
}
