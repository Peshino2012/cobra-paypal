// Guion del video de demo (< 3 min). Cada escena: narración (voz), rótulo (subtítulo corto) y lo que pasa en pantalla.
export const ESCENAS = [
  {
    id: 'intro',
    narracion: 'Meet Cobra: an AI collections agent for freelancers who get paid with PayPal. You tell it who to bill, and it handles the invoice, the reminders and the follow-up.',
  },
  {
    id: 'problema',
    narracion: 'Freelancers in Latin America bill clients abroad, and getting paid is the hard part: tedious invoices, awkward reminders, and local tax caps that global tools ignore.',
  },
  {
    id: 'chat',
    rotulo: 'Plain-language request → structured invoice draft (Llama 3.3 on Workers AI)',
    narracion: 'This is the app, live on the PayPal sandbox. I write what I need, and Llama 3.3 on Workers AI turns it into a draft: client, email, items, currency and due date. Nothing is sent until I confirm.',
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
    narracion: 'I ask Cobra to remind Delta Studio, and it writes a friendly reminder in the client’s language, which I can edit before PayPal sends it. With auto-reminders on, it chases overdue invoices by itself.',
  },
  {
    id: 'pagado',
    rotulo: 'Payments: verified PayPal webhooks, or record one paid outside PayPal',
    narracion: 'When a client pays through PayPal, a verified webhook updates the invoice. If they paid by bank transfer, I just say so, and Cobra records it in PayPal.',
  },
  {
    id: 'tablero',
    rotulo: 'Income in pesos (official and MEP rates) and Argentina’s monotributo cap',
    narracion: 'The dashboard shows collected and pending income in pesos, at the official and MEP rates, and tracks Argentina’s monotributo cap.',
  },
  {
    id: 'insights',
    rotulo: 'Cobra Insights: an AG Studio report + our own “Collections scoreboard” widget · sample data',
    narracion: 'For the bigger picture, there is Cobra Insights, built with AG Studio and shown here with sample data. Our own scoreboard widget ranks who owes the most, and how late they are.',
  },
  {
    id: 'insightsAgente',
    rotulo: 'Cobra’s agent (Studio Agent Framework + gpt-oss-120b): editable draft → “Send via PayPal”',
    narracion: 'Cobra’s agent lives in the AI panel. It reads the data and drafts a reminder for the most overdue client, which I can edit and send through PayPal.',
  },
  {
    id: 'insightsGrafico',
    rotulo: 'Cobra hands off to AG Studio’s built-in agents, which add the chart',
    narracion: 'Need a new chart? Cobra hands the job to AG Studio’s own agents, which build it right on the canvas, all running on Cloudflare Workers AI.',
  },
  {
    id: 'cierre',
    narracion: 'Cobra. PayPal Invoicing and Webhooks, AG Studio for insights, and Workers AI underneath. Bill in one sentence, and let the agent do the chasing.',
  },
];

// Nota de voz que "dice" el usuario en la escena de voz (se le pasa a Chromium como micrófono).
export const NOTA_DE_VOZ = 'Facturale a Delta Studio quinientos dólares más por el mantenimiento de noviembre.';
