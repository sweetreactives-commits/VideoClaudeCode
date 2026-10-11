// Контактный лист: кадры видео каждые N секунд, сеткой в один jpg (для быстрого ревью тайминга).
//   node scripts/contact.mjs out/apchkhi-640-draft.mp4 review/draft-contact.jpg [--every 0.5] [--cols 5]
import { spawnSync } from 'node:child_process';

const [input, output] = process.argv.slice(2);
const opt = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : process.argv[i + 1];
};
const every = Number(opt('every', '0.5'));
const cols = Number(opt('cols', '5'));
if (!input || !output) {
  console.error('usage: node scripts/contact.mjs <video> <out.jpg> [--every 0.5] [--cols 5]');
  process.exit(1);
}
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input], { encoding: 'utf8' });
const duration = parseFloat(probe.stdout);
const count = Math.floor(duration / every);
const rows = Math.ceil(count / cols);
const r = spawnSync(
  'ffmpeg',
  [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', input,
    '-vf', `fps=1/${every},scale=384:-1,drawtext=text='%{pts\\:hms}':x=8:y=8:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.5,tile=${cols}x${rows}:padding=4:color=0x17130f`,
    '-frames:v', '1', '-q:v', '3', output,
  ],
  { stdio: 'inherit' },
);
if (r.status !== 0) {
  // Сборка ffmpeg без drawtext: повторяем без подписей времени.
  spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-vf', `fps=1/${every},scale=384:-1,tile=${cols}x${rows}:padding=4:color=0x17130f`, '-frames:v', '1', '-q:v', '3', output], { stdio: 'inherit' });
}
console.log(output);
