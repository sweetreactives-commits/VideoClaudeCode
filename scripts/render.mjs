// Покадровый рендер фильма в mp4.
//   node scripts/render.mjs [--w 1920] [--q final|draft] [--workers 2] [--shots s01,s03] [--out out/apchkhi.mp4] [--no-encode]
// Возобновляемый: готовые кадры в frames/<w>-<q>/ пропускаются. Работа делится по кадрам раскадровки
// (шотам) между воркерами — у каждого свой headless Chromium. Перед запуском: npm run build.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serveDist, launch, openFilm, dataUrlToBuffer } from './browser.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const W = Number(opt('w', '1920'));
const Hh = Math.round((W * 9) / 16);
const Q = opt('q', 'final');
const WORKERS = Number(opt('workers', '2'));
const ONLY = opt('shots', '') ? opt('shots', '').split(',') : null;
const OUT = opt('out', `out/apchkhi-${W}${Q === 'draft' ? '-draft' : ''}.mp4`);
const DIR = opt('frames', `frames/${W}-${Q}`);
fs.mkdirSync(DIR, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const frameFile = (f) => path.join(DIR, `f${String(f).padStart(5, '0')}.png`);

const server = await serveDist();
const port = server.address().port;

// Узнаём таймлайн у самой страницы — единственный источник правды.
const probe = await launch();
const meta = await (async () => {
  const page = await openFilm(probe, port, `mode=render&w=64&h=36&q=draft`);
  return page.evaluate('({ fps: window.__film.fps, frames: window.__film.frameCount, shots: window.__film.shots })');
})();
await probe.close();

const chunks = meta.shots
  .filter((s) => !ONLY || ONLY.includes(s.id))
  .map((s) => {
    const frames = [];
    for (let f = Math.round(s.start * meta.fps); f < Math.min(meta.frames, Math.round(s.end * meta.fps)); f++) {
      if (!fs.existsSync(frameFile(f))) frames.push(f);
    }
    return { id: s.id, frames };
  })
  .filter((c) => c.frames.length > 0);

const total = chunks.reduce((n, c) => n + c.frames.length, 0);
console.log(`Рендер ${W}×${Hh} (${Q}), осталось кадров: ${total}, воркеров: ${WORKERS}`);
const started = Date.now();
let done = 0;

async function worker(id) {
  if (chunks.length === 0) return;
  const browser = await launch();
  try {
    const page = await openFilm(browser, port, `mode=render&w=${W}&h=${Hh}&q=${Q}`);
    while (chunks.length) {
      const chunk = chunks.shift();
      for (const f of chunk.frames) {
        const t0 = Date.now();
        const url = await page.evaluate((fr) => window.__film.renderFrame(fr, 'image/png'), f);
        const tmp = frameFile(f) + '.tmp';
        fs.writeFileSync(tmp, dataUrlToBuffer(url));
        fs.renameSync(tmp, frameFile(f));
        done++;
        const el = (Date.now() - started) / 1000;
        const eta = (el / done) * (total - done);
        console.log(
          `[w${id}] ${chunk.id} кадр ${f} — ${((Date.now() - t0) / 1000).toFixed(1)} с · ${done}/${total} · осталось ~${Math.round(eta / 60)} мин`,
        );
      }
    }
  } finally {
    await browser.close();
  }
}

await Promise.all(Array.from({ length: Math.max(1, WORKERS) }, (_, i) => worker(i + 1)));
server.close();

const missing = [];
for (let f = 0; f < meta.frames; f++) if (!fs.existsSync(frameFile(f))) missing.push(f);
if (missing.length) {
  console.log(`Не хватает кадров: ${missing.length} (первый ${missing[0]}). Перезапустите — рендер продолжится.`);
  process.exit(ONLY ? 0 : 2);
}
if (has('no-encode')) process.exit(0);

console.log('Склейка ffmpeg…');
const r = spawnSync(
  'ffmpeg',
  [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(meta.fps),
    '-i', path.join(DIR, 'f%05d.png'),
    '-c:v', 'libx264', '-preset', Q === 'draft' ? 'fast' : 'slow', '-crf', Q === 'draft' ? '22' : '16',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    OUT,
  ],
  { stdio: 'inherit' },
);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Готово: ${OUT}`);
