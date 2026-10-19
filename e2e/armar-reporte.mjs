// Arma el tablero inicial de Cobra Insights con las herramientas de AG Studio (las mismas que usan sus agentes,
// que validan cada paso) y lo guarda en public/insights-reporte.js.
//   node e2e/armar-reporte.mjs                (AG_STUDIO_UMD=/ruta/ag-studio.min.js para no bajarlo de jsDelivr)
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
process.env.IA_FALSA ||= '1';
await import('./servidor-local.mjs');

const W = (id, type, x, y, w, h) => ({ id, type, x, y, w, h });
const titulo = (text) => ({ title: { enabled: true, text } });
const PIEZAS = [
  [W('kpi-pendiente', 'value', 0, 0, 3, 3), { format: titulo('Outstanding'), dataMapping: { value: [{ id: 'invoices.outstanding', aggregation: 'sum' }] } }],
  [W('kpi-vencido', 'value', 3, 0, 3, 3), { format: titulo('Overdue'), dataMapping: { value: [{ id: 'invoices.overdue_amount', aggregation: 'sum' }] } }],
  [W('kpi-cobrado', 'value', 6, 0, 3, 3), { format: titulo('Collected'), dataMapping: { value: [{ id: 'invoices.collected', aggregation: 'sum' }] } }],
  [W('kpi-dias', 'value', 9, 0, 3, 3), { format: titulo('Avg. days to get paid'), dataMapping: { value: [{ id: 'invoices.days_to_pay', aggregation: 'avg' }] } }],
  [
    W('deben', 'bar-chart-grouped', 0, 3, 7, 8),
    {
      format: titulo('Who owes you'),
      dataMapping: { categoryKey: [{ id: 'invoices.client' }], valueKey: [{ id: 'invoices.outstanding', aggregation: 'sum' }, { id: 'invoices.overdue_amount', aggregation: 'sum' }] },
      sort: [{ field: { id: 'invoices.outstanding', aggregation: 'sum' }, direction: 'desc' }],
    },
  ],
  [W('estados', 'donut-chart', 7, 3, 5, 8), { format: titulo('Invoices by status'), dataMapping: { categoryKey: [{ id: 'invoices.status' }], valueKey: [{ id: 'invoices.amount', aggregation: 'sum' }] } }],
  [W('cobrado-mes', 'column-chart-grouped', 0, 11, 7, 8), { format: titulo('Collected per month'), dataMapping: { categoryKey: [{ id: 'invoices.paid_on::month' }], valueKey: [{ id: 'invoices.collected', aggregation: 'sum' }] } }],
  [
    W('demoras', 'grid', 7, 11, 5, 8),
    {
      format: titulo('Late payers'),
      dataMapping: { cols: [{ id: 'invoices.client' }, { id: 'invoices.overdue_amount', aggregation: 'sum' }, { id: 'invoices.days_overdue', aggregation: 'max' }, { id: 'invoices.reminders_sent', aggregation: 'sum' }] },
      sort: [{ field: { id: 'invoices.overdue_amount', aggregation: 'sum' }, direction: 'desc' }],
    },
  ],
];

// Filtros de cada widget: solo facturas pagadas en "cobrado por mes" y solo deudas vencidas en "late payers".
const FILTROS = [
  ['cobrado-mes', { field: { id: 'invoices.paid_on' }, model: { operator: 'isNotBlank' } }],
  ['demoras', { field: { id: 'invoices.overdue_amount' }, model: { operator: 'greaterThan', value: 0 } }],
];

const navegador = await chromium.launch();
const page = await navegador.newPage({ viewport: { width: 1600, height: 1000 } });
const errores = [];
page.on('pageerror', (e) => errores.push(String(e)));
if (process.env.AG_STUDIO_UMD) {
  const umd = readFileSync(process.env.AG_STUDIO_UMD);
  await page.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ body: umd, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
}
await page.goto('http://127.0.0.1:8787/insights.html?ejemplo=1&vacio=1');
await page.waitForFunction(() => window.__studio, null, { timeout: 60000 });
await page.waitForTimeout(1500);

const resultado = await page.evaluate(async ([piezas, filtros]) => {
  const api = window.__studio;
  const t = api.getAiTools();
  const ctx = { signal: new AbortController().signal, run: { threadId: 'armado', runId: 'armado' }, success: (response, data) => ({ success: true, response, data }), error: (m) => ({ success: false, messages: m }) };
  const log = [];
  for (const [w] of piezas) {
    const r = await t.addWidget().execute({ toolCallId: `a-${w.id}`, name: 'add_widget', args: { widgetId: w.id, type: w.type, xTrack: w.x, yTrack: w.y, xSpan: w.w, ySpan: w.h } }, ctx);
    log.push([`add ${w.id}`, r.success, r.response || r.messages]);
  }
  for (const [w, valor] of piezas) {
    const r = await t.configureWidget({ widgetType: w.type, widgetId: w.id }).execute({ toolCallId: `c-${w.id}`, name: 'configure_widget', args: { op: 'patch', widgetId: w.id, value: { type: w.type, ...valor } } }, ctx);
    log.push([`configure ${w.id}`, r.success, r]);
  }
  for (const [widgetId, value] of filtros) {
    const r = await t.addWidgetFilter().execute({ toolCallId: `f-${widgetId}`, name: 'add_widget_filter', args: { op: 'append', widgetId, value } }, ctx);
    log.push([`filter ${widgetId}`, r.success, r]);
  }
  return { log, estado: api.getState() };
}, [PIEZAS, FILTROS]);

await page.waitForTimeout(3000);
await page.screenshot({ path: new URL('./out-insights/reporte.png', import.meta.url).pathname });
for (const l of resultado.log) console.log(l[1] ? 'ok ' : 'ERROR', l[0], (typeof l[2] === 'string' ? l[2] : JSON.stringify(l[2])).slice(0, 700));
console.log(JSON.stringify(resultado.estado.pages[0].widgets).slice(0, 1500));
if (errores.length) console.log(errores.join('\n'));
// Al abrir, el tablero ocupa el lugar y el asistente de IA queda a la izquierda: los paneles de edición, cerrados.
resultado.estado.panels = { filters: { collapsed: true }, edit: { collapsed: true }, data: { collapsed: true }, ai: { width: 360 } };
const malos = resultado.log.filter((l) => !l[1]);
if (!malos.length) {
  writeFileSync(
    new URL('../public/insights-reporte.js', import.meta.url),
    `// Tablero inicial de Cobra Insights (generado por e2e/armar-reporte.mjs con las herramientas de AG Studio).\nexport const REPORTE = ${JSON.stringify(resultado.estado, null, 2)};\n`,
  );
  console.log('Guardado en public/insights-reporte.js');
}
await navegador.close();
process.exit(malos.length ? 1 : 0);
