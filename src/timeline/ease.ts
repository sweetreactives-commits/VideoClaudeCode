// Кривые сглаживания. Линейное движение в фильме запрещено: всё идёт через эти функции.

export type Ease = (x: number) => number;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp01((x - a) / (b - a));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
};

export const linear: Ease = (x) => x;
export const inQuad: Ease = (x) => x * x;
export const outQuad: Ease = (x) => 1 - (1 - x) * (1 - x);
export const inOutQuad: Ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
export const inCubic: Ease = (x) => x * x * x;
export const outCubic: Ease = (x) => 1 - Math.pow(1 - x, 3);
export const inOutCubic: Ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const inOutSine: Ease = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
export const outSine: Ease = (x) => Math.sin((x * Math.PI) / 2);
export const inSine: Ease = (x) => 1 - Math.cos((x * Math.PI) / 2);
export const outQuart: Ease = (x) => 1 - Math.pow(1 - x, 4);
export const inQuart: Ease = (x) => x * x * x * x;
export const outExpo: Ease = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const inExpo: Ease = (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));

export const outBack = (s = 1.70158): Ease => (x) => {
  const c3 = s + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
};
export const inBack = (s = 1.70158): Ease => (x) => (s + 1) * x * x * x - s * x * x;
export const inOutBack = (s = 1.70158): Ease => (x) => {
  const c2 = s * 1.525;
  return x < 0.5
    ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
    : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
};
export const outElastic = (period = 0.3): Ease => (x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return Math.pow(2, -10 * x) * Math.sin(((x - period / 4) * (2 * Math.PI)) / period) + 1;
};

/** Затухающее колебание после импульса: 0 в начале, амплитуда спадает. */
export function wobble(t: number, freq: number, decay: number): number {
  if (t <= 0) return 0;
  return Math.exp(-decay * t) * Math.sin(t * freq * Math.PI * 2);
}

/** Импульс-«горб» 0→1→0 на отрезке [a,b] с плавными краями. */
export function bump(a: number, b: number, x: number, edge = 0.3): number {
  const w = (b - a) * edge;
  return smoothstep(a, a + w, x) * (1 - smoothstep(b - w, b, x));
}
