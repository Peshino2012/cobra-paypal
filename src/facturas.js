// Borradores de factura: validación de lo que propone la IA (o el usuario) y
// el payload para la API de Invoicing v2 de PayPal.

export const MONEDAS = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'BRL'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const redondear = (n) => Math.round(n * 100) / 100;

/** Normaliza y valida un borrador. Devuelve { ok, borrador, faltan: [campos] }. */
export function validarBorrador(b = {}, { hoy = new Date() } = {}) {
  const faltan = [];
  const items = (Array.isArray(b.items) ? b.items : [])
    .map((i) => ({
      descripcion: String(i.descripcion ?? i.description ?? '').trim().slice(0, 200),
      cantidad: Number(i.cantidad ?? i.quantity ?? 1) || 1,
      precio: redondear(Number(i.precio ?? i.unit_price ?? 0)),
    }))
    .filter((i) => i.descripcion && i.precio > 0 && i.cantidad > 0);
  if (!items.length) faltan.push('items');
  const cliente = String(b.cliente ?? b.client_name ?? '').trim().slice(0, 120);
  if (!cliente) faltan.push('cliente');
  const email = String(b.email ?? b.client_email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) faltan.push('email');
  const moneda = String(b.moneda ?? b.currency ?? 'USD').toUpperCase();
  const diasPlazo = Math.min(90, Math.max(0, Number.parseInt(b.dias ?? b.due_in_days ?? 15, 10) || 0));
  const vence = new Date(hoy.getTime() + diasPlazo * 86400000).toISOString().slice(0, 10);
  const borrador = {
    cliente,
    email,
    items,
    moneda: MONEDAS.includes(moneda) ? moneda : 'USD',
    dias: diasPlazo,
    vence,
    nota: String(b.nota ?? b.note ?? '').trim().slice(0, 500),
    total: redondear(items.reduce((s, i) => s + i.cantidad * i.precio, 0)),
  };
  return { ok: faltan.length === 0, borrador, faltan };
}

/** Cuerpo para POST /v2/invoicing/invoices. */
export function payloadPaypal(borrador, { numero, hoy = new Date(), emisor } = {}) {
  return {
    detail: {
      currency_code: borrador.moneda,
      ...(numero ? { invoice_number: numero } : {}),
      invoice_date: hoy.toISOString().slice(0, 10),
      payment_term: { term_type: 'DUE_ON_DATE_SPECIFIED', due_date: borrador.vence },
      ...(borrador.nota ? { note: borrador.nota } : {}),
      memo: 'Created with Cobra',
    },
    // PayPal no devuelve name.full_name: el nombre del cliente (casi siempre una empresa) va en business_name.
    ...(emisor ? { invoicer: { business_name: emisor } } : {}),
    primary_recipients: [{ billing_info: { business_name: borrador.cliente, email_address: borrador.email } }],
    items: borrador.items.map((i) => ({
      name: i.descripcion,
      quantity: String(i.cantidad),
      unit_amount: { currency_code: borrador.moneda, value: i.precio.toFixed(2) },
      unit_of_measure: 'QUANTITY',
    })),
    configuration: { allow_tip: false, tax_calculated_after_discount: true, tax_inclusive: false },
  };
}

/** Fila local a partir de una factura devuelta por PayPal. */
export function filaDesdePaypal(inv, { espacioId } = {}) {
  const d = inv.detail || {};
  const rec = inv.primary_recipients?.[0]?.billing_info || {};
  const pagos = inv.payments?.transactions || [];
  const ultimoPago = pagos.map((p) => p.payment_date).filter(Boolean).sort().at(-1) || null;
  return {
    paypal_id: inv.id,
    espacio_id: espacioId,
    numero: d.invoice_number || null,
    cliente: rec.business_name || rec.name?.full_name || [rec.name?.given_name, rec.name?.surname].filter(Boolean).join(' ') || rec.email_address || '',
    email: rec.email_address || null,
    concepto: (inv.items || []).map((i) => i.name).join(', ').slice(0, 300),
    monto: Number(inv.amount?.value ?? inv.due_amount?.value ?? 0),
    moneda: inv.amount?.currency_code || d.currency_code || 'USD',
    estado: inv.status,
    vence: d.payment_term?.due_date || null,
    url_pago: d.metadata?.recipient_view_url || null,
    pagada: ['PAID', 'MARKED_AS_PAID'].includes(inv.status) ? ultimoPago || d.metadata?.last_update_time || new Date().toISOString() : null,
  };
}

export const ETIQUETAS_ESTADO = {
  DRAFT: { en: 'Draft', es: 'Borrador' },
  SENT: { en: 'Sent', es: 'Enviada' },
  SCHEDULED: { en: 'Scheduled', es: 'Programada' },
  UNPAID: { en: 'Unpaid', es: 'Impaga' },
  PAYMENT_PENDING: { en: 'Payment pending', es: 'Pago pendiente' },
  PARTIALLY_PAID: { en: 'Partially paid', es: 'Pagada en parte' },
  PAID: { en: 'Paid', es: 'Pagada' },
  MARKED_AS_PAID: { en: 'Marked as paid', es: 'Marcada como pagada' },
  CANCELLED: { en: 'Cancelled', es: 'Cancelada' },
  REFUNDED: { en: 'Refunded', es: 'Reembolsada' },
  PARTIALLY_REFUNDED: { en: 'Partially refunded', es: 'Reembolsada en parte' },
  MARKED_AS_REFUNDED: { en: 'Marked as refunded', es: 'Marcada como reembolsada' },
};
