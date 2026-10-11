// Набор эмоций Бумса. Все поля числовые, чтобы позы лица плавно интерполировались.

export type Face = {
  /** Кромки верхних век (рад): 0.6 норм, 0.85 широко, −1.4 закрыто. */
  upL: number;
  upR: number;
  /** Кромка нижних век: −1.0 расслаблено, −0.3 прищур. */
  low: number;
  /** Наклон век: > 0 тревога, < 0 злость/зажмур. */
  tilt: number;
  lookX: number;
  lookY: number;
  pupil: number;
  browL: number;
  browR: number;
  /** > 0 — внутренние концы бровей вверх (тревога). */
  browTilt: number;
  mW: number;
  mOpen: number;
  mSmile: number;
  mRound: number;
  mSkew: number;
  noseFlare: number;
  cheekPuff: number;
  blush: number;
};

export const NEUTRAL: Face = {
  upL: 0.55, upR: 0.55, low: -0.95, tilt: 0, lookX: 0, lookY: 0, pupil: 1,
  browL: 0, browR: 0, browTilt: 0,
  mW: 0.8, mOpen: 0.0, mSmile: 0.3, mRound: 0.4, mSkew: 0,
  noseFlare: 0, cheekPuff: 0, blush: 0.35,
};

const f = (o: Partial<Face>): Face => ({ ...NEUTRAL, ...o });

export const FACES = {
  neutral: NEUTRAL,
  /** Гордый, рвётся в бой. */
  proud: f({ upL: 0.62, upR: 0.62, low: -0.7, browL: 0.35, browR: 0.35, browTilt: -0.1, mW: 1.05, mOpen: 0.28, mSmile: 0.95, mRound: 0.85, blush: 0.5 }),
  /** Блаженный нюх: глаза закрыты, улыбка. */
  bliss: f({ upL: -1.38, upR: -1.38, low: -0.45, browL: 0.55, browR: 0.55, browTilt: 0.35, mW: 0.7, mOpen: 0.0, mSmile: 1.0, mRound: 0.5, noseFlare: 0.7, blush: 0.65, lookY: 0.2 }),
  /** «Ой…» — нос задёргался. */
  worry: f({ upL: 0.8, upR: 0.8, low: -1.15, pupil: 0.62, browL: 0.75, browR: 0.75, browTilt: 0.65, tilt: 0.12, mW: 0.42, mOpen: 0.22, mSmile: -0.35, mRound: 1, noseFlare: 0.3, blush: 0.45, lookX: 0, lookY: -0.18 }),
  /** «а…» — первая ступень набора чиха. */
  pre1: f({ upL: 0.3, upR: 0.35, low: -0.45, pupil: 0.85, browL: 0.85, browR: 0.8, browTilt: 0.55, tilt: 0.1, mW: 0.62, mOpen: 0.35, mSmile: -0.1, mRound: 0.75, noseFlare: 0.6, blush: 0.55, lookY: 0.25 }),
  /** «а-а…» */
  pre2: f({ upL: 0.0, upR: 0.08, low: -0.22, pupil: 0.8, browL: 1.15, browR: 1.1, browTilt: 0.85, tilt: 0.08, mW: 0.9, mOpen: 0.62, mSmile: 0.05, mRound: 0.65, noseFlare: 0.85, blush: 0.7, lookY: 0.35 }),
  /** «а-а-а…» — на грани. */
  pre3: f({ upL: -0.3, upR: -0.2, low: -0.38, pupil: 0.75, browL: 1.35, browR: 1.3, browTilt: 1.0, tilt: 0.1, mW: 1.15, mOpen: 0.9, mSmile: 0.15, mRound: 0.6, noseFlare: 1.1, blush: 0.85, lookY: 0.4 }),
  /** ПЧХИ! */
  sneeze: f({ upL: -1.5, upR: -1.5, low: -0.05, tilt: -0.25, browL: -0.55, browR: -0.55, browTilt: -0.6, mW: 1.5, mOpen: 1.0, mSmile: -0.15, mRound: 0.45, noseFlare: 1.4, cheekPuff: 0.25, blush: 0.95 }),
  /** Ошарашен полётом. */
  dazed: f({ upL: 0.05, upR: 0.35, low: -0.75, tilt: 0.25, pupil: 0.55, browL: -0.1, browR: 0.3, browTilt: 0.2, mW: 0.65, mOpen: 0.18, mSmile: 0.25, mRound: 0.5, mSkew: 0.6, blush: 0.6 }),
  /** Удивление. */
  surprised: f({ upL: 0.9, upR: 0.9, low: -1.2, pupil: 0.6, browL: 1.0, browR: 1.0, browTilt: 0.2, mW: 0.5, mOpen: 0.55, mSmile: 0, mRound: 1, blush: 0.4 }),
  /** Надутые щёки: держит чих. */
  holding: f({ upL: 0.85, upR: 0.85, low: -1.1, pupil: 0.55, browL: 0.9, browR: 0.9, browTilt: 0.5, mW: 0.45, mOpen: 0, mSmile: -0.2, mRound: 0.5, noseFlare: 0.9, cheekPuff: 1, blush: 1 }),
} satisfies Record<string, Face>;
