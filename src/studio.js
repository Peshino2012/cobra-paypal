// Puente entre los agentes de AG Studio (Cobra Insights) y Workers AI.
// AG Studio arma cada turno (conversación, instrucciones y herramientas) en el navegador y lo manda acá;
// el Worker lo pasa al modelo en formato Responses de OpenAI (gpt-oss en Workers AI) y devuelve la salida
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

/** AgLlmRequest de AG Studio → cuerpo de la API Responses. */
export function aRespuestas(pedido, { modelo = MODELO_STUDIO } = {}) {
  const input = [];
  for (const it of pedido.input || []) {
    if (it.type === 'message' && (it.role === 'user' || it.role === 'system')) {
      input.push({ type: 'message', role: it.role, content: [{ type: 'input_text', text: texto(it.content) }] });
    } else if (it.type === 'message' && it.role === 'assistant') {
      const t = texto(it.content);
      if (t) input.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: t }] });
    } else if (it.type === 'function_call') {
      input.push({ type: 'function_call', call_id: it.callId, name: it.name, arguments: it.arguments || '{}' });
    } else if (it.type === 'function_call_output') {
      input.push({ type: 'function_call_output', call_id: it.callId, output: typeof it.output === 'string' ? it.output : JSON.stringify(it.output) });
    }
    // Los razonamientos de turnos anteriores no se reenvían.
  }
  const cuerpo = { model: modelo, input, reasoning: { effort: 'low' } };
  if (pedido.instructions) cuerpo.instructions = pedido.instructions;
  const tools = (pedido.tools || []).filter((t) => (t.kind || 'client') !== 'provided');
  if (tools.length) {
    cuerpo.tools = tools.map((t) => ({ type: 'function', name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } }));
    const tc = pedido.toolChoice;
    if (tc && typeof tc === 'object') cuerpo.tool_choice = { type: 'function', name: tc.name };
    else if (tc) cuerpo.tool_choice = tc;
  }
  if (pedido.responseFormat?.type === 'json') {
    cuerpo.text = { format: { type: 'json_schema', name: pedido.responseFormat.name || 'respuesta', schema: pedido.responseFormat.schema, strict: false } };
  }
  return cuerpo;
}

/** Respuesta de la API Responses (o de chat completions, por las dudas) → AgLlmResponse de AG Studio. */
export function deRespuestas(r, ahora = Date.now()) {
  let n = 0;
  const id = (prefijo) => `${prefijo}_${ahora.toString(36)}_${n++}`;
  const output = [];
  for (const it of r?.output || []) {
    if (it.type === 'message') {
      const t = texto(it.content);
      if (t) output.push({ id: it.id || id('msg'), kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: t, annotations: [] }] });
    } else if (it.type === 'function_call') {
      output.push({ id: it.id || id('fc'), kind: 'output', type: 'function_call', callId: it.call_id || it.id || id('call'), name: it.name, arguments: it.arguments || '{}', status: 'completed' });
    } else if (it.type === 'reasoning') {
      const t = texto(it.content) || texto(it.summary);
      if (t) output.push({ id: it.id || id('rs'), kind: 'output', type: 'reasoning', summary: [], content: [{ type: 'text', text: t }] });
    }
  }
  // Formato de chat completions (algunos modelos de Workers AI responden así).
  const msj = r?.choices?.[0]?.message;
  if (!output.length && msj) {
    if (msj.content) output.push({ id: id('msg'), kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: msj.content, annotations: [] }] });
    for (const tc of msj.tool_calls || []) {
      output.push({ id: id('fc'), kind: 'output', type: 'function_call', callId: tc.id || id('call'), name: tc.function?.name, arguments: tc.function?.arguments || '{}', status: 'completed' });
    }
  }
  const u = r?.usage || {};
  const entrada = u.input_tokens ?? u.prompt_tokens;
  const salida = u.output_tokens ?? u.completion_tokens;
  return {
    id: r?.id || id('resp'),
    createdAt: ahora,
    status: output.length ? 'completed' : 'failed',
    ...(output.length ? {} : { error: { code: 'empty', message: 'The model returned no output' } }),
    output,
    ...(entrada != null ? { usage: { inputTokens: entrada, outputTokens: salida ?? 0, totalTokens: (entrada || 0) + (salida || 0) } } : {}),
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
    r = await env.AI.run(modelo, aRespuestas(pedido, { modelo }));
  } catch (e) {
    const cuota = /4006|daily free allocation|neurons/i.test(String(e?.message || e));
    throw new ErrorStudio(cuota ? 429 : 502, cuota ? 'ai_quota' : 'ai_error', cuota ? 'The free AI quota for today is used up. The dashboard keeps working; try the assistant again later.' : 'The AI model failed. Try again.');
  }
  return { ...deRespuestas(r), model: modelo };
}
