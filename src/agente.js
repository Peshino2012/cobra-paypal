// El agente: convierte lo que escribe (o dice) el freelancer en una acción
// concreta. La IA (Workers AI) propone; el código valida y la persona confirma
// antes de que se envíe nada. Si la IA falla, hay un intérprete por reglas.

export const MODELO = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const INTENCIONES = ['create_invoice', 'send_reminder', 'cancel_invoice', 'mark_paid', 'query', 'help'];

export const ESQUEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: INTENCIONES },
    language: { type: 'string', enum: ['en', 'es', 'pt'] },
    reply: { type: 'string' },
    invoice: {
      type: 'object',
      properties: {
        client_name: { type: 'string' },
        client_email: { type: 'string' },
        currency: { type: 'string' },
        due_in_days: { type: 'integer' },
        note: { type: 'string' },
        items: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, quantity: { type: 'number' }, unit_price: { type: 'number' } }, required: ['description', 'unit_price'] } },
      },
    },
    target: { type: 'object', properties: { invoice_number: { type: 'string' }, client_name: { type: 'string' } } },
    filter: { type: 'string', enum: ['all', 'unpaid', 'overdue', 'paid'] },
  },
  required: ['intent', 'language', 'reply'],
};

export function promptSistema({ hoy, facturas = [], clientes = [] }) {
  const lista = facturas
    .slice(0, 30)
    .map((f) => `- #${f.numero} | ${f.cliente} <${f.email || '?'}> | ${f.monto} ${f.moneda} | ${f.estado} | due ${f.vence || '-'}`)
    .join('\n');
  return `You are Cobra, the invoicing assistant of a Latin American freelancer who bills clients abroad through PayPal.
Today is ${hoy}. Turn the user's message (English, Spanish or Portuguese, possibly a voice transcript) into ONE action, as JSON matching the schema.

Intents:
- create_invoice: the user wants to bill someone. Fill invoice.client_name, invoice.client_email (only if given or known from the client list), invoice.items (description in the client's likely language, quantity, unit_price as a number), invoice.currency (ISO code, default USD; "dólares"/"lucas verdes" = USD, "euros" = EUR), invoice.due_in_days (default 15), invoice.note (optional, short).
- send_reminder: remind a client about an unpaid invoice. Fill target.client_name and/or target.invoice_number.
- cancel_invoice: cancel an invoice. Fill target.
- mark_paid: the client paid outside PayPal (cash, bank transfer). Fill target.
- query: questions about money: who owes, how much was collected, overdue invoices, monotributo limits. Fill filter.
- help: anything else.

Rules: never invent emails or amounts. If something is missing, still choose the intent and leave the field empty. "reply" is ONE short sentence in the user's language describing what you understood. "language" is the user's language.
Known clients: ${clientes.length ? clientes.join(', ') : 'none yet'}.
Existing invoices:
${lista || '(none)'}`;
}

/** Normaliza la salida de la IA (o del intérprete por reglas). */
export function normalizar(j) {
  const intent = INTENCIONES.includes(j?.intent) ? j.intent : 'help';
  const language = ['en', 'es', 'pt'].includes(j?.language) ? j.language : 'en';
  const inv = j?.invoice || {};
  return {
    intent,
    language,
    reply: String(j?.reply || '').slice(0, 300),
    borrador:
      intent === 'create_invoice'
        ? {
            cliente: inv.client_name || '',
            email: inv.client_email || '',
            moneda: inv.currency || 'USD',
            dias: inv.due_in_days ?? 15,
            nota: inv.note || '',
            items: (inv.items || []).map((i) => ({ descripcion: i.description, cantidad: i.quantity ?? 1, precio: i.unit_price })),
          }
        : null,
    objetivo: j?.target ? { numero: j.target.invoice_number || null, cliente: j.target.client_name || null } : null,
    filtro: ['all', 'unpaid', 'overdue', 'paid'].includes(j?.filter) ? j.filter : 'all',
  };
}

const NUM = /(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?/;

function leerMonto(texto) {
  const m = texto.match(new RegExp(`(?:us\\$|u\\$s|\\$|€|usd|eur)?\\s*${NUM.source}\\s*(k|mil|lucas)?`, 'i'));
  if (!m) return null;
  let n = Number(m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.') + (m[2] ? `.${m[2]}` : ''));
  if (/k|mil|lucas/i.test(m[3] || '')) n *= 1000;
  return n > 0 ? n : null;
}

const PALABRAS = {
  es: /\b(el|la|los|las|de|del|que|por|para|me|mi|un|una|le|les|mandale|facturale|cobrale|recordale|recordatorio|quién|quien|cuánto|cuanto|deben|debe|pagó|pago|dólares|dolares|vence|días|dias|facturas?|cancelá|cancela|efectivo)\b/gi,
  en: /\b(the|to|for|of|me|my|a|an|invoice|bill|send|remind|reminder|who|how|much|owes|paid|due|days|cancel|cash)\b/gi,
};

/** Idioma del mensaje por palabras frecuentes; si empata, el del espacio de trabajo. */
export function detectarIdioma(texto, porDefecto = 'en') {
  if (/[ñ¿¡]|[áéíóú]/i.test(texto)) return 'es';
  const es = (texto.match(PALABRAS.es) || []).length;
  const en = (texto.match(PALABRAS.en) || []).length;
  return es > en ? 'es' : en > es ? 'en' : porDefecto;
}

/** Intérprete por reglas: respaldo cuando la IA no está disponible (y para tests). */
export function interpretarSinIA(texto, { clientes = [], idioma: idiomaPorDefecto = 'en' } = {}) {
  const t = String(texto || '');
  const language = detectarIdioma(t, idiomaPorDefecto);
  const email = t.match(/[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}/i)?.[0] || '';
  const palabra = (p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  // Nombre completo ("Globex Corp") o solo su primera palabra ("Globex").
  const clienteConocido = clientes.find((c) => palabra(c).test(t)) || clientes.find((c) => c.split(/\s+/)[0].length >= 3 && palabra(c.split(/\s+/)[0]).test(t));
  const cliente =
    clienteConocido ||
    t.match(/\b(?:[Ii]nvoice|[Bb]ill|[Cc]harge|[Ff]actur[aá](?:le)?|[Cc]obr[aá]le)\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*)/)?.[1] ||
    t.match(/\b(?:a|to|para)\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*)/)?.[1] ||
    '';
  if (/\b(record|remind|reclam|nudge)/i.test(t)) return normalizar({ intent: 'send_reminder', language, reply: '', target: { client_name: cliente } });
  if (/\b(cancel|anul)/i.test(t)) return normalizar({ intent: 'cancel_invoice', language, reply: '', target: { client_name: cliente } });
  if (/\b(pag[oó] en efectivo|me pag[oó]|paid (in )?cash|paid by (bank )?transfer|mark(ed)? (as )?paid|marc[aá] (como )?pagad)/i.test(t)) return normalizar({ intent: 'mark_paid', language, reply: '', target: { client_name: cliente } });
  if (/\?|\b(cu[aá]nto|qui[eé]n|qu[eé] facturas|deben|vencid|resumen|how much|who owes|overdue|summary|monotributo|cobr[eé])/i.test(t)) {
    const filtro = /vencid|overdue/i.test(t) ? 'overdue' : /deben|owes|unpaid|impag|pendient/i.test(t) ? 'unpaid' : /cobr[eé]|collected|paid/i.test(t) ? 'paid' : 'all';
    return normalizar({ intent: 'query', language, reply: '', filter: filtro });
  }
  if (/\b(factur|invoice|bill|cobrar?le|charge)/i.test(t)) {
    const monto = leerMonto(t.replace(email, ''));
    const moneda = /€|eur/i.test(t) ? 'EUR' : 'USD';
    const concepto = t.match(/\b(?:por|for)\s+(?:el |la |los |las |the )?(.+?)(?:,|\.|$| vence| due| a \d| in \d| en \d)/i)?.[1]?.trim() || '';
    const dias = Number(t.match(/(\d{1,2})\s*(?:días|dias|days)/i)?.[1] || 15);
    return normalizar({
      intent: 'create_invoice',
      language,
      reply: '',
      invoice: { client_name: cliente, client_email: email, currency: moneda, due_in_days: dias, items: monto ? [{ description: concepto || (language === 'es' ? 'Servicios profesionales' : 'Professional services'), quantity: 1, unit_price: monto }] : [] },
    });
  }
  return normalizar({ intent: 'help', language, reply: '' });
}

/** Interpreta el mensaje con Workers AI; si falla o no hay IA, usa reglas. */
export async function interpretar(ai, texto, contexto) {
  if (!ai) return { ...interpretarSinIA(texto, contexto), fuente: 'reglas' };
  try {
    const r = await ai.run(MODELO, {
      messages: [
        { role: 'system', content: promptSistema(contexto) },
        { role: 'user', content: String(texto).slice(0, 2000) },
      ],
      response_format: { type: 'json_schema', json_schema: ESQUEMA },
      max_tokens: 700,
      temperature: 0.1,
    });
    const j = typeof r?.response === 'string' ? JSON.parse(r.response) : r?.response;
    if (!j?.intent) throw new Error('respuesta sin intent');
    return { ...normalizar(j), fuente: 'ia' };
  } catch {
    return { ...interpretarSinIA(texto, contexto), fuente: 'reglas' };
  }
}

const PLANTILLAS = {
  en: (f) => ({ subject: `Friendly reminder: invoice #${f.numero}`, note: `Hi ${f.cliente}, just a friendly reminder that invoice #${f.numero} for ${f.monto.toFixed(2)} ${f.moneda} ${f.vencida ? `was due on ${f.vence}` : `is due on ${f.vence}`}. You can pay it securely with PayPal using the link in this email. Thank you!` }),
  es: (f) => ({ subject: `Recordatorio: factura #${f.numero}`, note: `Hola ${f.cliente}, te recuerdo que la factura #${f.numero} por ${f.monto.toFixed(2)} ${f.moneda} ${f.vencida ? `venció el ${f.vence}` : `vence el ${f.vence}`}. Podés pagarla de forma segura con PayPal desde el enlace de este correo. ¡Gracias!` }),
  pt: (f) => ({ subject: `Lembrete: fatura #${f.numero}`, note: `Olá ${f.cliente}, lembramos que a fatura #${f.numero} de ${f.monto.toFixed(2)} ${f.moneda} ${f.vencida ? `venceu em ${f.vence}` : `vence em ${f.vence}`}. Você pode pagar com segurança pelo PayPal usando o link deste e-mail. Obrigado!` }),
};

/** Asunto y texto del recordatorio, escrito por la IA en el idioma del cliente (o por plantilla). */
export async function redactarRecordatorio(ai, factura, idioma = 'en') {
  const base = (PLANTILLAS[idioma] || PLANTILLAS.en)(factura);
  if (!ai) return base;
  try {
    const r = await ai.run(MODELO, {
      messages: [
        { role: 'system', content: 'You write short, warm, professional payment reminders for freelancers. Never threaten. Max 350 characters for the note. Reply as JSON {"subject": string, "note": string}.' },
        { role: 'user', content: `Language: ${idioma}. Client: ${factura.cliente}. Invoice #${factura.numero} for ${factura.monto} ${factura.moneda}, ${factura.vencida ? `overdue since ${factura.vence}` : `due ${factura.vence}`}. Reminders already sent: ${factura.recordatorios || 0}. Concept: ${factura.concepto}.` },
      ],
      response_format: { type: 'json_schema', json_schema: { type: 'object', properties: { subject: { type: 'string' }, note: { type: 'string' } }, required: ['subject', 'note'] } },
      max_tokens: 300,
      temperature: 0.4,
    });
    const j = typeof r?.response === 'string' ? JSON.parse(r.response) : r?.response;
    if (!j?.subject || !j?.note) throw new Error('vacío');
    return { subject: String(j.subject).slice(0, 120), note: String(j.note).slice(0, 600) };
  } catch {
    return base;
  }
}

/** Transcribe una nota de voz con Whisper (Workers AI). */
export async function transcribir(ai, audio) {
  const bytes = new Uint8Array(audio);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await ai.run('@cf/openai/whisper-large-v3-turbo', { audio: btoa(s) });
  return String(r?.text || '').trim();
}
