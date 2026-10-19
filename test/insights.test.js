// Lógica de Cobra Insights que corre en el navegador: deudas por cliente (agente) y etiquetas del marcador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deudas } from '../public/insights-agente.js';
import { atraso } from '../public/insights-marcador.js';
import { facturasEjemplo } from '../public/insights-ejemplo.js';

const fila = (client, invoice, outstanding, overdue, dias) => ({ client, invoice, amount: outstanding || 100, currency: 'USD', outstanding, overdue_amount: overdue, days_overdue: dias, reminders_sent: 0, due: new Date('2026-10-01T12:00:00Z') });

test('deudas por cliente, ordenadas por lo vencido', () => {
  const d = deudas([fila('A', '#1', 500, 0, 0), fila('B', '#2', 300, 300, 40), fila('B', '#3', 200, 0, 0), fila('C', '#4', 0, 0, 0)]);
  assert.equal(d.total_outstanding, 1000);
  assert.equal(d.total_overdue, 300);
  assert.deepEqual(d.clients.map((c) => [c.client, c.outstanding, c.overdue, c.max_days_overdue]), [['B', 500, 300, 40], ['A', 500, 0, 0]]);
  assert.equal(d.clients[0].invoices[0].invoice, '#2', 'la más atrasada primero');
  assert.deepEqual(deudas([fila('A', '#1', 500, 0, 0), fila('B', '#2', 300, 300, 40)], { soloVencidas: true }).clients.map((c) => c.client), ['B']);
});

test('etiquetas de atraso del marcador', () => {
  assert.deepEqual(atraso(0), { texto: 'On time', clase: 'ok' });
  assert.deepEqual(atraso(1), { texto: '1 day late', clase: 'poco' });
  assert.deepEqual(atraso(45), { texto: '45 days late', clase: 'mucho' });
});

test('los datos de ejemplo siempre tienen facturas vencidas, por vencer y pagadas', () => {
  const f = facturasEjemplo(new Date('2026-10-19T12:00:00Z'));
  assert.ok(f.length > 30);
  assert.ok(f.some((x) => x.estado === 'PAID' && x.pagada));
  assert.ok(f.some((x) => x.estado === 'SENT' && x.vence < '2026-10-19'), 'vencidas');
  assert.ok(f.some((x) => x.estado === 'SENT' && x.vence >= '2026-10-19'), 'por vencer');
  assert.ok(f.every((x) => x.cliente && x.monto > 0 && x.moneda === 'USD'));
});
