// Cliente de la API REST de PayPal (Invoicing v2 y Webhooks), con fetch.
// Sandbox: https://api-m.sandbox.paypal.com

export class ErrorPaypal extends Error {
  constructor(status, mensaje, detalle) {
    super(mensaje);
    this.status = status;
    this.detalle = detalle;
  }
}

export function crearPaypal({ clientId, secret, base = 'https://api-m.sandbox.paypal.com', fetchImpl = fetch }) {
  let token = null;
  let vence = 0;

  async function obtenerToken() {
    if (token && Date.now() < vence - 60000) return token;
    const r = await fetchImpl(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.access_token) throw new ErrorPaypal(r.status, 'No se pudo autenticar con PayPal (revisá el Client ID y el Secret)', j);
    token = j.access_token;
    vence = Date.now() + (j.expires_in || 3000) * 1000;
    return token;
  }

  async function pedir(metodo, ruta, cuerpo, { prefer } = {}) {
    const r = await fetchImpl(base + ruta, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${await obtenerToken()}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await r.text();
    let j = null;
    try {
      j = texto ? JSON.parse(texto) : null;
    } catch {}
    if (!r.ok) {
      const detalle = j?.details?.map((d) => d.description || d.issue).filter(Boolean).join('; ');
      throw new ErrorPaypal(r.status, detalle || j?.message || `PayPal respondió ${r.status}`, j);
    }
    return j;
  }

  return {
    obtenerToken,
    siguienteNumero: async () => (await pedir('POST', '/v2/invoicing/generate-next-invoice-number'))?.invoice_number,
    crearBorrador: (payload) => pedir('POST', '/v2/invoicing/invoices', payload, { prefer: 'return=representation' }),
    enviar: (id, { subject, note } = {}) => pedir('POST', `/v2/invoicing/invoices/${id}/send`, { send_to_invoicer: true, send_to_recipient: true, ...(subject ? { subject } : {}), ...(note ? { note } : {}) }),
    recordar: (id, { subject, note }) => pedir('POST', `/v2/invoicing/invoices/${id}/remind`, { subject, note, send_to_invoicer: false, send_to_recipient: true }),
    cancelar: (id, { subject, note } = {}) => pedir('POST', `/v2/invoicing/invoices/${id}/cancel`, { subject, note, send_to_invoicer: true, send_to_recipient: true }),
    registrarPago: (id, { metodo = 'BANK_TRANSFER', monto, moneda, fecha, nota }) =>
      pedir('POST', `/v2/invoicing/invoices/${id}/payments`, { method: metodo, payment_date: fecha, amount: { currency_code: moneda, value: Number(monto).toFixed(2) }, ...(nota ? { note: nota } : {}) }),
    obtener: (id) => pedir('GET', `/v2/invoicing/invoices/${id}`),
    listar: (pagina = 1, tamano = 50) => pedir('GET', `/v2/invoicing/invoices?page=${pagina}&page_size=${tamano}&total_required=true`),
    crearWebhook: (url, eventos) => pedir('POST', '/v1/notifications/webhooks', { url, event_types: eventos.map((name) => ({ name })) }),
    listarWebhooks: async () => (await pedir('GET', '/v1/notifications/webhooks'))?.webhooks || [],
    /** Verifica la firma de un webhook con la API de PayPal. */
    async verificarWebhook(encabezados, evento, webhookId) {
      const h = (n) => encabezados.get(n);
      const j = await pedir('POST', '/v1/notifications/verify-webhook-signature', {
        auth_algo: h('paypal-auth-algo'),
        cert_url: h('paypal-cert-url'),
        transmission_id: h('paypal-transmission-id'),
        transmission_sig: h('paypal-transmission-sig'),
        transmission_time: h('paypal-transmission-time'),
        webhook_id: webhookId,
        webhook_event: evento,
      });
      return j?.verification_status === 'SUCCESS';
    },
  };
}

/** Enlace para que el cliente pague (está en la respuesta de send o en el detalle de la factura). */
export function enlacePago(respuestaEnvio, factura) {
  return respuestaEnvio?.href || respuestaEnvio?.links?.find((l) => l.rel === 'payer-view')?.href || factura?.detail?.metadata?.recipient_view_url || null;
}
