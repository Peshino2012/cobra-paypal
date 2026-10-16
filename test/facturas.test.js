import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarBorrador, payloadPaypal, filaDesdePaypal } from '../src/facturas.js';

const HOY = new Date('2026-10-14T12:00:00Z');

test('validar borrador: completa, normaliza y avisa lo que falta', () => {
  const r = validarBorrador({ cliente: ' Acme Corp ', email: 'AP@Acme.com', items: [{ descripcion: 'Logo redesign', precio: 800 }], moneda: 'usd', dias: 15 }, { hoy: HOY });
  assert.equal(r.ok, true);
  assert.equal(r.borrador.email, 'ap@acme.com');
  assert.equal(r.borrador.vence, '2026-10-29');
  assert.equal(r.borrador.total, 800);
  const mal = validarBorrador({ cliente: '', email: 'sin-arroba', items: [{ descripcion: 'x', precio: 0 }] }, { hoy: HOY });
  assert.deepEqual(mal.faltan.sort(), ['cliente', 'email', 'items']);
  assert.equal(validarBorrador({ moneda: 'ARS', dias: 500 }, { hoy: HOY }).borrador.moneda, 'USD', 'moneda no soportada → USD');
  assert.equal(validarBorrador({ dias: 500 }, { hoy: HOY }).borrador.dias, 90);
});

test('payload de Invoicing v2', () => {
  const { borrador } = validarBorrador({ cliente: 'Acme Corp', email: 'ap@acme.com', items: [{ descripcion: 'Logo', cantidad: 2, precio: 400 }], nota: 'Thanks!' }, { hoy: HOY });
  const p = payloadPaypal(borrador, { numero: '0007', hoy: HOY });
  assert.equal(p.detail.currency_code, 'USD');
  assert.equal(p.detail.invoice_number, '0007');
  assert.deepEqual(p.detail.payment_term, { term_type: 'DUE_ON_DATE_SPECIFIED', due_date: '2026-10-29' });
  assert.equal(p.primary_recipients[0].billing_info.email_address, 'ap@acme.com');
  assert.deepEqual(p.items[0], { name: 'Logo', quantity: '2', unit_amount: { currency_code: 'USD', value: '400.00' }, unit_of_measure: 'QUANTITY' });
});

test('fila local desde una factura de PayPal', () => {
  const f = filaDesdePaypal(
    {
      id: 'INV2-AAAA',
      status: 'PAID',
      detail: { invoice_number: '0007', currency_code: 'USD', payment_term: { due_date: '2026-10-29' }, metadata: { recipient_view_url: 'https://www.sandbox.paypal.com/invoice/p/#INV2-AAAA' } },
      primary_recipients: [{ billing_info: { name: { full_name: 'Acme Corp' }, email_address: 'ap@acme.com' } }],
      items: [{ name: 'Logo' }],
      amount: { currency_code: 'USD', value: '800.00' },
      payments: { transactions: [{ payment_date: '2026-10-20' }] },
    },
    { espacioId: 'e1' },
  );
  assert.deepEqual(
    { ...f },
    { paypal_id: 'INV2-AAAA', espacio_id: 'e1', numero: '0007', cliente: 'Acme Corp', email: 'ap@acme.com', concepto: 'Logo', monto: 800, moneda: 'USD', estado: 'PAID', vence: '2026-10-29', url_pago: 'https://www.sandbox.paypal.com/invoice/p/#INV2-AAAA', pagada: '2026-10-20' },
  );
});
