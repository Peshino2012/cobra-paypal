// Puente de Cobra Insights (AG Studio) ↔ Workers AI: traducción de formatos, límites y la ruta del Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { aRespuestas, deRespuestas, contarTurno, MAX_TURNOS_HORA, MODELO_STUDIO } from '../src/studio.js';
import { crearD1 } from './d1-falsa.js';

const pedido = {
  instructions: 'You are the Orchestrator.',
  input: [
    { id: 'u1', kind: 'input', type: 'message', role: 'user', status: 'completed', content: [{ type: 'text', text: 'Who owes me the most?' }] },
    { id: 'r1', kind: 'output', type: 'reasoning', summary: [], content: [{ type: 'text', text: 'pensando' }] },
    { id: 'f1', kind: 'output', type: 'function_call', callId: 'call_1', name: 'view_schema', arguments: '{}' },
    { kind: 'input', type: 'function_call_output', callId: 'call_1', output: '{"tables":["invoices"]}', status: 'completed' },
    { id: 'a1', kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: 'Looking…', annotations: [] }] },
  ],
  tools: [
    { name: 'view_schema', description: 'See the tables', parameters: { type: 'object', properties: {} } },
    { name: 'web', description: 'hosted', parameters: {}, kind: 'provided' },
  ],
  toolChoice: { name: 'view_schema' },
  responseFormat: { type: 'text' },
};

test('el pedido de AG Studio se traduce al formato Responses', () => {
  const b = aRespuestas(pedido);
  assert.equal(b.model, MODELO_STUDIO);
  assert.equal(b.instructions, 'You are the Orchestrator.');
  assert.deepEqual(b.input, [
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Who owes me the most?' }] },
    { type: 'function_call', call_id: 'call_1', name: 'view_schema', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call_1', output: '{"tables":["invoices"]}' },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Looking…' }] },
  ]);
  assert.deepEqual(b.tools, [{ type: 'function', name: 'view_schema', description: 'See the tables', parameters: { type: 'object', properties: {} } }], 'sin las herramientas del proveedor');
  assert.deepEqual(b.tool_choice, { type: 'function', name: 'view_schema' });
  assert.equal(b.text, undefined);

  const j = aRespuestas({ ...pedido, toolChoice: 'auto', responseFormat: { type: 'json', name: 'plan', schema: { type: 'object' } } });
  assert.equal(j.tool_choice, 'auto');
  assert.deepEqual(j.text, { format: { type: 'json_schema', name: 'plan', schema: { type: 'object' }, strict: false } });
});

test('la respuesta del modelo vuelve en el formato de AG Studio', () => {
  const r = deRespuestas(
    {
      id: 'resp_1',
      output: [
        { type: 'reasoning', id: 'rs_1', content: [{ type: 'reasoning_text', text: 'Necesito el esquema' }] },
        { type: 'function_call', id: 'fc_1', call_id: 'call_9', name: 'view_schema', arguments: '{}' },
        { type: 'message', id: 'msg_1', content: [{ type: 'output_text', text: 'Northwind Labs owes the most.' }] },
      ],
      usage: { input_tokens: 4000, output_tokens: 120 },
    },
    1000,
  );
  assert.equal(r.status, 'completed');
  assert.deepEqual(r.usage, { inputTokens: 4000, outputTokens: 120, totalTokens: 4120 });
  assert.deepEqual(r.output, [
    { id: 'rs_1', kind: 'output', type: 'reasoning', summary: [], content: [{ type: 'text', text: 'Necesito el esquema' }] },
    { id: 'fc_1', kind: 'output', type: 'function_call', callId: 'call_9', name: 'view_schema', arguments: '{}', status: 'completed' },
    { id: 'msg_1', kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: 'Northwind Labs owes the most.', annotations: [] }] },
  ]);

  const chat = deRespuestas({ choices: [{ message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'view_page', arguments: '{"pageId":"p1"}' } }] } }] });
  assert.equal(chat.output[0].type, 'function_call');
  assert.equal(chat.output[0].name, 'view_page');

  const vacia = deRespuestas({ output: [] });
  assert.equal(vacia.status, 'failed');
});

test('límite de turnos por espacio y por hora', async () => {
  const db = crearD1();
  const ahora = new Date('2026-10-20T15:10:00Z');
  for (let i = 0; i < MAX_TURNOS_HORA; i++) await contarTurno(db, 'e1', ahora);
  await assert.rejects(contarTurno(db, 'e1', ahora), (e) => e.status === 429 && e.codigo === 'hourly_limit');
  await contarTurno(db, 'e2', ahora); // otro espacio sigue pudiendo
  await contarTurno(db, 'e1', new Date('2026-10-20T16:01:00Z')); // y en la hora siguiente también
});

test('la ruta /api/insights/llm llama al modelo y valida el pedido', async () => {
  const llamadas = [];
  const env = {
    DB: crearD1(),
    SESSION_SECRET: 's',
    APP_URL: 'https://cobra.test',
    AI: {
      async run(modelo, cuerpo) {
        llamadas.push({ modelo, cuerpo });
        return { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hola' }] }], usage: { input_tokens: 10, output_tokens: 2 } };
      },
    },
  };
  const pedir = (cuerpo, headers = { 'X-Cobra': '1' }) => worker.fetch(new Request('https://cobra.test/api/insights/llm', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: cuerpo }), env);

  const ok = await pedir(JSON.stringify(pedido));
  assert.equal(ok.status, 200);
  const datos = await ok.json();
  assert.equal(datos.output[0].content[0].text, 'Hola');
  assert.equal(llamadas[0].modelo, MODELO_STUDIO);
  assert.equal(llamadas[0].cuerpo.input.length, 4);

  assert.equal((await pedir(JSON.stringify(pedido), {})).status, 403, 'sin el encabezado anti-CSRF');
  assert.equal((await pedir('{no es json')).status, 400);
  assert.equal((await pedir(JSON.stringify({ input: [] }))).status, 400);
  assert.equal((await pedir(JSON.stringify({ ...pedido, relleno: 'x'.repeat(400_000) }))).status, 413);

  env.AI.run = async () => {
    throw new Error('4006: you have used up your daily free allocation of 10,000 neurons');
  };
  const cuota = await pedir(JSON.stringify(pedido));
  assert.equal(cuota.status, 429);
  assert.equal((await cuota.json()).error.code, 'ai_quota');
});
