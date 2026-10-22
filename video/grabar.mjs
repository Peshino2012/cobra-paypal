// Graba el video de demo contra la app publicada (PayPal sandbox y Workers AI reales), escena por escena,
// esperando en cada una lo que dura su narración. Deja out/video.webm y out/marcas.json (segundo de inicio de cada escena
// y los tramos que se cortan mientras los agentes de Insights trabajan, avisados en pantalla).
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
      Object.assign(r.style, { position: 'fixed', left: '50%', top: '76px', pointerEvents: 'none', transform: 'translateX(-50%)', width: 'max-content', maxWidth: '86vw', padding: '10px 18px', borderRadius: '12px', background: 'rgba(11,59,46,.94)', color: '#fff', font: '600 18px/1.35 Inter,system-ui,sans-serif', zIndex: 99999, boxShadow: '0 8px 30px rgba(0,0,0,.25)', textAlign: 'center' });
      document.body.append(r);
    }
    r.textContent = t;
    r.hidden = !t;
  }, texto || '');
}

/* ---------- Cortes: lo que no aporta (esperas de los agentes, página trabada) se saca del video ---------- */

const cortes = [];
let finNarracion = 0;
/**
 * Espera a que la página vuelva a dibujar. En el runner de Actions, AG Studio puede trabar la página varios
 * segundos (sin GPU): durante ese tiempo el video queda congelado y lo que hace el script se ve tarde.
 */
const asentar = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
/** Espera a que el asistente de AG Studio termine. */
async function esperarAgente(maxSegundos = 240) {
  await page.waitForFunction(() => !document.querySelector('.ag-studio-ai-status-bar-stop')?.classList.contains('ag-hidden'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('.ag-studio-ai-status-bar-stop')?.classList.contains('ag-hidden'), null, { timeout: maxSegundos * 1000, polling: 250 });
}
/** Corta desde que terminó la narración de la escena hasta ahora (si vale la pena); devuelve los segundos cortados. */
function cortarEspera() {
  const desde = finNarracion + 0.4;
  const hasta = ahora() - 0.4;
  if (hasta - desde < 1.5) return 0;
  cortes.push({ desde, hasta });
  return hasta - desde;
}
const avisoCorte = (seg) => (seg ? `⏩ ${Math.round(seg)} s of agent work skipped · ` : '');

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
  intro: () => tarjeta(`<h1>Cobra <span>🐍💸</span></h1><p>The AI collections agent for freelancers paid with PayPal.</p><span class="chip">PayPal Invoicing v2 + Webhooks</span><span class="chip">Workers AI: Llama 3.3 + Whisper</span><span class="chip">AG Studio</span>`),
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
  // La carga del tablero va en PREPARAR (se corta del video).
  insights: () => rotulo(),
  async insightsAgente() {
    await page.locator('.ag-studio-ai-prompt-starter', { hasText: 'Chase the most overdue' }).click();
    await esperarAgente();
    // La tarjeta del borrador aparece cerrada: se abre para que se vean el asunto, el mensaje y el botón.
    if (!(await page.locator('.cobra-borrador textarea').last().isVisible().catch(() => false))) {
      await page.getByText('Payment reminder draft').last().click().catch(() => {});
    }
    await asentar();
    const cortado = cortarEspera();
    if (cortado) await rotulo(avisoCorte(cortado) + rotuloActual);
    await esperar(2500);
  },
  async insightsGrafico() {
    const widgets = () => page.evaluate(() => Object.keys(window.__studio.getState().pages[0].widgets).length);
    const lienzo = page.locator('.ag-studio-layout');
    const antes = await widgets();
    const alto = await lienzo.evaluate((e) => e.scrollHeight);
    const caja = page.getByRole('textbox', { name: 'Message input' });
    await caja.click();
    await caja.pressSequentially('Add a bar chart of the collected amount by client', { delay: 28 });
    await page.getByRole('button', { name: 'Send message' }).click();
    await esperarAgente();
    // Studio pone los widgets nuevos al final del lienzo: se espera a que el gráfico esté dibujado antes de bajar.
    await page.waitForFunction((n) => Object.keys(window.__studio.getState().pages[0].widgets).length > n, antes, { timeout: 30000 }).catch(() => errores.push('Insights: los agentes de Studio no agregaron el gráfico'));
    await page.waitForFunction((h) => document.querySelector('.ag-studio-layout').scrollHeight > h, alto, { timeout: 30000 }).catch(() => errores.push('Insights: el gráfico nuevo no apareció en el lienzo'));
    await esperar(1500);
    await asentar();
    const cortado = cortarEspera();
    await rotulo(`${avisoCorte(cortado)}chart added by AG Studio’s agents`);
    await lienzo.evaluate((e) => e.scrollTo({ top: e.scrollHeight, behavior: 'smooth' }));
    await esperar(4000);
  },
  cierre: () => {},
};

// Lo que se hace antes de que arranque la escena (y su narración): cargar páginas pesadas. Ese tiempo se corta.
const PREPARAR = {
  async insights() {
    await page.goto(`${URL_APP}insights.html?ejemplo=1`);
    await page.waitForFunction(() => window.__studio && window.__harness, null, { timeout: 60000 });
    await page.locator('.cobra-marcador').first().waitFor({ timeout: 30000 }).catch(() => {});
    await esperar(1500);
  },
  cierre: () => tarjeta(`<h1>Cobra <span>🐍💸</span></h1><p>Bill in one sentence. Let the agent do the chasing.</p><span class="chip">PayPal Invoicing v2</span><span class="chip">PayPal Webhooks (verified)</span><span class="chip">AG Studio + Studio Agent Framework</span><span class="chip">Llama 3.3 · Whisper · gpt-oss on Workers AI</span><span class="chip">Cloudflare Workers + D1</span><p style="margin-top:28px;font-size:20px;opacity:.75">Live demo: cobra.peshino2012.workers.dev · Code: github.com/Peshino2012/cobra-paypal</p>`),
};

const marcas = [];
for (const e of ESCENAS) {
  const previo = ahora();
  if (PREPARAR[e.id]) await PREPARAR[e.id]();
  await asentar();
  if (ahora() - previo > 1.2) cortes.push({ desde: previo + 0.2, hasta: ahora() - 0.2 });
  const inicio = ahora();
  marcas.push({ id: e.id, t: inicio });
  rotuloActual = e.rotulo || '';
  finNarracion = inicio + (DUR[e.id] || 0) + 0.6;
  if (['enviar', 'vozNota', 'vozBorrador', 'recordatorio', 'pagado', 'tablero', 'insightsAgente', 'insightsGrafico'].includes(e.id)) await rotulo();
  await Promise.all([ACCIONES[e.id](), esperar((DUR[e.id] || 0) * 1000 + 600)]);
  console.log(`${e.id}: ${inicio.toFixed(1)}–${ahora().toFixed(1)} s`);
}
await esperar(1200);
const duracionTotal = ahora();
const ruta = await page.video().path();
await ctx.close();
await navegador.close();
renameSync(ruta, `${OUT}video.webm`);
writeFileSync(`${OUT}marcas.json`, JSON.stringify({ marcas, vozInicio: datos.vozInicio, duracionTotal, cortes, errores }, null, 2));
const final = duracionTotal - [...cortes].sort((a, b) => a.desde - b.desde).reduce((s, c, i, v) => s + c.hasta - Math.max(c.desde, i ? Math.min(c.hasta, v[i - 1].hasta) : c.desde), 0);
console.log(JSON.stringify({ duracionTotal, final, cortes, errores, facturas: [datos.n1, datos.n2] }));
if (final > 178) throw new Error(`El video dura ${final.toFixed(0)} s: tiene que durar menos de 3 minutos`);
