// Guion del video de demo (< 3 min). Cada escena: narración (voz), rótulo (subtítulo corto) y lo que pasa en pantalla.
export const ESCENAS = [
  {
    id: 'intro',
    narracion: 'Meet Cobra: an AI collections agent for freelancers who get paid with PayPal. You tell it who to bill, and it handles the invoice, the reminders and the follow-up.',
  },
  {
    id: 'problema',
    narracion: 'Millions of freelancers in Latin America work for clients abroad. Doing the work is easy. Getting paid is not: tedious invoices, awkward reminders, and local tax caps that global tools ignore.',
  },
  {
    id: 'chat',
    rotulo: 'Plain-language request → structured invoice draft (Llama 3.3 on Workers AI)',
    narracion: 'This is the app, running live on the PayPal sandbox. I just write what I need. Llama 3.3 on Cloudflare Workers AI turns it into a structured draft: client, email, items, currency and due date. Nothing is sent until I confirm.',
  },
  {
    id: 'enviar',
    rotulo: 'PayPal Invoicing v2: next number → create → send',
    narracion: 'When I press Create and send, Cobra calls the PayPal Invoicing API. It gets the next invoice number, creates the invoice and sends it. I get the payment link, and a QR code to share.',
  },
  {
    id: 'paypal',
    rotulo: 'The real invoice on PayPal (sandbox)',
    narracion: 'And this is the real invoice on PayPal, ready for the client to pay.',
  },
  {
    id: 'voz',
    rotulo: 'Voice notes in Spanish, English or Portuguese',
    narracion: 'Freelancers here live on voice notes, so Cobra understands them too, in Spanish, English or Portuguese. Here is one in Spanish.',
  },
  // Sin narración: se escucha la nota de voz.
  { id: 'vozNota', rotulo: '🎙️ “Facturale a Delta Studio 500 dólares más por el mantenimiento de noviembre”' },
  {
    id: 'vozBorrador',
    rotulo: 'Whisper → Llama 3.3 → draft, with the client’s email from the previous invoice',
    narracion: 'Whisper transcribes the audio, Llama turns it into a draft, and Cobra fills in this client’s email from the previous invoice. One tap, and it is sent.',
  },
  {
    id: 'recordatorio',
    rotulo: 'AI-written reminder in the client’s language, sent by PayPal',
    narracion: 'Chasing payments is the worst part. I ask Cobra to remind Delta Studio, and it writes a friendly reminder in the client’s language. I can edit it before PayPal sends it. With auto-reminders on, Cobra follows up overdue invoices by itself.',
  },
  {
    id: 'pagado',
    rotulo: 'Payments: verified PayPal webhooks, or record one paid outside PayPal',
    narracion: 'When a client pays through PayPal, a verified webhook updates the invoice and Cobra tells me right away. If a client paid by bank transfer, I just say so, and Cobra records the payment in PayPal.',
  },
  {
    id: 'tablero',
    rotulo: 'Income in pesos (official and MEP rates) and Argentina’s monotributo cap',
    narracion: 'The dashboard shows what I collected and what is pending, converted to pesos at the official and MEP rates. It also tracks Argentina’s monotributo cap, so I know before I outgrow my tax category.',
  },
  {
    id: 'consulta',
    rotulo: 'Questions answered from real data, never invented',
    narracion: 'I can ask questions in plain language, and the answers come from my real data, never invented by the model.',
  },
  {
    id: 'cierre',
    narracion: 'Cobra. PayPal Invoicing and Webhooks, with Llama 3.3 and Whisper on Cloudflare Workers AI. Bill in one sentence, and let the agent do the chasing.',
  },
];

// Nota de voz que "dice" el usuario en la escena de voz (se le pasa a Chromium como micrófono).
export const NOTA_DE_VOZ = 'Facturale a Delta Studio quinientos dólares más por el mantenimiento de noviembre.';
