// Lógica de Cobra Insights que corre en el navegador: deudas por cliente (agente) y etiquetas del marcador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deudas } from '../public/insights-agente.js';
import { atraso } from '../public/insights-marcador.js';
import { facturasEjemplo } from '../public/insights-ejemplo.js';
import { GRILLA, REPORTE } from '../public/insights-reporte.js';
import { ajustarNuevos, idsDe, MINIMO } from '../public/insights-ajuste.js';

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

test('el tablero usa la grilla de 24 columnas que suponen los agentes de AG Studio', () => {
  // Con 12 columnas, los agentes ubicaban los gráficos nuevos entre las columnas 12 y 23: fuera del lienzo.
  assert.equal(GRILLA.columns, 24);
  const piezas = Object.values(REPORTE.pages[0].widgetLayout);
  for (const l of piezas) assert.ok(l.xTrack >= 0 && l.xTrack + l.xSpan <= GRILLA.columns && l.yTrack >= 0, JSON.stringify(l));
  for (const [i, a] of piezas.entries()) {
    for (const b of piezas.slice(i + 1)) {
      const choca = a.xTrack < b.xTrack + b.xSpan && a.xTrack + a.xSpan > b.xTrack && a.yTrack < b.yTrack + b.ySpan && a.yTrack + a.ySpan > b.yTrack;
      assert.ok(!choca, `${JSON.stringify(a)} y ${JSON.stringify(b)} se pisan`);
    }
  }
});

test('un gráfico nuevo que quedó chico se agranda una sola vez, sin pisar a nadie', () => {
  const vistos = idsDe(REPORTE);
  assert.equal(ajustarNuevos(REPORTE, vistos), null, 'el tablero inicial no se toca');
  // Lo que hizo el agente en la prueba real: un gráfico de 6 × 6 abajo a la izquierda.
  const estado = structuredClone(REPORTE);
  estado.pages[0].widgets.nuevo = { type: 'bar-chart-grouped' };
  estado.pages[0].widgetLayout.nuevo = { xTrack: 0, yTrack: 52, xSpan: 6, ySpan: 6 };
  const ajustado = ajustarNuevos(estado, vistos);
  assert.deepEqual(ajustado.pages[0].widgetLayout.nuevo, { xTrack: 0, yTrack: 52, xSpan: MINIMO.xSpan, ySpan: MINIMO.ySpan });
  assert.equal(ajustarNuevos(ajustado, vistos), null, 'si después lo achican a mano, se respeta');
  // Uno que al agrandarse pisaría a otro va abajo de todo; un KPI chico queda como está.
  const otro = structuredClone(REPORTE);
  otro.pages[0].widgets.medio = { type: 'line-chart' };
  otro.pages[0].widgetLayout.medio = { xTrack: 20, yTrack: 0, xSpan: 4, ySpan: 4 };
  otro.pages[0].widgets.kpi = { type: 'value' };
  otro.pages[0].widgetLayout.kpi = { xTrack: 0, yTrack: 60, xSpan: 4, ySpan: 4 };
  const l = ajustarNuevos(otro, idsDe(REPORTE)).pages[0].widgetLayout;
  assert.deepEqual(l.medio, { xTrack: 0, yTrack: 64, xSpan: 12, ySpan: 16 });
  assert.deepEqual(l.kpi, { xTrack: 0, yTrack: 60, xSpan: 4, ySpan: 4 });
});
