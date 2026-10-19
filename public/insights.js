// Cobra Insights: tablero de AG Studio sobre las facturas del espacio (o datos de ejemplo).
import { facturasEjemplo } from './insights-ejemplo.js';

const { createStudio, createAiHarness, AgStudioLicenseManager, AgStudioModuleRegistry, AgStudioAiModule } = window.agStudio;
AgStudioModuleRegistry.registerModules([AgStudioAiModule]);

const fecha = (s) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00Z`) : null);
const DIA = 86_400_000;

/** Una fila por factura, con nombres pensados para el tablero y para el agente. */
function filas(facturas, hoy = Date.now()) {
  return facturas.map((f) => {
    const vence = fecha(f.vence);
    const vencida = f.estado !== 'PAID' && f.estado !== 'CANCELLED' && vence && vence.getTime() < hoy;
    return {
      invoice: `#${f.numero || '—'}`,
      client: f.cliente || f.email || 'Unknown',
      description: f.concepto || '',
      amount: Number(f.monto) || 0,
      currency: f.moneda || 'USD',
      status: f.estado === 'PAID' || f.estado === 'MARKED_AS_PAID' ? 'Paid' : f.estado === 'CANCELLED' ? 'Cancelled' : vencida ? 'Overdue' : 'Awaiting payment',
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
  { id: 'invoice', name: 'Invoice', format: 'textFormat', description: 'PayPal invoice number' },
  { id: 'client', name: 'Client', format: 'textFormat', description: 'Who the invoice was sent to' },
  { id: 'description', name: 'Description', format: 'textFormat' },
  { id: 'amount', name: 'Amount', format: 'currencyFormat', description: 'Invoice total in its currency (mostly USD)' },
  { id: 'currency', name: 'Currency', format: 'textFormat' },
  { id: 'status', name: 'Status', format: 'textFormat', description: 'Paid, Awaiting payment (not yet due), Overdue (past due date and unpaid) or Cancelled' },
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

window.__turnos = [];
export const adaptador = {
  executeTurn(request, { signal } = {}) {
    const complete = fetch('/api/insights/llm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cobra': '1' }, body: JSON.stringify(request), signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        return r.ok ? j : fallida(j.error || { code: String(r.status), message: 'The AI assistant is not available right now.' });
      })
      .catch((e) => (signal?.aborted ? { ...fallida({ code: 'cancelled', message: 'Cancelled' }), status: 'cancelled' } : fallida({ code: 'network', message: String(e?.message || e) })))
      .then((respuesta) => {
        window.__turnos.push({ request, respuesta });
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
  const r = await fetch('/api/estado');
  const estado = r.ok ? await r.json() : { facturas: [] };
  const ejemplo = new URLSearchParams(location.search).has('ejemplo') || !estado.facturas.length;
  const datos = filas(ejemplo ? facturasEjemplo() : estado.facturas);
  const studio = createStudio(document.getElementById('studio'), {
    mode: 'edit',
    panels: { edit: { left: ['ai'], right: ['filters', 'edit', 'data'] } },
    data: {
      description: 'Invoices a freelancer sent with PayPal, one row per invoice.',
      sources: [{ id: 'invoices', name: 'Invoices', description: 'One row per PayPal invoice', data: datos, fields: CAMPOS }],
    },
    ai: ({ api }) => (window.__harness = createAiHarness(api, { adapter: adaptador, primary: 'lead' })),
  });
  window.__studio = studio;
}

iniciar();
