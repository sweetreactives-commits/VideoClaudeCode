// Общие GLSL-функции шума для материалов персонажей.
export const NOISE_GLSL = /* glsl */ `
float n_hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = n_hash13(i);
  float b = n_hash13(i + vec3(1, 0, 0));
  float c = n_hash13(i + vec3(0, 1, 0));
  float d = n_hash13(i + vec3(1, 1, 0));
  float e = n_hash13(i + vec3(0, 0, 1));
  float g = n_hash13(i + vec3(1, 0, 1));
  float h = n_hash13(i + vec3(0, 1, 1));
  float k = n_hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.07 + 17.1; a *= 0.5; }
  return s;
}
`;
