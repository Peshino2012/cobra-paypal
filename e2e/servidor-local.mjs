// Servidor local para desarrollo y pruebas en navegador, sin cuentas:
// sirve public/ y manda /api/* al Worker con D1 en memoria (node:sqlite),
// PayPal simulado y DolarApi simulado. Con --ia-reglas no usa IA.
//   node e2e/servidor-local.mjs   →   http://127.0.0.1:8787
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/index.js';
import { crearD1 } from '../test/d1-falsa.js';
import { crearPaypalFalso } from '../test/paypal-falso.js';

const RAIZ = fileURLToPath(new URL('../public/', import.meta.url));
const PUERTO = Number(process.env.PORT) || 8787;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

export const paypal = crearPaypalFalso();
export const env = { DB: crearD1(), SESSION_SECRET: 'local', PAYPAL_CLIENT_ID: 'local', PAYPAL_CLIENT_SECRET: 'local', APP_URL: `http://127.0.0.1:${PUERTO}`, AI: null };
// IA_FALSA=1: Whisper simulado (devuelve TEXTO_VOZ) y sin LLM (entra el parser de reglas), para probar la nota de voz.
if (process.env.IA_FALSA) {
  env.AI = {
    async run(modelo) {
      if (modelo.includes('whisper')) return { text: process.env.TEXTO_VOZ || 'Facturale a Delta Studio 500 dólares más por el mantenimiento de noviembre' };
      throw new Error('sin LLM en local');
    },
  };
} else if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
  env.STUDIO_DEBUG = '1';
  // Workers AI real por la API REST de Cloudflare (solo pedidos JSON; se usa en CI para probar Cobra Insights).
  env.AI = {
    async run(modelo, cuerpo) {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${modelo}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.success === false) throw new Error(`Workers AI ${r.status}: ${JSON.stringify(j.errors || j).slice(0, 500)}`);
      return j.result;
    },
  };
}

const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(url);
  if (u.host === 'dolarapi.com') return Response.json([{ casa: 'oficial', compra: 1405, venta: 1455 }, { casa: 'bolsa', compra: 1482, venta: 1490 }, { casa: 'blue', compra: 1480, venta: 1500 }]);
  if (u.host === 'api-m.sandbox.paypal.com') return (await paypal.fetchImpl(url, opts)) || new Response('?', { status: 404 });
  return fetchReal(url, opts);
};

// public/_headers como en Cloudflare: bloques por ruta (con * al final), y "! Nombre" saca una cabecera de un bloque anterior.
const reglas = [];
for (const linea of (await readFile(join(RAIZ, '_headers'), 'utf8')).split('\n')) {
  if (/^\S/.test(linea)) reglas.push({ patron: linea.trim(), poner: [], sacar: [] });
  const m = linea.trim().match(/^([\w-]+):\s*(.+)$/);
  if (m) reglas.at(-1).poner.push([m[1], m[2]]);
  const s = linea.trim().match(/^!\s*([\w-]+)$/);
  if (s) reglas.at(-1).sacar.push(s[1]);
}
function cabecerasDe(ruta) {
  const h = {};
  for (const r of reglas) {
    if (!(r.patron.endsWith('*') ? ruta.startsWith(r.patron.slice(0, -1)) : ruta === r.patron)) continue;
    for (const n of r.sacar) delete h[n];
    for (const [n, v] of r.poner) h[n] = v;
  }
  return h;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PUERTO}`);
  if (url.pathname.startsWith('/api/')) {
    const cuerpo = await new Promise((ok) => {
      const partes = [];
      req.on('data', (p) => partes.push(p));
      req.on('end', () => ok(Buffer.concat(partes)));
    });
    // El Worker pide cookies Secure: localmente las aceptamos igual.
    const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : cuerpo }), env);
    const h = Object.fromEntries(r.headers);
    if (h['set-cookie']) h['set-cookie'] = h['set-cookie'].replace('; Secure', '');
    res.writeHead(r.status, h).end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let ruta = decodeURIComponent(url.pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = normalize(join(RAIZ, ruta));
  if (!archivo.startsWith(RAIZ)) return res.writeHead(403).end();
  let contenido;
  try {
    contenido = await readFile(archivo);
  } catch {
    return res.writeHead(404).end('no encontrado');
  }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream', ...cabecerasDe(ruta) }).end(contenido);
}).listen(PUERTO, '127.0.0.1', () => console.log(`Cobra local en http://127.0.0.1:${PUERTO}`));
