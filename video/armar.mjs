// Junta el video grabado con la narración (cada escena en su segundo) y la nota de voz → out/cobra-demo.mp4,
// sacando los tramos de espera de los agentes (cortes), más una hoja de contacto (out/hoja.png) para revisarlo.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname;
const { marcas, vozInicio, duracionTotal, cortes = [] } = JSON.parse(readFileSync(`${OUT}marcas.json`, 'utf8'));

// Segundo del video final que corresponde a un segundo de la grabación.
const enFinal = (t) => t - cortes.reduce((s, c) => s + Math.max(0, Math.min(t, c.hasta) - c.desde), 0);
const duracionFinal = enFinal(duracionTotal);
const tramos = [];
let desde = 0;
for (const c of [...cortes].sort((a, b) => a.desde - b.desde)) {
  tramos.push([desde, c.desde]);
  desde = c.hasta;
}
tramos.push([desde, duracionTotal]);

const args = ['-y', '-loglevel', 'error', '-i', `${OUT}video.webm`];
const filtros = tramos.map(([a, b], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
filtros.push(`${tramos.map((_, i) => `[v${i}]`).join('')}concat=n=${tramos.length}:v=1:a=0[v]`);
const pistas = [];
const sumar = (archivo, segundos, volumen = 1) => {
  args.push('-i', archivo);
  const k = pistas.length + 1;
  const ms = Math.max(0, Math.round(segundos * 1000));
  filtros.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${volumen},adelay=${ms}|${ms}[a${k}]`);
  pistas.push(`[a${k}]`);
};
for (const m of marcas) if (existsSync(`${OUT}${m.id}.mp3`)) sumar(`${OUT}${m.id}.mp3`, enFinal(m.t) + 0.25);
if (vozInicio != null) sumar(`${OUT}voz.wav`, enFinal(vozInicio) + 0.3, 0.8);
filtros.push(`${pistas.join('')}amix=inputs=${pistas.length}:normalize=0:dropout_transition=0[a]`);
args.push(
  '-filter_complex', filtros.join(';'),
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '160k', '-t', duracionFinal.toFixed(2), '-movflags', '+faststart',
  `${OUT}cobra-demo.mp4`,
);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}cobra-demo.mp4`, '-vf', 'fps=1/5,scale=384:-1,tile=6x6', '-frames:v', '1', `${OUT}hoja.png`], { stdio: 'inherit' });
console.log(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'default=nw=1', `${OUT}cobra-demo.mp4`]).toString());
