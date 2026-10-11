// Детерминированные источники случайности. Math.random в проекте запрещён.

/** mulberry32: быстрый PRNG с сидом. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Хеш целых координат в [0,1). */
export function hash1(n: number): number {
  let x = Math.imul((n | 0) ^ 0x27d4eb2d, 0x165667b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function hash2(x: number, y: number): number {
  return hash1((x | 0) * 73856093 ^ (y | 0) * 19349663);
}

export function hash3(x: number, y: number, z: number): number {
  return hash1((x | 0) * 73856093 ^ (y | 0) * 19349663 ^ (z | 0) * 83492791);
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Гладкий value-noise 1D в [-1,1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash2(i, seed) * 2 - 1;
  const b = hash2(i + 1, seed) * 2 - 1;
  return a + (b - a) * fade(f);
}

/** Гладкий value-noise 2D в [-1,1]. */
export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const a = hash3(ix, iy, seed);
  const b = hash3(ix + 1, iy, seed);
  const c = hash3(ix, iy + 1, seed);
  const d = hash3(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1;
}

export function fbm2(x: number, y: number, octaves = 4, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * freq, y * freq, seed + o * 17);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
