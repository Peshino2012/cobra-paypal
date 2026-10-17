// Graba el video de demo contra la app publicada (PayPal sandbox y Workers AI reales), escena por escena,
// esperando en cada una lo que dura su narración. Deja out/video.webm y out/marcas.json (segundo de inicio de cada escena).
//   node video/grabar.mjs https://cobra.peshino2012.workers.dev
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { ESCENAS } from './escenas.mjs';

const URL_APP = (process.argv[2] || 'https://cobra.peshino2012.workers.dev').replace(/\/$/, '') + '/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(`${OUT}crudo`, { recursive: true });
const DUR = JSON.parse(readFileSync(`${OUT}duraciones.json`, 'utf8'));
const TAM = { width: 1280, height: 720 };

const navegador = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${OUT}voz.wav%noloop`],
});
const ctx = await navegador.newContext({ viewport: TAM, locale: 'en-US', colorScheme: 'light', permissions: ['microphone'], recordVideo: { dir: `${OUT}crudo`, size: TAM } });
const page = await ctx.newPage();
const t0 = Date.now();
const ahora = () => (Date.now() - t0) / 1000;
const esperar = (ms) => page.waitForTimeout(ms);
const errores = [];
page.on('pageerror', (e) => errores.push(`${page.url()} ${e.stack || e}`));

/* ---------- Tarjetas de título y subtítulos ---------- */

const ESTILO_TARJETA = `
  body{margin:0;height:100vh;display:grid;place-items:center;background:#0b3b2e;color:#fff;font:400 26px/1.45 Inter,system-ui,sans-serif}
  .c{max-width:980px;padding:0 60px} h1{font-size:76px;margin:0 0 12px;letter-spacing:-.02em} h1 span{color:#3ccf8e}
  p{margin:0 0 14px;opacity:.92} .chip{display:inline-block;margin:18px 10px 0 0;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.12);font-size:20px}
  li{margin:10px 0} ul{padding-left:28px}`;
// Cada tarjeta es un documento nuevo (así no quedan corriendo los temporizadores de la app).
const tarjeta = (html) => page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><style>${ESTILO_TARJETA}</style><div class="c">${html}</div>`)}`);

let rotuloActual = '';
async function rotulo(texto = rotuloActual) {
  await page.evaluate((t) => {
    let r = document.getElementById('rotulo-demo');
    if (!r) {
      r = document.createElement('div');
      r.id = 'rotulo-demo';
      Object.assign(r.style, { position: 'fixed', left: '50%', top: '76px', pointerEvents: 'none', transform: 'translateX(-50%)', maxWidth: '86%', padding: '10px 18px', borderRadius: '12px', background: 'rgba(11,59,46,.94)', color: '#fff', font: '600 18px/1.35 Inter,system-ui,sans-serif', zIndex: 99999, boxShadow: '0 8px 30px rgba(0,0,0,.25)', textAlign: 'center' });
      document.body.append(r);
    }
    r.textContent = t;
    r.hidden = !t;
  }, texto || '');
}

/* ---------- Acciones sobre la app ---------- */

const ultimoAsistente = () => page.locator('.msj.assistant').last();
async function abrirApp() {
  await page.goto(URL_APP);
  await page.getByRole('textbox', { name: 'Message' }).waitFor({ timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('.msj').first().waitFor();
  await rotulo();
}
async function escribir(texto) {
  const caja = page.getByRole('textbox', { name: 'Message' });
  await caja.click();
  await caja.pressSequentially(texto, { delay: 28 });
  await esperar(300);
  const antes = await page.locator('.msj.assistant').count();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForFunction((n) => document.querySelectorAll('.msj.assistant').length > n && !document.querySelector('.msj.assistant:last-child')?.textContent.includes('Thinking'), antes, { timeout: 60000 });
}
/** Espera un mensaje nuevo que diga `texto` (los anteriores no cuentan). */
async function esperarNuevo(texto, accion) {
  const antes = await page.getByText(texto).count();
  await accion();
  await page.waitForFunction(([fuente, flags, n]) => {
    const re = new RegExp(fuente, flags);
    return [...document.querySelectorAll('.msj.assistant')].filter((m) => re.test(m.textContent)).length > n;
  }, [texto.source, texto.flags, antes], { timeout: 60000 });
}
async function crearYEnviar() {
  const email = ultimoAsistente().getByLabel('Client email');
  if (!(await email.inputValue())) throw new Error('El borrador quedó sin email: la narración dice que Cobra lo completa');
  await esperarNuevo(/was sent to/, () => ultimoAsistente().getByRole('button', { name: /Create & send/ }).click());
  return (await ultimoAsistente().textContent()).match(/#(\d+)/)?.[1];
}

const datos = {};
const ACCIONES = {
  intro: () => tarjeta(`<h1>Cobra <span>🐍💸</span></h1><p>The AI collections agent for freelancers paid with PayPal.</p><span class="chip">PayPal Invoicing v2 + Webhooks</span><span class="chip">Workers AI: Llama 3.3 + Whisper</span>`),
  problema: () => tarjeta(`<h1>Getting paid is the hard part</h1><ul><li>Invoices are tedious, often done on a phone between tasks.</li><li>Chasing late payers is awkward, so invoices sit unpaid.</li><li>Local rules are invisible to global tools: Argentina’s <b>monotributo</b> income cap, measured in pesos.</li></ul>`),
  async chat() {
    await abrirApp();
    await escribir('Invoice Delta Studio 1,200 USD for the landing page redesign, due in 15 days, billing@example.com');
    await ultimoAsistente().getByRole('button', { name: /Create & send/ }).waitFor();
  },
  async enviar() {
    datos.n1 = await crearYEnviar();
    datos.urlPago = await ultimoAsistente().getByRole('link', { name: 'Open payment page' }).getAttribute('href').catch(() => null);
    await esperar(1200);
    await ultimoAsistente().getByRole('button', { name: 'QR' }).click();
    await esperar(3500);
    await page.getByRole('button', { name: 'Close' }).click();
    // La página de PayPal se abre acá y la escena siguiente arranca recién cuando la factura ya se ve
    // (si no, la narración "this is the real invoice" cae sobre la pantalla de carga).
    if (!datos.urlPago) return;
    await esperar(800);
    await page.goto(datos.urlPago, { timeout: 30000 }).catch(() => {});
    await page.getByText(/1,200\.00/).first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.getByRole('button', { name: /accept/i }).first().click({ timeout: 3000 }).catch(() => {});
  },
  async paypal() {
    if (!datos.urlPago) return;
    await rotulo().catch(() => {});
    await esperar(3000);
  },
  async voz() {
    await abrirApp();
  },
  async vozNota() {
    datos.asistentesAntes = await page.locator('.msj.assistant').count();
    datos.vozInicio = ahora();
    await page.getByRole('button', { name: 'Record a voice note' }).click();
    await esperar(DUR.notaDeVoz * 1000 + 700);
    await page.getByRole('button', { name: 'Record a voice note' }).click();
  },
  async vozBorrador() {
    await page.waitForFunction((n) => document.querySelectorAll('.msj.assistant').length > n && document.querySelector('.msj.assistant:last-child button'), datos.asistentesAntes, { timeout: 60000 });
    await esperar(3000);
    datos.n2 = await crearYEnviar();
  },
  async recordatorio() {
    await escribir('Send Delta Studio a friendly reminder');
    await ultimoAsistente().getByRole('button', { name: 'Send reminder' }).waitFor();
    await esperar(4500);
    await esperarNuevo(/Reminder sent to/, () => ultimoAsistente().getByRole('button', { name: 'Send reminder' }).click());
  },
  async pagado() {
    await escribir(`Delta Studio paid invoice #${datos.n2 || datos.n1} by bank transfer`);
    await ultimoAsistente().getByRole('button', { name: 'Mark as paid' }).waitFor();
    await esperar(1500);
    await esperarNuevo(/marked as paid/, () => ultimoAsistente().getByRole('button', { name: 'Mark as paid' }).click());
  },
  async tablero() {
    await page.evaluate(() => {
      const t = document.querySelector('.tablero');
      t.style.outline = '4px solid #3ccf8e';
      t.style.outlineOffset = '6px';
      t.style.borderRadius = '16px';
    });
  },
  async consulta() {
    await page.evaluate(() => (document.querySelector('.tablero').style.outline = 'none'));
    await escribir('Who owes me money?');
  },
  cierre: () => tarjeta(`<h1>Cobra <span>🐍💸</span></h1><p>Bill in one sentence. Let the agent do the chasing.</p><span class="chip">PayPal Invoicing v2</span><span class="chip">PayPal Webhooks (verified)</span><span class="chip">Llama 3.3 · Whisper on Workers AI</span><span class="chip">Cloudflare Workers + D1</span><p style="margin-top:28px;font-size:20px;opacity:.75">Live demo: cobra.peshino2012.workers.dev · Code: github.com/Peshino2012/cobra-paypal</p>`),
};

const marcas = [];
for (const e of ESCENAS) {
  const inicio = ahora();
  marcas.push({ id: e.id, t: inicio });
  rotuloActual = e.rotulo || '';
  if (['enviar', 'vozNota', 'vozBorrador', 'recordatorio', 'pagado', 'tablero', 'consulta'].includes(e.id)) await rotulo();
  await Promise.all([ACCIONES[e.id](), esperar((DUR[e.id] || 0) * 1000 + 600)]);
  console.log(`${e.id}: ${inicio.toFixed(1)}–${ahora().toFixed(1)} s`);
}
await esperar(1200);
const duracionTotal = ahora();
const ruta = await page.video().path();
await ctx.close();
await navegador.close();
renameSync(ruta, `${OUT}video.webm`);
writeFileSync(`${OUT}marcas.json`, JSON.stringify({ marcas, vozInicio: datos.vozInicio, duracionTotal, errores }, null, 2));
console.log(JSON.stringify({ duracionTotal, errores, facturas: [datos.n1, datos.n2] }));
if (duracionTotal > 178) throw new Error(`El video dura ${duracionTotal.toFixed(0)} s: tiene que durar menos de 3 minutos`);
