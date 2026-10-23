// Prueba de Cobra Insights con el modelo real (Workers AI por REST): abre el tablero con los datos de ejemplo,
// le pide cosas al asistente de AG Studio y guarda capturas, turnos y tokens en e2e/out-insights/.
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node e2e/insights-ia.mjs "pedido 1" "pedido 2"
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import './servidor-local.mjs';

const OUT = new URL('./out-insights/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PEDIDOS = process.argv.slice(2).length ? process.argv.slice(2) : ['Add a bar chart with the outstanding amount by client'];

const navegador = await chromium.launch();
const page = await navegador.newPage({ viewport: { width: 1600, height: 960 } });
const consola = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !m.text().includes('*****') && consola.push(`${m.type()}: ${m.text().slice(0, 400)}`));
page.on('pageerror', (e) => consola.push(`pageerror: ${String(e).slice(0, 400)}`));
await page.goto('http://127.0.0.1:8787/insights.html?ejemplo=1');
await page.waitForFunction(() => window.__studio && window.__harness, null, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}0-inicio.png` });

const resultados = [];
for (const [i, texto] of PEDIDOS.entries()) {
  const t0 = Date.now();
  const desde = await page.evaluate(() => window.__turnos.length);
  await page.evaluate(async (t) => {
    window.__sesion ||= await window.__harness.createThread({ agentId: window.__harness.agents[0].id });
    window.__sesion.sendMessage(t);
  }, texto);
  await page.waitForFunction(() => window.__sesion.status === 'running', null, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => window.__sesion.status !== 'running', null, { timeout: 300000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const r = await page.evaluate((d) => {
    const turnos = window.__turnos.slice(d);
    const ultimo = [...window.__sesion.messages].reverse().find((m) => m.role === 'assistant');
    return {
      estado: window.__sesion.status,
      turnos: turnos.map((t) => ({ estado: t.respuesta.status, error: t.respuesta.error, usage: t.respuesta.usage, neuronas: t.respuesta.neurons, salida: t.respuesta.output.map((o) => (o.type === 'function_call' ? `→ ${o.name}(${o.arguments.slice(0, 160)})` : o.type === 'message' ? `💬 ${o.content.map((c) => c.text).join('').slice(0, 300)}` : `… ${o.type}`)) })),
      respuesta: ultimo ? JSON.stringify(ultimo).slice(0, 1500) : null,
    };
  }, desde);
  const tokens = r.turnos.reduce((a, t) => ({ entrada: a.entrada + (t.usage?.inputTokens || 0), salida: a.salida + (t.usage?.outputTokens || 0), neuronas: a.neuronas + (t.neuronas || 0) }), { entrada: 0, salida: 0, neuronas: 0 });
  resultados.push({ pedido: texto, segundos: Math.round((Date.now() - t0) / 1000), tokens, ...r });
  console.log(JSON.stringify(resultados.at(-1), null, 2));
  await page.screenshot({ path: `${OUT}${i + 1}-pedido.png` });
  // Los widgets nuevos van al final del lienzo: captura de abajo y posición de cada widget.
  await page.locator('.ag-studio-layout').evaluate((e) => e.scrollTo({ top: e.scrollHeight })).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}${i + 1}-abajo.png` });
  resultados.at(-1).layout = await page.evaluate(() => window.__studio.getState().pages[0].widgetLayout);
}
writeFileSync(`${OUT}resultados.json`, JSON.stringify({ resultados, consola }, null, 2));
console.log(consola.join('\n'));
await navegador.close();
process.exit(0);
