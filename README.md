# Cobra 🐍💸 — the AI collections agent for freelancers paid with PayPal

**Tell Cobra who to bill, by text or voice note, in English, Spanish or Portuguese. It drafts the PayPal invoice, sends it once you confirm, chases late payers on its own and tracks what you earned in local currency, including Argentina's *monotributo* income cap.**

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) · PayPal Invoicing v2 + Webhooks (sandbox) · Cloudflare Workers AI (Llama 3.3 70B, Whisper, gpt-oss-120b) · [AG Studio](https://www.ag-grid.com/studio/) dashboards with its Agent Framework · Cloudflare Workers + D1.

▶️ **Demo video (2:30): https://youtu.be/wBQHYIgT1IA** · 🌐 **Live demo: https://cobra.peshino2012.workers.dev**

| Chat → draft → invoice | Reminders, payments and dashboard | Mobile |
|---|---|---|
| ![Draft](capturas/1-borrador.png) | ![Dashboard](capturas/3-tablero.png) | ![Mobile](capturas/4-celular.png) |

## The problem

Millions of freelancers in Latin America work for clients abroad and get paid through PayPal. The work is the easy part. The admin around getting paid is the hard part:

- **Invoices are tedious.** Opening a dashboard, filling forms in English and copying emails takes time, and often happens on a phone between other tasks.
- **Chasing payments is awkward.** Nobody enjoys writing the third "friendly reminder", so invoices sit unpaid for weeks.
- **Local rules are invisible to global tools.** An Argentine *monotributista* is expelled from the simplified tax regime if their yearly income passes a cap measured in **pesos at the official exchange rate**. No invoicing tool tracks that.

## What Cobra does

1. **Bill in one sentence or one voice note.** Examples: *"Facturale 800 dólares a Acme Corp por el rediseño del logo, ap@acme.com"* or *"Invoice Globex 1,200 USD for the landing page"*. Cobra extracts the client, email, line items, currency and due date into an **editable draft**.
2. **Human in the loop.** Nothing reaches a client until you press **Create & send**. Cobra then creates the invoice with PayPal (next invoice number, draft, send) and gives you the payment link and a QR code.
3. **It chases late payers for you.** Ask *"remind Initech"* and Cobra writes a warm reminder in the **client's** language, which you can edit before sending. With auto-reminders on, the agent reminds overdue clients by itself, at most every 3 days and at most 3 times.
4. **It knows when you get paid.** PayPal webhooks (`INVOICING.INVOICE.PAID`, signature verified through PayPal's API), plus a sync every 10 minutes, update the invoice and tell you in the chat: *"💸 Globex paid invoice #0002! $1,200 (≈ $1.686.000 at the official rate)"*.
5. **Money questions in plain language.** Ask *"who owes me money?"* or *"¿cuánto cobré?"*. Answers come from your real data and are never invented by the model.
6. **Local reality built in.** The dashboard shows:
   - income converted to pesos at the official and MEP rates;
   - a **monotributo meter** with the 2026 ARCA caps: how much of your category you used, when you would hit the cap at your current pace, and which category you will need.

## Cobra Insights: who owes you, at a glance (AG Studio)

**[/insights.html](https://cobra.peshino2012.workers.dev/insights.html)** is an [AG Studio](https://www.ag-grid.com/studio/) dashboard over your PayPal invoices, with an AI assistant that can both **chase payments** and **build the dashboard for you**.

| Dashboard | Cobra agent inside AG Studio |
|---|---|
| ![Insights](capturas/5-insights.png) | ![Cobra agent](capturas/6-insights-agente.png) |

- **A ready-made collections dashboard.** Outstanding, overdue, collected and average days to get paid; who owes you; collected per month; invoices by status; and an AG Grid table of overdue invoices. It is generated with AG Studio's own AI tools ([`e2e/armar-reporte.mjs`](e2e/armar-reporte.mjs)), so every widget is validated the same way the agents' changes are.
- **A custom widget: the Collections scoreboard.** Who owes you, as a friendly scoreboard instead of a collections report: one row per client, the amount owed, a bar and a colour-coded "days late" label ([`public/insights-marcador.js`](public/insights-marcador.js)).
- **A custom agent on the Studio Agent Framework.** Cobra is the front agent of the AI panel ([`public/insights-agente.js`](public/insights-agente.js)):
  - `who_owes_me` reads the unpaid invoices by client;
  - `draft_reminder` writes the reminder (the same AI writer as the chat) and shows it **inside the AI panel with a "Send via PayPal" button**: the agent never sends anything, the freelancer does, through PayPal Invoicing's `remind`;
  - anything about the dashboard itself ("add a chart of overdue by client") is delegated with `delegate_to` to AG Studio's built-in agents (lead → page → widget), which place and configure real widgets.
- **Your data or sample data.** New workspaces start with clearly labelled sample data; once you bill clients in the chat, "My invoices" shows yours.
- **Cobra theme.** Green for collected, red for overdue, on AG Studio's Theming API.

**How the AI runs:** AG Studio drives the agent loop in the browser through an `AgLlmAdapter` ([`public/insights.js`](public/insights.js)). Each turn goes to the Worker ([`src/studio.js`](src/studio.js)), which forwards it to **gpt-oss-120b on Workers AI** as a chat with tools and maps the answer back to AG Studio's format. Guardrails:
- Repairs a common tool-call mistake: the model writing `type: "page"` where the schema wants `type: { id: "page" }`.
- Caps every request at 30 steps and stops an agent that repeats the same call three times, to protect the free AI quota.
- Limits turns per workspace per hour, and per day overall.

## How PayPal and AI are used

| | What | Where |
|---|---|---|
| **PayPal Invoicing v2** | `generate-next-invoice-number`, create draft, `send`, `remind`, `cancel`, record external payment (`payments`), get and list invoices | [`src/paypal.js`](src/paypal.js) |
| **PayPal Webhooks** | Registers `INVOICING.INVOICE.*` events once and verifies every delivery with `verify-webhook-signature` before trusting it | [`src/index.js`](src/index.js) |
| **LLM: Llama 3.3 70B on Workers AI** | Turns free text (ES/EN/PT, slang like "lucas") into one structured action with **JSON-schema-constrained output**: create, remind, cancel, mark paid or query. It also writes reminders in the client's language. | [`src/agente.js`](src/agente.js) |
| **Speech: Whisper (large-v3-turbo) on Workers AI** | Voice notes, the way freelancers in LatAm actually communicate | [`src/agente.js`](src/agente.js) |
| **AG Studio + gpt-oss-120b on Workers AI** | Insights dashboard with a custom scoreboard widget, a custom Cobra agent (Studio Agent Framework) and AG Studio's built-in agents that build widgets on request; reminders drafted there are sent with PayPal `remind` | [`public/insights*.js`](public/insights.js), [`src/studio.js`](src/studio.js) |

### Guardrails

- **The model only proposes.** Code validates every field (emails, amounts, currencies, due dates) and you confirm every client-facing action.
- **No invented data.** The prompt forbids inventing emails or amounts. Missing fields are flagged in the draft for you to fill in.
- **Graceful degradation.** If the model fails or returns invalid JSON, a deterministic rule-based parser takes over, so the app keeps working.
- **Grounded answers.** Money totals come from the database, not from the LLM.

## Architecture

```mermaid
flowchart LR
  U[Freelancer<br/>text or voice] -->|/api/mensaje, /api/voz| W[Cloudflare Worker]
  W -->|Whisper, Llama 3.3 JSON mode| AI[Workers AI]
  W -->|Invoicing v2| PP[PayPal]
  PP -->|INVOICING.INVOICE.PAID webhook| W
  W <--> DB[(D1: invoices, chat, settings)]
  W -->|official and MEP rates| DA[DolarApi]
  C[Cron every 10 min] --> W
  W -->|sync and auto-reminders| PP
  CL[Client] -->|pays via PayPal link or QR| PP
```

- **One Worker** serves the static app and the JSON API.
- **D1** keeps a local copy of invoices, conversation history and settings. PayPal stays the source of truth.
- **Each browser gets its own workspace**, held in a signed, HttpOnly cookie, so judges can try it without signing up.
- **Security:**
  - Strict CSP with no inline scripts.
  - CSRF protection: every state-changing call needs a custom header.
  - Rate limit of 40 messages per hour per workspace.
  - Webhook signatures verified with PayPal.
  - Secrets live only in Cloudflare.

## Try it

**Hosted demo: https://cobra.peshino2012.workers.dev** (no sign-up: each browser gets its own workspace). Everything runs against the **PayPal sandbox**.

To pay an invoice as the client:
1. Open its payment link.
2. Log in with a sandbox *personal* account. Create one under PayPal Developer → Testing Tools → Sandbox Accounts.

**Run it locally with no accounts at all** (simulated PayPal and DolarApi, rule-based parser instead of the LLM):

```bash
npm install
node e2e/servidor-local.mjs      # http://127.0.0.1:8787
```

**Run it with the real PayPal sandbox and Workers AI:**

```bash
npx wrangler d1 migrations apply cobra --local
echo 'PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
SESSION_SECRET=any-long-random-string' > .dev.vars
npx wrangler dev
```

## Tests

```bash
npm test                  # 29 tests: agent parsing, AI fallback, PayPal client, money and tax math, full Worker flows, Insights AI bridge
node e2e/capturas.mjs     # end-to-end walkthrough in Chromium (draft → send → payment → reminder) + screenshots
```

The Worker tests drive the real request handlers against an in-memory D1 and a stateful fake PayPal, covering:
- chat to invoice;
- reminders, cancel and mark as paid;
- webhook with valid and forged signatures;
- cron auto-reminders and their 3-day cooldown;
- voice transcription;
- CSRF.

A separate workflow ([`paypal-sandbox.yml`](.github/workflows/paypal-sandbox.yml)) creates, reads and deletes a real draft in the PayPal sandbox every week. Another one ([`insights-ia.yml`](.github/workflows/insights-ia.yml)) runs the Insights assistant against the real model and saves screenshots, turns and token use.

## Roadmap

- WhatsApp channel, since freelancers already live there.
- Argentina's *Factura E*: pre-fill the export invoice that ARCA requires for each PayPal payment.
- More country packs: Brazil MEI caps and Mexico RESICO.
- Recurring invoices for retainers.

## License

MIT
