// Recorre la app en Chromium (con PayPal simulado) y saca capturas:
//   node e2e/capturas.mjs
import { chromium } from '@playwright/test';
import { paypal } from './servidor-local.mjs';

const URL_APP = `http://127.0.0.1:${process.env.PORT || 8787}/`;
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2, locale: 'es-AR', colorScheme: 'light' });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
await page.goto(URL_APP);
await page.getByText('Soy Cobra').waitFor();

async function decir(texto) {
  await page.getByRole('textbox', { name: /Message|Mensaje/ }).fill(texto);
  await page.getByRole('button', { name: /^(Send|Enviar)$/ }).click();
  await page.locator('.msj.assistant').last().waitFor();
  await page.waitForTimeout(250);
}

await decir('Facturale 800 dólares a Acme Corp por el rediseño del logo, ap@acme.com, vence en 15 días');
await page.screenshot({ path: 'capturas/1-borrador.png' });
await page.getByRole('button', { name: /Crear y enviar/ }).click();
await page.getByText(/se envió a ap@acme.com/).waitFor();

for (const t of ['Facturale 1.200 dólares a Globex por la landing page, pay@globex.com', 'Facturale 450 dólares a Initech por el mantenimiento mensual, it@initech.com, vence en 0 días']) {
  await decir(t);
  await page.getByRole('button', { name: /Crear y enviar/ }).click();
  await page.locator('.msj.assistant').last().getByText(/se envió/).waitFor();
}
// Globex paga desde el link de PayPal; Initech queda vencida.
paypal.pagar('INV2-0002');
for (const inv of paypal.facturas.values()) if (inv.primary_recipients[0].billing_info.business_name === 'Initech') inv.detail.payment_term.due_date = '2026-10-01';
await page.getByRole('button', { name: /Sincronizar/ }).click();
await page.getByText(/Globex pagó la factura/).waitFor();
await decir('Mandale un recordatorio a Initech');
await page.screenshot({ path: 'capturas/2-recordatorio.png' });
await page.getByRole('button', { name: 'Enviar recordatorio' }).click();
await page.getByText(/Le mandé el recordatorio a Initech/).waitFor();
await decir('¿Quién me debe?');
await page.screenshot({ path: 'capturas/3-tablero.png' });

const celu = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-US', colorScheme: 'dark' });
const p2 = await celu.newPage();
await p2.goto(URL_APP);
await p2.getByText("I'm Cobra").waitFor();
await p2.getByRole('textbox', { name: 'Message' }).fill('Invoice Umbrella Corp 2,500 USD for the mobile app MVP, ap@umbrella.com, due in 30 days');
await p2.getByRole('button', { name: 'Send' }).click();
await p2.getByRole('button', { name: /Create & send/ }).waitFor();
await p2.screenshot({ path: 'capturas/4-celular.png' });
const anchoOk = await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

await navegador.close();
console.log(JSON.stringify({ errores, anchoOk }));
process.exit(errores.length || !anchoOk ? 1 : 0);
