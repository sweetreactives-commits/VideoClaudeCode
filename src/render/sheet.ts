import * as THREE from 'three';
import type { Pipeline } from './pipeline';
import type { World } from '../shots/world';
import type { CameraState } from '../shots/cameras';
import type { BumblePose } from '../characters/bumble';
import { FACES, type Face } from '../characters/expressions';
import { SUB_FONT } from './overlay';

/** Лист персонажа: три вида в полный рост + крупные планы эмоций. */

const rest = { raise: 0.3, swing: 0.1, elbow: 0.35 };

function staticPose(face: Face, yaw: number, extra: Partial<BumblePose> = {}): BumblePose {
  return {
    pos: new THREE.Vector3(0, 1.75, 0),
    yaw,
    lean: 0,
    roll: 0,
    stretch: 1,
    stretchAxis: new THREE.Vector3(0, 1, 0),
    inhale: 0.2,
    wing: 0,
    wingHz: 9.5,
    face,
    armL: rest,
    armR: rest,
    legTuck: 0,
    noseTwitch: 0,
    ...extra,
  };
}

interface Cell {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pose: BumblePose;
  cam: { pos: THREE.Vector3; target: THREE.Vector3; focal: number };
}

export async function renderCharacterSheet(pipeline: Pipeline, world: World, W: number, H: number): Promise<HTMLCanvasElement> {
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f6eedc');
  bg.addColorStop(1, '#eadfc4');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const pad = Math.round(W * 0.012);
  const topH = Math.round(H * 0.56);
  const colW = Math.round((W - pad * 4) / 3);
  const center = new THREE.Vector3(0, 1.7, 0);
  const full = (az: number) => ({
    pos: new THREE.Vector3(Math.sin(az) * 8.6, 2.3, Math.cos(az) * 8.6),
    target: center.clone().add(new THREE.Vector3(0, 0.05, 0)),
    focal: 50,
  });
  const close = { pos: new THREE.Vector3(0.9, 2.05, 4.6), target: new THREE.Vector3(0.05, 1.85, 0), focal: 70 };

  const cells: Cell[] = [
    { label: 'спереди', x: pad, y: pad, w: colW, h: topH, pose: staticPose(FACES.neutral, 0), cam: full(0) },
    { label: '3/4', x: pad * 2 + colW, y: pad, w: colW, h: topH, pose: staticPose(FACES.proud, 0, { armL: { raise: 0.95, swing: -0.25, elbow: 2.0 }, armR: { raise: 0.95, swing: -0.25, elbow: 2.0 } }), cam: full(0.75) },
    { label: 'сбоку', x: pad * 3 + colW * 2, y: pad, w: colW, h: topH, pose: staticPose(FACES.neutral, 0, { wing: 0.0 }), cam: full(Math.PI / 2) },
  ];
  const emo: [string, Face][] = [
    ['гордость', FACES.proud],
    ['блаженный нюх', FACES.bliss],
    ['«а-а-а…»', FACES.pre3],
    ['ПЧХИ!', FACES.sneeze],
  ];
  const ew = Math.round((W - pad * 5) / 4);
  const eh = H - topH - pad * 3;
  emo.forEach(([label, face], i) => {
    const extra: Partial<BumblePose> =
      label === 'ПЧХИ!' ? { lean: 0.25, stretch: 0.9 } : label === '«а-а-а…»' ? { lean: -0.35, stretch: 1.12, inhale: 1.2 } : {};
    cells.push({ label, x: pad + i * (ew + pad), y: topH + pad * 2, w: ew, h: eh, pose: staticPose(face, 0.35, extra), cam: close });
  });

  for (const c of cells) {
    const pose = c.pose;
    world.bumble.setPoseFn(() => pose);
    pipeline.setSize(c.w, c.h);
    const cam: CameraState = {
      pos: c.cam.pos,
      target: c.cam.target,
      focal: c.cam.focal,
      focus: 0,
      focusRange: 10,
      bokeh: 0,
      shadowCenter: center,
      shadowSize: 6,
    };
    world.update(2.0, c.h, cam);
    pipeline.apply({ focusDistance: 0, focusRange: 10, bokehScale: 0, bloomIntensity: 0.4, exposure: 1 }, 0);
    pipeline.render();
    ctx.save();
    roundRect(ctx, c.x, c.y, c.w, c.h, pad);
    ctx.clip();
    ctx.drawImage(pipeline.canvas, c.x, c.y, c.w, c.h);
    ctx.restore();
    ctx.font = `800 ${Math.round(H * 0.028)}px ${SUB_FONT}, sans-serif`;
    ctx.fillStyle = 'rgba(60, 32, 14, 0.85)';
    ctx.fillText(c.label, c.x + pad * 1.2, c.y + pad * 2.6);
  }
  ctx.font = `900 ${Math.round(H * 0.04)}px ${SUB_FONT}, sans-serif`;
  ctx.fillStyle = 'rgba(60, 32, 14, 0.9)';
  ctx.textAlign = 'right';
  ctx.fillText('Бумс', W - pad * 2, pad * 4.2);
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
