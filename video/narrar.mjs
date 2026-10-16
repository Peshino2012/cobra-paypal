// Genera la narración (inglés) y la nota de voz (español) con los modelos de voz de Workers AI.
// Necesita CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID. Deja out/<escena>.mp3, out/voz.wav y out/duraciones.json.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ESCENAS, NOTA_DE_VOZ } from './escenas.mjs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(`${OUT}voces`, { recursive: true });
const { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: CUENTA } = process.env;
if (!TOKEN || !CUENTA) throw new Error('Faltan CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID');

async function correr(modelo, cuerpo) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CUENTA}/ai/run/${modelo}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const tipo = r.headers.get('content-type') || '';
  if (!r.ok) throw new Error(`${modelo}: ${r.status} ${await r.text()}`);
  if (tipo.startsWith('audio/') || tipo.includes('octet-stream')) return Buffer.from(await r.arrayBuffer());
  const j = await r.json();
  const audio = j?.result?.audio ?? j?.audio;
  if (!audio) throw new Error(`${modelo}: respuesta sin audio ${JSON.stringify(j).slice(0, 300)}`);
  return Buffer.from(audio, 'base64');
}

/** Aura 2 (Deepgram) y, si no está, MeloTTS. */
async function hablar(texto, idioma) {
  try {
    return await correr(`@cf/deepgram/aura-2-${idioma}`, { text: texto, ...(process.env[`VOZ_${idioma.toUpperCase()}`] ? { speaker: process.env[`VOZ_${idioma.toUpperCase()}`] } : {}) });
  } catch (e) {
    console.warn(`Aura 2 falló (${e.message}); uso MeloTTS`);
    return correr('@cf/myshell-ai/melotts', { prompt: texto, lang: idioma });
  }
}

const duracion = (archivo) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', archivo]).toString().trim());

/**
 * Las voces generadas se guardan en out/voces/<id>-<hash del texto>.mp3 (el workflow las conserva en la rama
 * demo-video), así regrabar el video no vuelve a gastar la cuota diaria de Workers AI si el texto no cambió.
 */
async function voz(id, texto, idioma, destino) {
  const clave = createHash('sha1').update(`${idioma}|${process.env[`VOZ_${idioma.toUpperCase()}`] || ''}|${texto}`).digest('hex').slice(0, 10);
  const cache = `${OUT}voces/${id}-${clave}.mp3`;
  if (!existsSync(cache)) writeFileSync(cache, await hablar(texto, idioma));
  else console.log(`${id}: voz reutilizada`);
  copyFileSync(cache, destino);
}

const duraciones = {};
for (const e of ESCENAS) {
  if (!e.narracion) continue;
  const archivo = `${OUT}${e.id}.mp3`;
  await voz(e.id, e.narracion, 'en', archivo);
  duraciones[e.id] = duracion(archivo);
  console.log(`${e.id}: ${duraciones[e.id].toFixed(1)} s`);
}
await voz('nota', NOTA_DE_VOZ, 'es', `${OUT}voz.mp3`);
// Chromium usa este WAV como micrófono falso.
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}voz.mp3`, '-ac', '1', '-ar', '48000', '-sample_fmt', 's16', `${OUT}voz.wav`]);
duraciones.notaDeVoz = duracion(`${OUT}voz.wav`);
const total = ESCENAS.reduce((s, e) => s + (duraciones[e.id] || 0), 0);
console.log(`nota de voz: ${duraciones.notaDeVoz.toFixed(1)} s · narración total: ${total.toFixed(1)} s`);
writeFileSync(`${OUT}duraciones.json`, JSON.stringify(duraciones, null, 2));
