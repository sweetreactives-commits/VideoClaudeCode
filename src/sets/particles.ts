import * as THREE from 'three';

/**
 * Слой частиц-спрайтов. Позиции пересчитываются на CPU каждый кадр как функция t,
 * поэтому никакого накопленного состояния нет.
 */
const vertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
uniform float uMaxPx;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying float vAlpha;
varying vec3 vColor;
varying float vFog;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aSize * uScale / max(0.05, -mv.z);
  float clamped = clamp(px, 0.0, uMaxPx);
  gl_PointSize = max(clamped, 1.0);
  // Крошечные частицы не мерцают: вместо субпиксельного размера гасим альфу.
  vAlpha = aAlpha * clamp(px / 1.5, 0.0, 1.0) * (px > uMaxPx ? uMaxPx / px : 1.0);
  vColor = aColor;
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
}
`;

const fragment = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
varying float vFog;
uniform vec3 uFogColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * vAlpha;
  if (a < 0.004) discard;
  vec3 col = mix(vColor, uFogColor, vFog);
  gl_FragColor = vec4(col, a);
}
`;

export class ParticleLayer {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private pos: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private color: Float32Array;
  private n = 0;

  constructor(readonly capacity: number, opts: { additive?: boolean; maxPx?: number } = {}) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uScale: { value: 500 },
        uMaxPx: { value: opts.maxPx ?? 90 },
        uFogColor: { value: new THREE.Color() },
        uFogNear: { value: 60 },
        uFogFar: { value: 400 },
      },
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  setView(camera: THREE.PerspectiveCamera, heightPx: number, fog: THREE.Fog | null) {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    if (fog) {
      this.material.uniforms.uFogColor.value.copy(fog.color);
      this.material.uniforms.uFogNear.value = fog.near;
      this.material.uniforms.uFogFar.value = fog.far;
    }
  }

  begin() {
    this.n = 0;
  }

  push(x: number, y: number, z: number, size: number, alpha: number, c: THREE.Color, intensity = 1) {
    if (this.n >= this.capacity || alpha <= 0.002) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.size[i] = size;
    this.alpha[i] = alpha;
    this.color[i * 3] = c.r * intensity;
    this.color[i * 3 + 1] = c.g * intensity;
    this.color[i * 3 + 2] = c.b * intensity;
  }

  end() {
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    for (const name of ['position', 'aSize', 'aAlpha', 'aColor']) (g.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
  }
}
