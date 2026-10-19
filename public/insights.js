// Cobra Insights: tablero de AG Studio sobre las facturas del espacio (o datos de ejemplo).
import { facturasEjemplo } from './insights-ejemplo.js';
import { REPORTE } from './insights-reporte.js';
import { crearHarness, VISTA_HERRAMIENTAS } from './insights-agente.js';

const { createStudio, AgStudioLicenseManager, AgStudioModuleRegistry, AgStudioAiModule, studioTheme } = window.agStudio;
AgStudioModuleRegistry.registerModules([AgStudioAiModule]);

// Colores de Cobra: verde para lo cobrado o a tiempo, rojo para lo vencido, gris y ámbar para el resto.
const TEMA = studioTheme.withParams({
  accentColor: '#128a5a',
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  studioCanvasBackgroundColor: '#f4f6f3',
  chartPaletteFills1Color: '#1f9d6b',
  chartPaletteFills2Color: '#e5484d',
  chartPaletteFills3Color: '#9aa8a0',
  chartPaletteFills4Color: '#f2a541',
  chartPaletteFills5Color: '#3b82f6',
  chartPaletteFills6Color: '#8b5cf6',
});

const fecha = (s) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00Z`) : null);
const DIA = 86_400_000;

/** Una fila por factura, con nombres pensados para el tablero y para el agente. */
function filas(facturas, hoy = Date.now()) {
  return facturas.map((f) => {
    const vence = fecha(f.vence);
    const pagada = f.estado === 'PAID' || f.estado === 'MARKED_AS_PAID';
    const abierta = !pagada && f.estado !== 'CANCELLED' && f.estado !== 'DRAFT';
    const vencida = abierta && vence && vence.getTime() < hoy;
    const monto = Number(f.monto) || 0;
    return {
      paypal_id: f.paypal_id || null,
      invoice: `#${f.numero || '—'}`,
      client: f.cliente || f.email || 'Unknown',
      description: f.concepto || '',
      amount: monto,
      outstanding: abierta ? monto : 0,
      overdue_amount: vencida ? monto : 0,
      collected: pagada ? monto : 0,
      currency: f.moneda || 'USD',
      status: pagada ? 'Paid' : f.estado === 'CANCELLED' ? 'Cancelled' : f.estado === 'DRAFT' ? 'Draft' : vencida ? 'Overdue' : 'Awaiting payment',
      issued: fecha(f.creada),
      due: vence,
      paid_on: fecha(f.pagada),
      days_overdue: vencida ? Math.floor((hoy - vence.getTime()) / DIA) : 0,
      days_to_pay: f.pagada ? Math.max(0, Math.round((fecha(f.pagada) - fecha(f.creada)) / DIA)) : null,
      reminders_sent: Number(f.recordatorios) || 0,
      amount_ars: Number(f.ars_oficial) || null,
    };
  });
}

const CAMPOS = [
  { id: 'paypal_id', name: 'PayPal ID', format: 'textFormat', hide: true },
  { id: 'invoice', name: 'Invoice', format: 'textFormat', description: 'PayPal invoice number' },
  { id: 'client', name: 'Client', format: 'textFormat', description: 'Who the invoice was sent to' },
  { id: 'description', name: 'Description', format: 'textFormat' },
  { id: 'amount', name: 'Amount', format: 'currencyFormat', description: 'Invoice total in its currency (mostly USD)' },
  { id: 'outstanding', name: 'Outstanding', format: 'currencyFormat', description: 'Amount still owed: the invoice total if it is unpaid (awaiting payment or overdue), otherwise 0' },
  { id: 'overdue_amount', name: 'Overdue amount', format: 'currencyFormat', description: 'Amount owed and already past its due date, otherwise 0' },
  { id: 'collected', name: 'Collected', format: 'currencyFormat', description: 'Amount received: the invoice total if it was paid, otherwise 0' },
  { id: 'currency', name: 'Currency', format: 'textFormat' },
  { id: 'status', name: 'Status', format: 'textFormat', description: 'Paid, Awaiting payment (not yet due), Overdue (past due date and unpaid), Cancelled or Draft' },
  { id: 'issued', name: 'Issued', format: 'dateFormat' },
  { id: 'due', name: 'Due date', format: 'dateFormat' },
  { id: 'paid_on', name: 'Paid on', format: 'dateFormat' },
  { id: 'days_overdue', name: 'Days overdue', format: 'integerFormat', description: 'Days past the due date, 0 if not overdue' },
  { id: 'days_to_pay', name: 'Days to pay', format: 'integerFormat', description: 'Days between issue and payment, blank if unpaid' },
  { id: 'reminders_sent', name: 'Reminders sent', format: 'integerFormat', description: 'Payment reminders Cobra sent through PayPal' },
  { id: 'amount_ars', name: 'Amount (ARS)', format: 'currencyFormat', description: 'Paid amount converted to Argentine pesos at the official rate on payment day' },
];

/* ---------- Adaptador: cada turno de un agente va al Worker, que llama al modelo ---------- */

/** Arma los eventos de streaming a partir de la salida completa del turno. */
function* eventosDe(respuesta) {
  for (const it of respuesta.output || []) {
    if (it.type === 'message') {
      yield { type: 'TEXT_MESSAGE_START', messageId: it.id, role: 'assistant' };
      yield { type: 'TEXT_MESSAGE_CONTENT', messageId: it.id, delta: it.content.map((c) => c.text || '').join('') };
      yield { type: 'TEXT_MESSAGE_END', messageId: it.id };
    } else if (it.type === 'function_call') {
      yield { type: 'TOOL_CALL_START', toolCallId: it.callId, toolCallName: it.name };
      yield { type: 'TOOL_CALL_ARGS', toolCallId: it.callId, delta: it.arguments };
      yield { type: 'TOOL_CALL_END', toolCallId: it.callId };
    } else if (it.type === 'reasoning') {
      yield { type: 'REASONING_MESSAGE_START', messageId: it.id, role: 'reasoning' };
      yield { type: 'REASONING_MESSAGE_CONTENT', messageId: it.id, delta: (it.content || []).map((c) => c.text).join('') };
      yield { type: 'REASONING_MESSAGE_END', messageId: it.id };
    }
  }
}

const fallida = (error) => ({ id: `err_${Date.now()}`, createdAt: Date.now(), status: 'failed', error, output: [] });

// Tope por pedido del usuario (el pedido y todas sus delegaciones): cuida la cuota diaria de IA si un agente se traba.
export const MAX_PASOS = 30;
const raiz = new Map(); // runId → run raíz
const pasos = new Map(); // run raíz → { n, ultimas: [llamadas] }
function controlar(trace) {
  if (!trace?.runId) return null;
  const r = trace.parentRunId ? raiz.get(trace.parentRunId) || trace.parentRunId : trace.runId;
  raiz.set(trace.runId, r);
  const c = pasos.get(r) || { n: 0, ultimas: [] };
  pasos.set(r, c);
  c.n++;
  if (c.n > MAX_PASOS) return { code: 'step_limit', message: `I stopped after ${MAX_PASOS} steps to protect the free AI quota. Try a simpler request.` };
  return c;
}

window.__turnos = [];
export const adaptador = {
  executeTurn(request, { signal, trace } = {}) {
    const control = controlar(trace);
    if (control?.code) return { stream: (async function* () {})(), complete: Promise.resolve(fallida(control)) };
    const complete = fetch('/api/insights/llm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cobra': '1' }, body: JSON.stringify(request), signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        return r.ok ? j : fallida(j.error || { code: String(r.status), message: 'The AI assistant is not available right now.' });
      })
      .catch((e) => (signal?.aborted ? { ...fallida({ code: 'cancelled', message: 'Cancelled' }), status: 'cancelled' } : fallida({ code: 'network', message: String(e?.message || e) })))
      .then((respuesta) => {
        window.__turnos.push({ request, respuesta, trace });
        // Si el agente repite la misma llamada tres veces seguidas, está trabado: se corta.
        const llamadas = respuesta.output?.filter((o) => o.type === 'function_call').map((o) => `${o.name}:${o.arguments}`).join('|');
        if (control && llamadas) {
          control.ultimas = [...control.ultimas, llamadas].slice(-3);
          if (control.ultimas.length === 3 && new Set(control.ultimas).size === 1) return fallida({ code: 'loop', message: 'The assistant got stuck repeating the same step, so I stopped it. Try rephrasing your request.' });
        }
        return respuesta;
      });
    return {
      stream: (async function* () {
        yield* eventosDe(await complete);
      })(),
      complete,
    };
  },
};

async function iniciar() {
  const [r, config] = await Promise.all([fetch('/api/estado'), fetch('/api/insights/config').then((x) => (x.ok ? x.json() : {})).catch(() => ({}))]);
  if (config.licencia) AgStudioLicenseManager.setLicenseKey(config.licencia);
  const estado = r.ok ? await r.json() : { facturas: [] };
  const params = new URLSearchParams(location.search);
  const ejemplo = params.has('ejemplo') || !estado.facturas.length;
  // Selector "My invoices / Sample data" y aviso cuando todavía no hay facturas propias.
  document.getElementById('btn-mios').setAttribute('aria-pressed', String(!ejemplo));
  document.getElementById('btn-ejemplo').setAttribute('aria-pressed', String(ejemplo));
  document.getElementById('btn-mios').addEventListener('click', () => location.assign('/insights.html'));
  document.getElementById('btn-ejemplo').addEventListener('click', () => location.assign('/insights.html?ejemplo=1'));
  const aviso = document.getElementById('aviso');
  if (ejemplo) {
    aviso.hidden = false;
    aviso.textContent = estado.facturas.length ? 'Showing sample data (fictional clients). Switch to "My invoices" to see yours.' : 'You have no invoices yet, so this is sample data (fictional clients). Bill your first client in the chat and your own numbers appear here.';
  }
  const datos = filas(ejemplo ? facturasEjemplo() : estado.facturas);
  const studio = createStudio(document.getElementById('studio'), {
    mode: 'edit',
    initialState: params.has('vacio') ? undefined : REPORTE,
    layout: { columns: 12, rowHeight: 40 },
    theme: TEMA,
    panels: { edit: { left: ['ai'], right: ['filters', 'edit', 'data'] } },
    data: {
      description: 'Invoices a freelancer sent with PayPal, one row per invoice.',
      sources: [{ id: 'invoices', name: 'Invoices', description: 'One row per PayPal invoice', data: datos, fields: CAMPOS }],
    },
    ai: ({ api }) => (window.__harness = crearHarness({ api, adapter: adaptador, contexto: { filas: () => datos, ejemplo: () => ejemplo } })),
    aiToolDisplay: VISTA_HERRAMIENTAS,
  });
  window.__studio = studio;
}

iniciar();
