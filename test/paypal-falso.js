// PayPal sandbox de mentira (con estado) para probar el Worker de punta a punta.
export function crearPaypalFalso() {
  const facturas = new Map();
  const llamadas = [];
  let numero = 0;
  const webhooks = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    const metodo = opts.method || 'GET';
    const cuerpo = opts.body && typeof opts.body === 'string' && opts.body.startsWith('{') ? JSON.parse(opts.body) : null;
    llamadas.push({ metodo, ruta: u.pathname, cuerpo });
    const p = u.pathname;
    if (p === '/v1/oauth2/token') return Response.json({ access_token: 'A21', expires_in: 32400 });
    if (p === '/v2/invoicing/generate-next-invoice-number') return Response.json({ invoice_number: String(++numero).padStart(4, '0') });
    if (p === '/v2/invoicing/invoices' && metodo === 'POST') {
      const id = `INV2-${String(facturas.size + 1).padStart(4, '0')}`;
      const total = cuerpo.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_amount.value), 0);
      const inv = { id, status: 'DRAFT', detail: { ...cuerpo.detail, metadata: {} }, primary_recipients: cuerpo.primary_recipients.map(({ billing_info: { name, ...resto } }) => ({ billing_info: resto })), items: cuerpo.items, amount: { currency_code: cuerpo.detail.currency_code, value: total.toFixed(2) } };
      facturas.set(id, inv);
      return Response.json(inv, { status: 201 });
    }
    const m = p.match(/^\/v2\/invoicing\/invoices\/([^/]+)(?:\/(send|remind|cancel|payments))?$/);
    if (m) {
      const inv = facturas.get(m[1]);
      if (!inv) return Response.json({ name: 'RESOURCE_NOT_FOUND', details: [{ description: 'Invoice not found' }] }, { status: 404 });
      if (!m[2]) return Response.json(inv);
      if (m[2] === 'send') {
        inv.status = 'SENT';
        inv.detail.metadata.recipient_view_url = `https://www.sandbox.paypal.com/invoice/p/#${inv.id}`;
        return Response.json({ rel: 'payer-view', href: inv.detail.metadata.recipient_view_url, method: 'GET' });
      }
      if (m[2] === 'remind') return new Response(null, { status: 204 });
      if (m[2] === 'cancel') {
        inv.status = 'CANCELLED';
        return new Response(null, { status: 204 });
      }
      if (m[2] === 'payments') {
        inv.status = 'MARKED_AS_PAID';
        inv.payments = { transactions: [{ payment_date: cuerpo.payment_date, method: cuerpo.method }] };
        return Response.json({ payment_id: 'P-1' });
      }
    }
    if (p === '/v1/notifications/webhooks' && metodo === 'GET') return Response.json({ webhooks });
    if (p === '/v1/notifications/webhooks' && metodo === 'POST') {
      const w = { id: `WH-${webhooks.length + 1}`, url: cuerpo.url, event_types: cuerpo.event_types };
      webhooks.push(w);
      return Response.json(w, { status: 201 });
    }
    const wh = p.match(/^\/v1\/notifications\/webhooks\/([^/]+)$/);
    if (wh && metodo === 'DELETE') {
      webhooks.splice(webhooks.findIndex((w) => w.id === wh[1]), 1);
      return new Response(null, { status: 204 });
    }
    if (p === '/v1/notifications/verify-webhook-signature') return Response.json({ verification_status: cuerpo.transmission_sig === 'firma-buena' ? 'SUCCESS' : 'FAILURE' });
    return null;
  };
  /** Simula que el cliente paga desde el link de PayPal. */
  const pagar = (id) => {
    const inv = facturas.get(id);
    inv.status = 'PAID';
    inv.payments = { transactions: [{ payment_date: '2026-10-20' }] };
  };
  return { fetchImpl, facturas, llamadas, pagar, webhooks };
}
