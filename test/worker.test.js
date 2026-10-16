// El Worker completo en Node: chat → borrador → factura real (PayPal falso),
// recordatorios, pagos por webhook, cron y medidor del monotributo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { crearD1 } from './d1-falsa.js';
import { crearPaypalFalso } from './paypal-falso.js';

const BASE = 'https://cobra.test';

function crearMundo({ ai = null } = {}) {
  const pp = crearPaypalFalso();
  const env = { DB: crearD1(), SESSION_SECRET: 'secreto', PAYPAL_CLIENT_ID: 'cid', PAYPAL_CLIENT_SECRET: 'sec', APP_URL: BASE, AI: ai };
  globalThis.fetch = async (url, opts) => {
    const u = new URL(url);
    if (u.host === 'dolarapi.com') return Response.json([{ casa: 'oficial', compra: 1400, venta: 1450 }, { casa: 'bolsa', compra: 1480, venta: 1490 }]);
    if (u.host === 'api-m.sandbox.paypal.com') return (await pp.fetchImpl(url, opts)) || new Response('?', { status: 404 });
    return new Response('no', { status: 404 });
  };
  let cookie = null;
  const api = async (ruta, { metodo = 'GET', cuerpo, headers = {}, crudo } = {}) => {
    const r = await worker.fetch(
      new Request(BASE + ruta, {
        method: metodo,
        headers: { 'X-Cobra': '1', 'Accept-Language': 'es-AR', ...(cookie ? { Cookie: cookie } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: crudo ?? (cuerpo ? JSON.stringify(cuerpo) : undefined),
      }),
      env,
    );
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, datos: await r.json().catch(() => null) };
  };
  return { env, pp, api };
}

const ultimo = (r) => r.datos.mensajes.at(-1);

/** Corre el cron y espera a que termine. */
async function cron(env) {
  let promesa;
  await worker.scheduled({}, env, { waitUntil: (p) => (promesa = p) });
  await promesa;
}

test('del chat a una factura enviada por PayPal', async () => {
  const { pp, api } = crearMundo();
  const inicial = await api('/api/estado');
  assert.equal(inicial.status, 200);
  assert.equal(inicial.datos.espacio.idioma, 'es', 'idioma del navegador');

  const r = await api('/api/mensaje', { metodo: 'POST', cuerpo: { texto: 'Facturale 800 dólares a Acme Corp por el rediseño del logo, ap@acme.com, vence en 10 días' } });
  const borrador = ultimo(r).datos;
  assert.equal(borrador.tipo, 'borrador');
  assert.deepEqual(borrador.faltan, []);
  assert.equal(borrador.borrador.total, 800);
  assert.equal(pp.facturas.size, 0, 'nada se crea sin confirmar');

  const c = await api('/api/facturas', { metodo: 'POST', cuerpo: { borrador: borrador.borrador, idioma: 'es' } });
  assert.equal(c.status, 200);
  assert.equal(c.datos.factura.estado, 'SENT');
  assert.equal(c.datos.factura.numero, '0001');
  assert.equal(c.datos.factura.url_pago, 'https://www.sandbox.paypal.com/invoice/p/#INV2-0001');
  assert.match(c.datos.mensaje.texto, /se envió a ap@acme.com/);
  const creada = pp.llamadas.find((l) => l.ruta === '/v2/invoicing/invoices' && l.metodo === 'POST').cuerpo;
  assert.equal(creada.items[0].unit_amount.value, '800.00');
  assert.ok(pp.llamadas.some((l) => l.ruta === '/v2/invoicing/invoices/INV2-0001/send'));

  // Un borrador incompleto no se manda.
  const incompleto = await api('/api/facturas', { metodo: 'POST', cuerpo: { borrador: { cliente: 'X', items: [] } } });
  assert.equal(incompleto.status, 400);
});

test('recordatorio, pago por webhook y consultas', async () => {
  const { env, pp, api } = crearMundo();
  await api('/api/estado');
  const b = ultimo(await api('/api/mensaje', { metodo: 'POST', cuerpo: { texto: 'Invoice Globex 1200 USD for the landing page, pay@globex.com' } })).datos;
  await api('/api/facturas', { metodo: 'POST', cuerpo: { borrador: b.borrador } });

  const rec = ultimo(await api('/api/mensaje', { metodo: 'POST', cuerpo: { texto: 'Send a reminder to Globex' } }));
  assert.equal(rec.datos.tipo, 'recordatorio');
  assert.match(rec.datos.subject, /#0001/);
  const enviado = await api(`/api/facturas/${rec.datos.paypal_id}/recordar`, { metodo: 'POST', cuerpo: { subject: rec.datos.subject, note: rec.datos.note } });
  assert.equal(enviado.datos.factura.recordatorios, 1);
  assert.ok(pp.llamadas.some((l) => l.ruta.endsWith('/remind')));

  // El cliente paga y PayPal avisa por webhook (con firma verificada por la API de PayPal).
  await cron(env);
  assert.equal(pp.webhooks.length, 1, 'el cron registra el webhook una vez');
  pp.pagar('INV2-0001');
  const evento = { event_type: 'INVOICING.INVOICE.PAID', resource: { invoice: { id: 'INV2-0001' } } };
  const mal = await worker.fetch(new Request(`${BASE}/api/paypal/webhook`, { method: 'POST', body: JSON.stringify(evento), headers: { 'paypal-transmission-sig': 'trucha' } }), env);
  assert.equal(mal.status, 401);
  const bien = await worker.fetch(new Request(`${BASE}/api/paypal/webhook`, { method: 'POST', body: JSON.stringify(evento), headers: { 'paypal-transmission-sig': 'firma-buena' } }), env);
  assert.equal(bien.status, 200);
  const e = await api('/api/estado');
  const f = e.datos.facturas[0];
  assert.equal(f.estado, 'PAID');
  assert.equal(f.ars_oficial, 1200 * 1400, 'pesos al oficial comprador del día');
  assert.match(e.datos.mensajes.at(-1).texto, /pagó la factura #0001/);
  assert.equal(e.datos.totales.USD.cobrado, 1200);

  const q = ultimo(await api('/api/mensaje', { metodo: 'POST', cuerpo: { texto: '¿Cuánto cobré?' } }));
  assert.match(q.texto, /Cobrado en los últimos 12 meses: \$1,200\.00/);
  assert.match(q.texto, /Monotributo categoría A/);
});

test('cancelar, marcar pagada, recordatorios automáticos y CSRF', async () => {
  const { env, pp, api } = crearMundo();
  await api('/api/estado');
  for (const texto of ['Invoice Initech 300 USD for QA, qa@initech.com, due in 0 days', 'Invoice Hooli 500 USD for the API, ap@hooli.com']) {
    const b = ultimo(await api('/api/mensaje', { metodo: 'POST', cuerpo: { texto } })).datos;
    await api('/api/facturas', { metodo: 'POST', cuerpo: { borrador: b.borrador } });
  }
  const cancelar = ultimo(await api('/api/mensaje', { metodo: 'POST', cuerpo: { texto: 'Cancel the Hooli invoice' } }));
  assert.equal(cancelar.datos.tipo, 'confirmar_cancelar');
  assert.equal((await api(`/api/facturas/${cancelar.datos.paypal_id}/cancelar`, { metodo: 'POST', cuerpo: {} })).datos.factura.estado, 'CANCELLED');

  // La factura de Initech vencía hoy: dos días después el cron le manda un recordatorio solo.
  for (const inv of pp.facturas.values()) if (inv.primary_recipients[0].billing_info.name.full_name === 'Initech') inv.detail.payment_term.due_date = '2026-01-01';
  await env.DB.prepare("UPDATE facturas SET vence = '2026-01-01' WHERE cliente = 'Initech'").run();
  await cron(env);
  assert.equal(pp.llamadas.filter((l) => l.ruta.endsWith('/remind')).length, 1);
  const est = await api('/api/estado');
  assert.match(est.datos.mensajes.at(-1).texto, /recordatorio automático a Initech/);
  // No repite antes de 3 días.
  await cron(env);
  assert.equal(pp.llamadas.filter((l) => l.ruta.endsWith('/remind')).length, 1);

  const pago = ultimo(await api('/api/mensaje', { metodo: 'POST', cuerpo: { texto: 'Initech me pagó en efectivo' } }));
  assert.equal(pago.datos.tipo, 'confirmar_pago');
  assert.equal((await api(`/api/facturas/${pago.datos.paypal_id}/pagada`, { metodo: 'POST', cuerpo: { metodo: 'CASH' } })).datos.factura.estado, 'MARKED_AS_PAID');

  const sinEncabezado = await worker.fetch(new Request(`${BASE}/api/mensaje`, { method: 'POST', body: '{"texto":"hola"}', headers: { 'Content-Type': 'application/json' } }), env);
  assert.equal(sinEncabezado.status, 403);
});

test('voz: Whisper transcribe y el agente (IA) arma el borrador', async () => {
  const llamadas = [];
  const ai = {
    async run(modelo, entrada) {
      llamadas.push(modelo);
      if (modelo.includes('whisper')) return { text: 'Facturale quinientos dólares a Umbrella por el mantenimiento, it@umbrella.com' };
      return { response: { intent: 'create_invoice', language: 'es', reply: 'ok', invoice: { client_name: 'Umbrella', client_email: 'it@umbrella.com', currency: 'USD', due_in_days: 15, items: [{ description: 'Mantenimiento', quantity: 1, unit_price: 500 }] } } };
    },
  };
  const { api } = crearMundo({ ai });
  await api('/api/estado');
  const r = await api('/api/voz', { metodo: 'POST', crudo: new Uint8Array([1, 2, 3, 4]), headers: { 'Content-Type': 'audio/webm' } });
  assert.equal(r.status, 200);
  assert.match(r.datos.transcripcion, /Umbrella/);
  assert.equal(ultimo(r).datos.borrador.total, 500);
  assert.deepEqual(llamadas, ['@cf/openai/whisper-large-v3-turbo', '@cf/meta/llama-3.3-70b-instruct-fp8-fast']);
});
