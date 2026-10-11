// Стиллы для ревью: node scripts/stills.mjs <кадр|время с суффиксом s> ... [--w 1280] [--q draft] [--out review] [--name prefix]
// Пример: node scripts/stills.mjs 1.5s 4.2s 6.7s --w 1280 --name s02
// Лист персонажа: node scripts/stills.mjs --sheet
import fs from 'node:fs';
import path from 'node:path';
import { serveDist, launch, openFilm, dataUrlToBuffer } from './browser.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const w = Number(opt('w', '1280'));
const h = Math.round((w * 9) / 16);
const q = opt('q', 'final');
const outDir = opt('out', 'review');
const prefix = opt('name', 'still');
const sheet = flag('sheet');
fs.mkdirSync(outDir, { recursive: true });

const server = await serveDist();
const port = server.address().port;
const browser = await launch();
try {
  if (sheet) {
    const page = await openFilm(browser, port, `mode=sheet&w=960&h=540&q=${q}`);
    const t0 = Date.now();
    const url = await page.evaluate('window.__film.renderSheet()');
    const file = path.join(outDir, `${prefix === 'still' ? 'bums-sheet' : prefix}.jpg`);
    fs.writeFileSync(file, dataUrlToBuffer(url));
    console.log(`${file}  (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
  } else {
    const page = await openFilm(browser, port, `mode=render&w=${w}&h=${h}&q=${q}`);
    const fps = await page.evaluate('window.__film.fps');
    for (const a of args) {
      const frame = a.endsWith('s') ? Math.round(parseFloat(a) * fps) : Number(a);
      const t0 = Date.now();
      const url = await page.evaluate((f) => window.__film.renderFrame(f, 'image/jpeg', 0.9), frame);
      const file = path.join(outDir, `${prefix}-f${String(frame).padStart(3, '0')}.jpg`);
      fs.writeFileSync(file, dataUrlToBuffer(url));
      console.log(`${file}  t=${(frame / fps).toFixed(2)}с  (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
