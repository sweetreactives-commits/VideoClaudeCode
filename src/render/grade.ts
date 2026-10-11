import { Uniform } from 'three';
import { BlendFunction, Effect } from 'postprocessing';

// Финальный грейд: сплит-тонинг, насыщенность, контраст, виньетка и плёночное зерно.
// Зерно сидируется номером кадра, а не временем выполнения, поэтому рендер детерминирован.
const fragment = /* glsl */ `
uniform float uFrame;
uniform float uGrain;
uniform float uVignette;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uAspect;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Работаем в приблизительно перцептивном пространстве.
  vec3 c = pow(max(inputColor.rgb, 0.0), vec3(1.0 / 2.2));

  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Сплит-тонинг: холодные тени, тёплые света.
  vec3 tint = mix(uShadowTint, uHighlightTint, smoothstep(0.15, 0.85, luma));
  c = c + (tint - 0.5) * 0.12;

  // Насыщенность и мягкий S-контраст.
  luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, uSaturation);
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);

  // Виньетка (эллипс с учётом аспекта).
  vec2 d = (uv - 0.5) * vec2(uAspect, 1.0);
  float v = smoothstep(0.35, 1.05, length(d) * 1.05);
  c *= 1.0 - uVignette * v;

  // Зерно: сильнее в средних тонах, слабее в светах.
  vec2 px = uv * resolution;
  float g = hash12(px + vec2(uFrame * 17.13, uFrame * 9.71)) + hash12(px * 1.37 + uFrame * 3.1) - 1.0;
  c += g * uGrain * (1.0 - luma * 0.6);

  outputColor = vec4(pow(max(c, 0.0), vec3(2.2)), inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['uFrame', new Uniform(0)],
        ['uGrain', new Uniform(0.035)],
        ['uVignette', new Uniform(0.32)],
        ['uSaturation', new Uniform(1.14)],
        ['uContrast', new Uniform(0.3)],
        ['uShadowTint', new Uniform([0.46, 0.5, 0.55])],
        ['uHighlightTint', new Uniform([0.6, 0.52, 0.42])],
        ['uAspect', new Uniform(16 / 9)],
      ]),
    });
  }

  set frame(f: number) {
    this.uniforms.get('uFrame')!.value = f % 1000;
  }
  set aspect(a: number) {
    this.uniforms.get('uAspect')!.value = a;
  }
}
