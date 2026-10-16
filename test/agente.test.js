import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretar, interpretarSinIA, redactarRecordatorio, promptSistema, ESQUEMA, detectarIdioma } from '../src/agente.js';

test('reglas: crear factura en español con monto, cliente, email y plazo', () => {
  const r = interpretarSinIA('Facturale 800 dólares a Acme Corp por el rediseño del logo, ap@acme.com, vence en 10 días');
  assert.equal(r.intent, 'create_invoice');
  assert.equal(r.language, 'es');
  assert.equal(r.borrador.cliente, 'Acme Corp');
  assert.equal(r.borrador.email, 'ap@acme.com');
  assert.equal(r.borrador.dias, 10);
  assert.deepEqual(r.borrador.items, [{ descripcion: 'rediseño del logo', cantidad: 1, precio: 800 }]);
});

test('reglas: inglés, miles y euros', () => {
  const r = interpretarSinIA('Invoice Globex 1,250.50 EUR for the landing page');
  assert.equal(r.language, 'en');
  assert.equal(r.borrador.moneda, 'EUR');
  assert.equal(r.borrador.items[0].precio, 1250.5);
  assert.equal(r.borrador.cliente, 'Globex');
  assert.equal(interpretarSinIA('cobrale 2k a Initech por la app').borrador.items[0].precio, 2000);
});

test('reglas: recordatorios, consultas y ayuda', () => {
  assert.equal(interpretarSinIA('Mandale un recordatorio a Acme Corp', { clientes: ['Acme Corp'] }).objetivo.cliente, 'Acme Corp');
  assert.equal(interpretarSinIA('Send Globex a friendly reminder', { clientes: ['Acme Corp', 'Globex Corp'] }).objetivo.cliente, 'Globex Corp', 'alcanza con la primera palabra');
  assert.equal(interpretarSinIA('Who owes me money?').filtro, 'unpaid');
  assert.equal(interpretarSinIA('¿Qué facturas están vencidas?').filtro, 'overdue');
  assert.equal(interpretarSinIA('Acme me pagó en efectivo', { clientes: ['Acme'] }).intent, 'mark_paid');
  assert.equal(interpretarSinIA('hola').intent, 'help');
});

test('con IA: usa la respuesta JSON y cae a reglas si falla', async () => {
  const llamadas = [];
  const ai = {
    async run(modelo, entrada) {
      llamadas.push({ modelo, entrada });
      return { response: { intent: 'create_invoice', language: 'en', reply: 'Invoice for Acme', invoice: { client_name: 'Acme', client_email: 'a@acme.com', currency: 'USD', due_in_days: 30, items: [{ description: 'Website', quantity: 1, unit_price: 1500 }] } } };
    },
  };
  const r = await interpretar(ai, 'invoice acme 1500 for website', { hoy: '2026-10-14' });
  assert.equal(r.fuente, 'ia');
  assert.equal(r.borrador.dias, 30);
  assert.equal(llamadas[0].entrada.response_format.json_schema, ESQUEMA);
  assert.match(llamadas[0].entrada.messages[0].content, /Today is 2026-10-14/);
  const rota = { run: async () => ({ response: 'esto no es json' }) };
  assert.equal((await interpretar(rota, 'Facturale 100 a Acme')).fuente, 'reglas');
  assert.equal((await interpretar(null, 'Facturale 100 a Acme')).fuente, 'reglas');
});

test('recordatorio: IA o plantilla en el idioma del cliente', async () => {
  const f = { numero: '0007', cliente: 'Acme', monto: 800, moneda: 'USD', vence: '2026-10-01', vencida: true, concepto: 'Logo' };
  const plantilla = await redactarRecordatorio(null, f, 'es');
  assert.match(plantilla.note, /venció el 2026-10-01/);
  const ai = { run: async () => ({ response: { subject: 'Quick note about invoice #0007', note: 'Hi Acme! ...' } }) };
  assert.equal((await redactarRecordatorio(ai, f, 'en')).subject, 'Quick note about invoice #0007');
});

test('el prompt incluye las facturas y no pide inventar datos', () => {
  const p = promptSistema({ hoy: '2026-10-14', facturas: [{ numero: '0007', cliente: 'Acme', email: 'a@acme.com', monto: 800, moneda: 'USD', estado: 'SENT', vence: '2026-10-29' }], clientes: ['Acme'] });
  assert.match(p, /#0007 \| Acme <a@acme.com> \| 800 USD \| SENT/);
  assert.match(p, /never invent emails or amounts/);
});

test('idioma: por palabras frecuentes y, si empata, el del espacio', () => {
  assert.equal(detectarIdioma('Mandale un recordatorio a Initech'), 'es');
  assert.equal(detectarIdioma('Send a reminder to Initech'), 'en');
  assert.equal(detectarIdioma('Initech?', 'es'), 'es');
  assert.equal(interpretarSinIA('Mandale un recordatorio a Initech').language, 'es');
});
