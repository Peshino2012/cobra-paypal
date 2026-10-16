import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totales, vencida, enPesos, medidorMonotributo, MONOTRIBUTO_2026_08 } from '../src/finanzas.js';

const AHORA = Date.parse('2026-10-14T15:00:00Z');
const F = [
  { estado: 'PAID', monto: 800, moneda: 'USD', pagada: '2026-09-01T12:00:00Z', ars_oficial: 1_120_000 },
  { estado: 'PAID', monto: 500, moneda: 'USD', pagada: '2025-01-01T12:00:00Z', ars_oficial: 500_000 },
  { estado: 'SENT', monto: 300, moneda: 'USD', vence: '2026-10-01' },
  { estado: 'UNPAID', monto: 200, moneda: 'USD', vence: '2026-10-30' },
  { estado: 'SENT', monto: 100, moneda: 'EUR', vence: '2026-10-13' },
  { estado: 'CANCELLED', monto: 999, moneda: 'USD', vence: '2026-09-01' },
];

test('totales por moneda: cobrado del último año, pendiente y vencido', () => {
  const t = totales(F, AHORA);
  assert.deepEqual(t.USD, { cobrado: 800, pendiente: 500, vencido: 300, cantidadPendientes: 2, cantidadVencidas: 1 });
  assert.deepEqual(t.EUR, { cobrado: 0, pendiente: 100, vencido: 100, cantidadPendientes: 1, cantidadVencidas: 1 });
  assert.equal(vencida({ estado: 'SENT', vence: '2026-10-14' }, AHORA), false, 'vence hoy: todavía no');
});

test('pesos al oficial comprador y al MEP', () => {
  const p = enPesos(100, [{ casa: 'oficial', compra: 1400, venta: 1450 }, { casa: 'bolsa', compra: 1480, venta: 1490 }]);
  assert.deepEqual(p, { oficial: 140000, mep: 148000 });
  assert.deepEqual(enPesos(100, []), { oficial: null, mep: null });
});

test('medidor del monotributo', () => {
  const m = medidorMonotributo(F, 'A', { ahora: AHORA });
  assert.equal(m.tope, MONOTRIBUTO_2026_08.A);
  assert.equal(m.usado, 1_120_000, 'solo lo cobrado en los últimos 12 meses');
  assert.equal(m.nivel, 'ok');
  assert.ok(m.fechaTopeEstimada > '2026-10-14');
  const cerca = medidorMonotributo([{ estado: 'PAID', pagada: '2026-06-01T00:00:00Z', ars_oficial: 11_000_000 }], 'A', { ahora: AHORA });
  assert.equal(cerca.nivel, 'alerta');
  assert.equal(cerca.categoriaSugerida, 'D', 'a ese ritmo (11 M en 4,5 meses) el año termina en ~29,7 M → categoría D');
  assert.throws(() => medidorMonotributo([], 'Z'), RangeError);
});
