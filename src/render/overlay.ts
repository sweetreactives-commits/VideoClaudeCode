import { SUBTITLES } from '../timeline/timeline';
import { smoothstep, outBack, clamp01 } from '../timeline/ease';

/**
 * Субтитры рисуются одной и той же функцией в превью (поверх WebGL) и в рендере
 * (в композитный кадр), поэтому выглядят одинаково.
 */
export const SUB_FONT = 'Nunito';

export function drawSubtitles(ctx: CanvasRenderingContext2D, t: number, w: number, h: number) {
  for (const s of SUBTITLES) {
    if (t < s.start - 0.01 || t > s.end + 0.01) continue;
    const fade = smoothstep(s.start, s.start + 0.08, t) * (1 - smoothstep(s.end - 0.1, s.end, t));
    if (fade <= 0) continue;
    const pop = s.loud ? outBack(2.6)(clamp01((t - s.start) / 0.22)) : 1;
    const size = Math.round((s.loud ? 0.085 : 0.05) * h * (0.7 + 0.3 * pop));
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = `${s.loud ? 900 : 800} ${size}px ${SUB_FONT}, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const x = w / 2;
    const y = h * (s.loud ? 0.88 : 0.9);
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(30, 14, 4, 0.45)';
    ctx.shadowBlur = h * 0.012;
    ctx.shadowOffsetY = h * 0.004;
    ctx.strokeStyle = 'rgba(52, 26, 10, 0.92)';
    ctx.lineWidth = Math.max(2, size * 0.16);
    ctx.strokeText(s.text, x, y);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = s.loud ? '#ffe27a' : '#fff8ea';
    ctx.fillText(s.text, x, y);
    ctx.restore();
  }
}
