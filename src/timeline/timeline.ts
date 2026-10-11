// Единый таймлайн фильма. Всё в кадре — функция времени t (секунды) от этого таймлайна.

export const FPS = 30;

export interface ShotDef {
  id: string;
  /** Начало и конец кадра раскадровки в секундах. */
  start: number;
  end: number;
  title: string;
}

export interface Subtitle {
  start: number;
  end: number;
  text: string;
  /** Крупный «звуковой» субтитр. */
  loud?: boolean;
}

export const SHOTS: ShotDef[] = [
  { id: 's01', start: 0.0, end: 3.0, title: '1 · Прилёт' },
  { id: 's02', start: 3.0, end: 6.6, title: '2 · Нюх и «а-а-а…»' },
  { id: 's03', start: 6.6, end: 8.0, title: '3 · ПЧХИ!' },
  { id: 's04', start: 8.0, end: 10.0, title: '4 · Волна цветения' },
];

export const DURATION = SHOTS[SHOTS.length - 1].end;
export const FRAME_COUNT = Math.round(DURATION * FPS);

export const SUBTITLES: Subtitle[] = [
  { start: 4.85, end: 5.3, text: 'а…' },
  { start: 5.3, end: 5.85, text: 'а-а…' },
  { start: 5.85, end: 6.62, text: 'а-а-а…' },
  { start: 6.66, end: 7.75, text: 'АПЧХИ!', loud: true },
];

export function shotAt(t: number): ShotDef {
  for (const s of SHOTS) if (t < s.end) return s;
  return SHOTS[SHOTS.length - 1];
}

export function frameToTime(frame: number): number {
  return frame / FPS;
}

export function snapToFrame(t: number): number {
  return Math.round(t * FPS) / FPS;
}
