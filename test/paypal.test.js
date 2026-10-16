import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPaypal, enlacePago, ErrorPaypal } from '../src/paypal.js';

function paypalFalso() {
  const pedidos = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    pedidos.push({ metodo: opts.method || 'GET', ruta: u.pathname + u.search, headers: opts.headers, cuerpo: opts.body });
    if (u.pathname === '/v1/oauth2/token') {
      assert.equal(opts.headers.Authorization, `Basic ${btoa('cid:sec')}`);
      return Response.json({ access_token: 'A21', expires_in: 32400 });
    }
    assert.equal(opts.headers.Authorization, 'Bearer A21');
    if (u.pathname === '/v2/invoicing/generate-next-invoice-number') return Response.json({ invoice_number: '0042' });
    if (u.pathname === '/v2/invoicing/invoices' && opts.method === 'POST') return Response.json({ id: 'INV2-X', status: 'DRAFT', detail: {} }, { status: 201 });
    if (u.pathname.endsWith('/send')) return Response.json({ href: 'https://www.sandbox.paypal.com/invoice/p/#INV2-X', rel: 'payer-view', method: 'GET' });
    if (u.pathname.endsWith('/remind')) return new Response(null, { status: 204 });
    if (u.pathname === '/v2/invoicing/invoices/INV2-ROTA') return Response.json({ name: 'INVALID_REQUEST', details: [{ issue: 'X', description: 'Invoice not found' }] }, { status: 404 });
    return Response.json({}, { status: 404 });
  };
  return { fetchImpl, pedidos };
}

test('flujo: token cacheado, número, borrador, envío y recordatorio', async () => {
  const { fetchImpl, pedidos } = paypalFalso();
  const pp = crearPaypal({ clientId: 'cid', secret: 'sec', fetchImpl });
  assert.equal(await pp.siguienteNumero(), '0042');
  const inv = await pp.crearBorrador({ detail: {} });
  assert.equal(inv.id, 'INV2-X');
  const envio = await pp.enviar('INV2-X', { subject: 'Invoice' });
  assert.equal(enlacePago(envio), 'https://www.sandbox.paypal.com/invoice/p/#INV2-X');
  assert.equal(await pp.recordar('INV2-X', { subject: 's', note: 'n' }), null);
  assert.equal(pedidos.filter((p) => p.ruta === '/v1/oauth2/token').length, 1, 'el token se reutiliza');
  assert.equal(pedidos.find((p) => p.ruta === '/v2/invoicing/invoices').headers.Prefer, 'return=representation');
  assert.deepEqual(JSON.parse(pedidos.find((p) => p.ruta.endsWith('/remind')).cuerpo), { subject: 's', note: 'n', send_to_invoicer: false, send_to_recipient: true });
});

test('errores legibles', async () => {
  const { fetchImpl } = paypalFalso();
  const pp = crearPaypal({ clientId: 'cid', secret: 'sec', fetchImpl });
  await assert.rejects(pp.obtener('INV2-ROTA'), (e) => e instanceof ErrorPaypal && e.status === 404 && e.message === 'Invoice not found');
  const malas = crearPaypal({ clientId: 'x', secret: 'y', fetchImpl: async () => Response.json({ error: 'invalid_client' }, { status: 401 }) });
  await assert.rejects(malas.siguienteNumero(), /No se pudo autenticar con PayPal/);
});
