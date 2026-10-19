// Prueba qué formatos de pedido acepta un modelo de Workers AI (por REST) y guarda las respuestas.
//   node e2e/formatos-ia.mjs @cf/openai/gpt-oss-120b > salida.json
const URL_AI = (m) => `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${m}`;
const herramienta = { name: 'view_schema', description: 'View the data schema', parameters: { type: 'object', properties: { table: { type: 'string' } }, required: [] } };
const VARIANTES = {
  responses_plano: { input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Call view_schema for the invoices table.' }] }], instructions: 'Use tools.', tools: [{ type: 'function', ...herramienta }], reasoning: { effort: 'low' } },
  responses_anidado: { input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Call view_schema for the invoices table.' }] }], instructions: 'Use tools.', tools: [{ type: 'function', function: herramienta }], reasoning: { effort: 'low' } },
  responses_texto: { input: 'Call view_schema for the invoices table.', instructions: 'Use tools.', tools: [{ type: 'function', ...herramienta }] },
  chat: { messages: [{ role: 'system', content: 'Use tools.' }, { role: 'user', content: 'Call view_schema for the invoices table.' }], tools: [{ type: 'function', function: herramienta }] },
  chat_plano: { messages: [{ role: 'system', content: 'Use tools.' }, { role: 'user', content: 'Call view_schema for the invoices table.' }], tools: [{ type: 'function', ...herramienta }] },
};
const salida = {};
for (const modelo of process.argv.slice(2)) {
  for (const [n, cuerpo] of Object.entries(VARIANTES)) {
    const r = await fetch(URL_AI(modelo), { method: 'POST', headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    salida[`${modelo} ${n}`] = { status: r.status, cuerpo: (await r.text()).slice(0, 3000) };
  }
}
console.log(JSON.stringify(salida, null, 2));
