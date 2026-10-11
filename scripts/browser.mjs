// Общие помощники для захвата: статический сервер для dist/ и запуск headless Chromium
// с программным WebGL (SwiftShader). GPU в окружении нет.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].filter(Boolean);

export function chromePath() {
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('Chromium не найден: задайте CHROME_PATH');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

export function serveDist(root = 'dist', port = 0) {
  const abs = path.resolve(root);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(abs, url === '/' ? 'index.html' : url);
    if (!file.startsWith(abs)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(abs, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

export async function launch() {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    protocolTimeout: 0,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-networking',
      '--disable-component-update',
      '--no-first-run',
      '--disable-sync',
      '--disable-default-apps',
      // Chromium подмешивает шум в чтение canvas (анти-фингерпринтинг) — это ломает детерминизм кадров.
      '--disable-features=CanvasInterventions,CanvasNoise',
    ],
  });
}

/** Открывает страницу фильма и ждёт готовности сцены. */
export async function openFilm(browser, port, query) {
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') console.log(`[page ${t}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  page.setDefaultTimeout(0);
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: 'load' });
  // Опрос вместо waitForFunction: тот опрашивает через requestAnimationFrame и в headless зависает.
  while (!(await page.evaluate('!!(window.__film && window.__film.ready)'))) await new Promise((r) => setTimeout(r, 200));
  await page.evaluate('window.__film.ready');
  return page;
}

export function dataUrlToBuffer(url) {
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}
