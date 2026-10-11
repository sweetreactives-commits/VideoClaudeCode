// Ветер: одна и та же функция в TS (для позиций голов цветов, частиц) и в GLSL (трава, стебли).
// Любая правка здесь должна делаться синхронно в обеих версиях.

export const WIND_DIR = { x: 0.92, z: 0.39 };

/** Смещение вершины стебля на единицу высоты в направлении ветра. */
export function windAt(x: number, z: number, t: number): number {
  const base = Math.sin(t * 1.3 + x * 0.11 + z * 0.07) * 0.55 + Math.sin(t * 2.7 + x * 0.29 - z * 0.21) * 0.22;
  const g = Math.sin(t * 0.55 - x * 0.045 - z * 0.02);
  const gust = g * g * 0.65;
  return (base + gust) * 0.07;
}

export const WIND_GLSL = /* glsl */ `
uniform float uTime;
const vec2 WIND_DIR = vec2(0.92, 0.39);
float windAt(vec2 p, float t) {
  float base = sin(t * 1.3 + p.x * 0.11 + p.y * 0.07) * 0.55 + sin(t * 2.7 + p.x * 0.29 - p.y * 0.21) * 0.22;
  float g = sin(t * 0.55 - p.x * 0.045 - p.y * 0.02);
  float gust = g * g * 0.65;
  return (base + gust) * 0.07;
}
`;
