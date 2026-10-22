// Cobra dentro de AG Studio: un agente propio (armado con el Studio Agent Framework) que conoce las deudas,
// redacta recordatorios de pago y delega en los agentes de Studio cualquier cambio del tablero.
// Los recordatorios se mandan por PayPal solo cuando el usuario toca el botón del borrador.

const INSTRUCCIONES = `You are Cobra, the AI collections agent of a freelancer who bills clients with PayPal invoices.
You live inside the freelancer's Insights dashboard (AG Studio).

How to work:
- Questions about who owes money, overdue invoices, a client's debt or late payers: call who_owes_me and answer briefly with clients, amounts and days overdue.
- To chase a late payer: call draft_reminder for the invoice (the oldest overdue one if the user did not say which). The draft appears in the chat with a "Send via PayPal" button. Never say a reminder was sent: the user reviews it and sends it.
- Any change to the dashboard (add, change, move or remove charts, KPIs, tables, filters or pages) or any other data question: call delegate_to exactly like this: {"type": {"id": "lead"}, "instructions": "<the user's request>"}. "lead" is the only agent you can delegate to.
- Be concise and friendly. Answer in the user's language. Amounts are in USD unless the data says otherwise.`;

/** Deudas por cliente a partir de las filas del tablero. */
export function deudas(filas, { soloVencidas = false } = {}) {
  const porCliente = new Map();
  for (const f of filas) {
    if (!f.outstanding || (soloVencidas && !f.overdue_amount)) continue;
    const c = porCliente.get(f.client) || { client: f.client, outstanding: 0, overdue: 0, max_days_overdue: 0, invoices: [] };
    c.outstanding += f.outstanding;
    c.overdue += f.overdue_amount;
    c.max_days_overdue = Math.max(c.max_days_overdue, f.days_overdue);
    c.invoices.push({ invoice: f.invoice, amount: f.amount, currency: f.currency, due: f.due ? f.due.toISOString().slice(0, 10) : null, days_overdue: f.days_overdue, reminders_sent: f.reminders_sent });
    porCliente.set(f.client, c);
  }
  const clientes = [...porCliente.values()].sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding);
  for (const c of clientes) c.invoices.sort((a, b) => b.days_overdue - a.days_overdue);
  return {
    total_outstanding: clientes.reduce((s, c) => s + c.outstanding, 0),
    total_overdue: clientes.reduce((s, c) => s + c.overdue, 0),
    clients: clientes,
  };
}

/** Borrador local para los datos de ejemplo (no hay factura real en PayPal). */
function borradorEjemplo(f) {
  const vence = f.due ? f.due.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'its due date';
  return {
    subject: `Reminder: invoice ${f.invoice} is ${f.days_overdue ? 'overdue' : 'due soon'}`,
    note: `Hi ${f.client}, a friendly reminder that invoice ${f.invoice} for ${f.amount.toFixed(2)} ${f.currency} ${f.days_overdue ? `was due on ${vence}` : `is due on ${vence}`}. You can pay it securely with PayPal from the invoice link. Thank you!`,
  };
}

/** Las herramientas propias del agente de Cobra. */
export function herramientas(api, contexto) {
  const quienDebe = api.defineAiTool({
    name: 'who_owes_me',
    description: 'Unpaid invoices grouped by client: amounts outstanding and overdue, days overdue and reminders already sent. Sorted by overdue amount.',
    params: (s) => s.object({ overdue_only: s.boolean({ description: 'Only invoices past their due date' }).optional() }),
    execute: (args, ctx) => {
      const d = deudas(contexto.filas(), { soloVencidas: Boolean(args.overdue_only) });
      return ctx.success(JSON.stringify(d));
    },
  });

  const borrador = api.defineAiTool({
    name: 'draft_reminder',
    description: 'Draft a friendly payment reminder for one unpaid invoice. The draft is shown to the user with a "Send via PayPal" button; it is NOT sent by this tool.',
    params: (s) => s.object({ invoice: s.string({ description: 'Invoice number, for example "#1034"' }) }),
    execute: async (args, ctx) => {
      const numero = `#${String(args.invoice || '').replace(/^#/, '').trim()}`;
      const f = contexto.filas().find((x) => x.invoice === numero);
      if (!f) return ctx.error(`There is no invoice ${numero}. Call who_owes_me to see the unpaid ones.`);
      if (!f.outstanding) return ctx.error(`Invoice ${numero} is ${f.status.toLowerCase()}, there is nothing to chase.`);
      let datos;
      if (contexto.ejemplo() || !f.paypal_id) {
        datos = { ...borradorEjemplo(f), ejemplo: true };
      } else {
        const r = await fetch('/api/insights/recordatorio', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cobra': '1' }, body: JSON.stringify({ paypal_id: f.paypal_id }), signal: ctx.signal });
        if (!r.ok) return ctx.error('Could not draft the reminder right now. Try again.');
        const j = await r.json();
        datos = { subject: j.subject, note: j.note, paypal_id: f.paypal_id };
      }
      datos = { ...datos, invoice: f.invoice, client: f.client, amount: f.amount, currency: f.currency, days_overdue: f.days_overdue };
      return ctx.success(`Draft ready for ${f.client} (${f.invoice}). It is shown to the user with a "Send via PayPal" button. Tell the user to review it and send it; do not say it was sent.`, datos);
    },
  });

  return [quienDebe, borrador];
}

/** El borrador en el chat, con el botón que lo manda por PayPal (la confirmación humana). */
export class DetalleBorrador {
  init(params) {
    this.raiz = document.createElement('div');
    this.raiz.className = 'cobra-borrador';
    this.refresh(params);
  }
  getGui() {
    return this.raiz;
  }
  refresh(params) {
    const d = params.result?.success ? params.result.data : null;
    if (!d) {
      this.raiz.textContent = params.status === 'done' ? 'No draft.' : 'Writing the reminder…';
      return;
    }
    if (this.dibujado === d) return;
    this.dibujado = d;
    this.raiz.replaceChildren();
    const cab = document.createElement('p');
    cab.className = 'cobra-borrador-cab';
    cab.textContent = `${d.client} · ${d.invoice} · ${d.amount.toFixed(2)} ${d.currency}${d.days_overdue ? ` · ${d.days_overdue} days overdue` : ''}`;
    const asunto = document.createElement('input');
    asunto.value = d.subject;
    asunto.setAttribute('aria-label', 'Subject');
    const nota = document.createElement('textarea');
    nota.value = d.note;
    nota.rows = 5;
    nota.setAttribute('aria-label', 'Reminder');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'cobra-enviar';
    const estado = document.createElement('p');
    estado.className = 'cobra-borrador-estado';
    if (d.ejemplo) {
      boton.textContent = 'Send via PayPal';
      boton.disabled = true;
      estado.textContent = 'Sample data: switch to "My invoices" to send real reminders through PayPal.';
    } else {
      boton.textContent = 'Send via PayPal';
      boton.addEventListener('click', async () => {
        boton.disabled = true;
        estado.textContent = 'Sending through PayPal…';
        const r = await fetch(`/api/facturas/${encodeURIComponent(d.paypal_id)}/recordar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cobra': '1' }, body: JSON.stringify({ subject: asunto.value, note: nota.value }) }).catch(() => null);
        if (r?.ok) {
          estado.textContent = `✓ Sent. PayPal emailed the reminder to ${d.client}.`;
          boton.textContent = 'Sent';
        } else {
          estado.textContent = 'PayPal did not accept it. Try again in a moment.';
          boton.disabled = false;
        }
      });
    }
    this.raiz.append(cab, asunto, nota, boton, estado);
  }
}

export const VISTA_HERRAMIENTAS = {
  who_owes_me: { label: ({ status }) => ({ text: status === 'done' ? 'Checked who owes you' : 'Checking who owes you' }) },
  draft_reminder: { label: ({ args }) => ({ text: 'Payment reminder draft', pill: args.invoice || '' }), detail: DetalleBorrador },
};

export const SUGERENCIAS = [
  { label: 'Who owes me?', prompt: 'Who owes me money right now, and who is the most overdue?' },
  { label: 'Chase the most overdue', prompt: 'Draft a friendly reminder for the most overdue invoice.' },
  { label: 'Add a chart', prompt: 'Add a chart of the overdue amount by client.' },
];

/** El harness: Cobra al frente y los cinco agentes de Studio detrás, todos contra el mismo adaptador. */
export function crearHarness({ api, adapter, contexto }) {
  const { createAiHarness, directLlmRunner } = window.agStudio;
  const propias = herramientas(api, contexto);
  return createAiHarness(api, ({ tools, builtIn }) => ({
    agents: [
      directLlmRunner({
        id: 'cobra',
        name: 'Cobra',
        description: 'Your collections agent: who owes you, payment reminders through PayPal, and dashboard changes.',
        instructions: () => `${INSTRUCCIONES}\n\nToday is ${new Date().toISOString().slice(0, 10)}.${contexto.ejemplo() ? ' The dashboard is showing SAMPLE data, not real invoices.' : ''}`,
        tools: () => [...propias, tools.delegateTo(['lead'])],
        maxTurns: 8,
        adapter,
      }),
      ...Object.values(builtIn).map((def) => directLlmRunner({ ...def, adapter })),
    ],
    primary: 'cobra',
    promptStarters: SUGERENCIAS,
  }));
}
