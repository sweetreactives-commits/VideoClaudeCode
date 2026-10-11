import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import { Pipeline } from './render/pipeline';
import { drawSubtitles, SUB_FONT } from './render/overlay';
import { renderCharacterSheet } from './render/sheet';
import { World } from './shots/world';
import { FPS, DURATION, FRAME_COUNT, SHOTS, shotAt } from './timeline/timeline';

/**
 * Точка входа. Режимы (?mode=):
 *  player — превью с плеером (по умолчанию);
 *  render — без интерфейса, кадры отдаются через window.__film.renderFrame (Puppeteer);
 *  sheet  — лист персонажа.
 * ?q=draft — облегчённое качество; ?w= / ?h= — разрешение.
 */
const params = new URLSearchParams(location.search);
const mode = (params.get('mode') ?? 'player') as 'player' | 'render' | 'sheet';
const quality = params.get('q') === 'draft' ? 'draft' : 'final';
let W = Number(params.get('w') ?? (mode === 'player' ? 1280 : 1920));
let H = Number(params.get('h') ?? Math.round((W * 9) / 16));

const canvas = document.createElement('canvas');
canvas.id = 'gl';
const overlay = document.createElement('canvas');
overlay.id = 'overlay';
const stage = document.getElementById('stage')!;
stage.append(canvas, overlay);
if (mode !== 'player') document.body.classList.add('bare');

const world0 = { world: null as World | null };
const fontsReady = Promise.all([
  document.fonts.load(`800 40px ${SUB_FONT}`, 'Ааа'),
  document.fonts.load(`900 40px ${SUB_FONT}`, 'АПЧХИ'),
]).then(() => document.fonts.ready);

// Сцену строим после первой отрисовки страницы, чтобы плеер не «висел» пустым.
const pipelineHolder: { p: Pipeline | null } = { p: null };

function setSize(w: number, h: number) {
  W = w;
  H = h;
  overlay.width = w;
  overlay.height = h;
  pipelineHolder.p?.setSize(w, h);
}

function renderAt(t: number) {
  const world = world0.world!;
  const p = pipelineHolder.p!;
  const frame = Math.round(t * FPS);
  const t0 = performance.now();
  const cam = world.update(t, H);
  const t1 = performance.now();
  p.apply({ focusDistance: cam.focus, focusRange: cam.focusRange, bokehScale: cam.bokeh, bloomIntensity: 0.55, exposure: 1.0 }, frame);
  p.render();
  const gl = p.renderer.getContext();
  if (debug) {
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    log(`frame ${frame}: update ${(t1 - t0).toFixed(0)}ms, render ${(performance.now() - t1).toFixed(0)}ms, programs ${p.renderer.info.programs?.length}`);
  }
  const octx = overlay.getContext('2d')!;
  octx.clearRect(0, 0, W, H);
  drawSubtitles(octx, t, W, H);
}

const composite = document.createElement('canvas');

/** Кадр целиком (3D + субтитры) как dataURL. */
function captureFrame(frame: number, type = 'image/png', q?: number): string {
  const t = frame / FPS;
  renderAt(t);
  composite.width = W;
  composite.height = H;
  const ctx = composite.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, W, H);
  drawSubtitles(ctx, t, W, H);
  return composite.toDataURL(type, q);
}

const debug = params.has('debug');
const log = (msg: string) => {
  if (debug) console.log(`[film ${(performance.now() / 1000).toFixed(1)}s] ${msg}`);
};

const ready = (async () => {
  await fontsReady;
  log('fonts');
  await new Promise((r) => setTimeout(r, 0));
  const pipeline = new Pipeline(canvas, W, H);
  log('renderer');
  const world = new World(pipeline.renderer, { quality, characterOnly: mode === 'sheet' });
  log('world built');
  pipeline.attach(world.scene, world.camera);
  log('pipeline attached');
  pipelineHolder.p = pipeline;
  world0.world = world;
  setSize(W, H);
})();

declare global {
  interface Window {
    __film: {
      ready: Promise<void>;
      fps: number;
      frameCount: number;
      duration: number;
      shots: typeof SHOTS;
      setSize(w: number, h: number): void;
      renderFrame(frame: number, type?: string, quality?: number): Promise<string>;
      renderSheet(): Promise<string>;
    };
  }
}

window.__film = {
  ready,
  fps: FPS,
  frameCount: FRAME_COUNT,
  duration: DURATION,
  shots: SHOTS,
  setSize,
  async renderFrame(frame, type, q) {
    await ready;
    return captureFrame(frame, type, q);
  },
  async renderSheet() {
    await ready;
    const sheet = await renderCharacterSheet(pipelineHolder.p!, world0.world!, 1920, 1080);
    return sheet.toDataURL('image/jpeg', 0.92);
  },
};

if (mode === 'player') {
  ready.then(() => setupPlayer());
} else if (mode === 'sheet') {
  ready.then(async () => {
    const url = await window.__film.renderSheet();
    const img = new Image();
    img.src = url;
    img.style.width = '100%';
    stage.replaceChildren(img);
  });
}

// ─── Плеер ────────────────────────────────────────────────────────────────────

function setupPlayer() {
  const ui = document.getElementById('ui')!;
  ui.hidden = false;
  const play = document.getElementById('play') as HTMLButtonElement;
  const scrub = document.getElementById('scrub') as HTMLInputElement;
  const time = document.getElementById('time')!;
  const shotsBox = document.getElementById('shots')!;
  const res = document.getElementById('res') as HTMLSelectElement;
  const post = document.getElementById('post') as HTMLInputElement;
  scrub.max = String(FRAME_COUNT - 1);

  let frame = Number(params.get('f') ?? 0);
  let playing = false;
  let last = 0;
  let acc = 0;

  const draw = () => {
    renderAt(frame / FPS);
    scrub.value = String(frame);
    const t = frame / FPS;
    time.textContent = `${t.toFixed(2)} с · кадр ${frame} · ${shotAt(t).title}`;
    for (const b of shotsBox.querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === shotAt(t).id);
  };

  for (const s of SHOTS) {
    const b = document.createElement('button');
    b.textContent = s.title;
    b.dataset.id = s.id;
    b.onclick = () => {
      frame = Math.round(s.start * FPS);
      draw();
    };
    shotsBox.append(b);
  }

  play.onclick = () => {
    playing = !playing;
    play.textContent = playing ? '❚❚' : '▶';
    last = performance.now();
    acc = 0;
    if (playing) requestAnimationFrame(tick);
  };
  scrub.oninput = () => {
    frame = Number(scrub.value);
    draw();
  };
  res.onchange = () => {
    const w = Number(res.value);
    setSize(w, Math.round((w * 9) / 16));
    draw();
  };
  post.onchange = () => {
    pipelineHolder.p!.postEnabled = post.checked;
    draw();
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') play.click();
    if (e.code === 'ArrowRight') { frame = Math.min(FRAME_COUNT - 1, frame + 1); draw(); }
    if (e.code === 'ArrowLeft') { frame = Math.max(0, frame - 1); draw(); }
  });

  // Реальное время выбирает только КАКОЙ кадр показать; содержимое кадра — функция номера кадра.
  function tick(now: number) {
    if (!playing) return;
    acc += (now - last) / 1000;
    last = now;
    const step = Math.floor(acc * FPS);
    if (step > 0) {
      acc -= step / FPS;
      frame = (frame + step) % FRAME_COUNT;
      draw();
    }
    requestAnimationFrame(tick);
  }
  draw();
}
