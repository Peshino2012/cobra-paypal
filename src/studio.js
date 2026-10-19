// Puente entre los agentes de AG Studio (Cobra Insights) y Workers AI.
// AG Studio arma cada turno (conversación, instrucciones y herramientas) en el navegador y lo manda acá;
// el Worker lo pasa al modelo como un chat con herramientas (gpt-oss en Workers AI) y devuelve la salida
// en el formato de AG Studio. Las herramientas las ejecuta Studio en el navegador.

export const MODELO_STUDIO = '@cf/openai/gpt-oss-120b';
export const MAX_TURNOS_HORA = 80; // por espacio
export const MAX_TURNOS_DIA = 400; // entre todos los espacios, para cuidar la cuota de Workers AI
const MAX_BYTES = 300_000;

export class ErrorStudio extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

const texto = (partes = []) =>
  partes
    .map((p) => p.text ?? p.refusal ?? '')
    .filter(Boolean)
    .join('\n');

/** AgLlmRequest de AG Studio → pedido de chat con herramientas (el formato que acepta gpt-oss en Workers AI). */
export function aChat(pedido) {
  const messages = [];
  if (pedido.instructions) messages.push({ role: 'system', content: pedido.instructions });
  for (const it of pedido.input || []) {
    const ultimo = messages.at(-1);
    if (it.type === 'message' && (it.role === 'user' || it.role === 'system')) {
      messages.push({ role: it.role, content: texto(it.content) });
    } else if (it.type === 'message' && it.role === 'assistant') {
      const t = texto(it.content);
      if (t) messages.push({ role: 'assistant', content: t });
    } else if (it.type === 'function_call') {
      const llamada = { id: it.callId, type: 'function', function: { name: it.name, arguments: it.arguments || '{}' } };
      // Las llamadas seguidas (y el texto que las precede en el mismo turno) van en un solo mensaje del asistente.
      if (ultimo?.role === 'assistant') (ultimo.tool_calls ||= []).push(llamada);
      else messages.push({ role: 'assistant', content: null, tool_calls: [llamada] });
    } else if (it.type === 'function_call_output') {
      messages.push({ role: 'tool', tool_call_id: it.callId, content: typeof it.output === 'string' ? it.output : JSON.stringify(it.output) });
    }
    // Los razonamientos de turnos anteriores no se reenvían.
  }
  const cuerpo = { messages, reasoning_effort: 'low' };
  const tools = (pedido.tools || []).filter((t) => (t.kind || 'client') !== 'provided');
  if (tools.length) {
    cuerpo.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } } }));
    const tc = pedido.toolChoice;
    if (tc && typeof tc === 'object') cuerpo.tool_choice = { type: 'function', function: { name: tc.name } };
    else if (tc) cuerpo.tool_choice = tc;
  }
  if (pedido.responseFormat?.type === 'json') {
    cuerpo.response_format = { type: 'json_schema', json_schema: { name: pedido.responseFormat.name || 'respuesta', schema: pedido.responseFormat.schema, strict: false } };
  }
  return cuerpo;
}

/** Respuesta de chat (o de la API Responses) → AgLlmResponse de AG Studio. */
export function deChat(r, ahora = Date.now()) {
  let n = 0;
  const id = (prefijo) => `${prefijo}_${ahora.toString(36)}_${n++}`;
  const output = [];
  const msj = r?.choices?.[0]?.message;
  if (msj) {
    const razonamiento = msj.reasoning_content || msj.reasoning;
    if (razonamiento) output.push({ id: id('rs'), kind: 'output', type: 'reasoning', summary: [], content: [{ type: 'text', text: razonamiento }] });
    if (msj.content) output.push({ id: id('msg'), kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: msj.content, annotations: [] }] });
    for (const tc of msj.tool_calls || []) {
      output.push({ id: id('fc'), kind: 'output', type: 'function_call', callId: tc.id || id('call'), name: tc.function?.name, arguments: tc.function?.arguments || '{}', status: 'completed' });
    }
  }
  for (const it of r?.output || []) {
    if (it.type === 'message') {
      const t = texto(it.content);
      if (t) output.push({ id: it.id || id('msg'), kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: t, annotations: [] }] });
    } else if (it.type === 'function_call') {
      output.push({ id: it.id || id('fc'), kind: 'output', type: 'function_call', callId: it.call_id || it.id || id('call'), name: it.name, arguments: it.arguments || '{}', status: 'completed' });
    }
  }
  const u = r?.usage || {};
  const entrada = u.prompt_tokens ?? u.input_tokens;
  const salida = u.completion_tokens ?? u.output_tokens;
  const util = output.some((o) => o.type !== 'reasoning');
  return {
    id: r?.id || id('resp'),
    createdAt: ahora,
    status: util ? 'completed' : 'failed',
    ...(util ? {} : { error: { code: 'empty', message: 'The model returned no answer. Try again.' } }),
    output,
    ...(entrada != null ? { usage: { inputTokens: entrada, outputTokens: salida ?? 0, totalTokens: (entrada || 0) + (salida || 0) } } : {}),
    ...(u.neurons != null ? { neurons: u.neurons } : {}),
    model: MODELO_STUDIO,
  };
}

/** Valida el pedido que manda el navegador. */
export function validarPedido(pedido, bytes) {
  if (bytes > MAX_BYTES) throw new ErrorStudio(413, 'too_large', 'Request too large');
  if (!pedido || !Array.isArray(pedido.input) || !pedido.input.length) throw new ErrorStudio(400, 'bad_request', 'Missing input');
  if (pedido.input.length > 300 || (pedido.tools || []).length > 40) throw new ErrorStudio(400, 'bad_request', 'Too many items');
}

/** Cuenta el turno y corta si se pasa del límite por espacio o del límite diario general. */
export async function contarTurno(db, espacioId, ahora = new Date()) {
  const dia = ahora.toISOString().slice(0, 10);
  const hora = ahora.toISOString().slice(0, 13);
  const { results } = await db
    .prepare("SELECT (SELECT COALESCE(SUM(turnos), 0) FROM uso_studio WHERE dia = ?) AS dia, (SELECT COALESCE(SUM(turnos), 0) FROM uso_studio WHERE espacio_id = ? AND hora = ?) AS hora")
    .bind(dia, espacioId, hora)
    .all();
  const uso = results[0] || { dia: 0, hora: 0 };
  if (uso.dia >= MAX_TURNOS_DIA) throw new ErrorStudio(429, 'daily_limit', 'The AI assistant reached its daily limit. The dashboard keeps working; try the assistant again tomorrow.');
  if (uso.hora >= MAX_TURNOS_HORA) throw new ErrorStudio(429, 'hourly_limit', 'You used the AI assistant a lot in the last hour. Try again in a few minutes.');
  await db
    .prepare('INSERT INTO uso_studio (espacio_id, dia, hora, turnos) VALUES (?, ?, ?, 1) ON CONFLICT(espacio_id, hora) DO UPDATE SET turnos = turnos + 1')
    .bind(espacioId, dia, hora)
    .run();
}

/** Un turno de un agente de AG Studio. */
export async function turnoStudio(env, espacio, pedido, bytes) {
  validarPedido(pedido, bytes);
  if (!env.AI) throw new ErrorStudio(503, 'no_ai', 'AI is not available');
  await contarTurno(env.DB, espacio.id);
  const modelo = env.STUDIO_MODEL || MODELO_STUDIO;
  let r;
  try {
    r = await env.AI.run(modelo, aChat(pedido));
  } catch (e) {
    console.error('studio', e);
    const cuota = /4006|daily free allocation|neurons/i.test(String(e?.message || e));
    const error = new ErrorStudio(cuota ? 429 : 502, cuota ? 'ai_quota' : 'ai_error', cuota ? 'The free AI quota for today is used up. The dashboard keeps working; try the assistant again later.' : 'The AI model failed. Try again.');
    if (env.STUDIO_DEBUG) error.detalle = String(e?.message || e).slice(0, 6000);
    throw error;
  }
  return { ...deChat(r), model: modelo };
}
