// Стиллы для ревью из уже отрендеренных кадров (без повторного рендера):
//   node scripts/review.mjs [--frames frames/1920-final] [--out review]
// Набор кадров — по 2–4 ключевых момента на каждый кадр раскадровки.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const opt = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : process.argv[i + 1];
};
const DIR = opt('frames', 'frames/1920-final');
const OUT = opt('out', 'review');
fs.mkdirSync(OUT, { recursive: true });

const PICKS = {
  s01: [30, 66, 84],
  s02: [100, 129, 165, 193],
  s03: [200, 205, 216],
  s04: [240, 268, 292],
};

for (const [shot, frames] of Object.entries(PICKS)) {
  for (const f of frames) {
    const src = path.join(DIR, `f${String(f).padStart(5, '0')}.png`);
    if (!fs.existsSync(src)) {
      console.log(`нет кадра ${src}`);
      continue;
    }
    const dst = path.join(OUT, `${shot}-f${String(f).padStart(3, '0')}.jpg`);
    const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-q:v', '3', dst], { stdio: 'inherit' });
    if (r.status === 0) console.log(dst);
  }
}
