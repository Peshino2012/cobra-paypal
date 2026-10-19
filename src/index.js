// Cobra — Worker de Cloudflare: API del chat/agente, facturas de PayPal,
// webhook de pagos y un cron que sincroniza estados y persigue morosos.
import { interpretar, redactarRecordatorio, transcribir } from './agente.js';
import { validarBorrador, payloadPaypal, filaDesdePaypal } from './facturas.js';
import { crearPaypal, enlacePago, ErrorPaypal } from './paypal.js';
import { totales, enPesos, medidorMonotributo, vencida, ESTADOS_ABIERTA, ESTADOS_PAGADA, MONOTRIBUTO_2026_08 } from './finanzas.js';
import { obtenerCotizaciones } from './cotizacion.js';
import { firmarValor, leerValorFirmado, aBase64url } from './seguridad.js';
import { turnoStudio, ErrorStudio } from './studio.js';

const COOKIE = 'cobra_espacio';
const UN_ANIO = 365 * 24 * 3600;
const MAX_MENSAJES_HORA = 40;
const EVENTOS_PAYPAL = ['INVOICING.INVOICE.PAID', 'INVOICING.INVOICE.CANCELLED', 'INVOICING.INVOICE.UPDATED', 'INVOICING.INVOICE.REFUNDED'];

const json = (datos, status = 200, headers = {}) => Response.json(datos, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/* ---------------- Textos del asistente ---------------- */

const T = {
  en: {
    borrador: 'Here is the draft. Check it and press "Create & send" — nothing goes to the client until you confirm.',
    faltan: (c) => `I need a bit more: ${c.join(', ')}. Fill it in the draft below.`,
    campos: { cliente: 'client name', email: "client's email", items: 'what you are billing and the amount' },
    enviada: (f) => `Invoice #${f.numero} for ${f.monto.toFixed(2)} ${f.moneda} was sent to ${f.email}. I'll tell you as soon as it's paid.`,
    noEncontrada: "I couldn't find an open invoice for that client. Ask me \"who owes me money?\" to see them.",
    recordatorio: (f) => `Here is a reminder for ${f.cliente} (invoice #${f.numero}). Edit it if you want and press "Send reminder".`,
    recordatorioEnviado: (f) => `Reminder sent to ${f.cliente} for invoice #${f.numero}.`,
    cancelar: (f) => `Cancel invoice #${f.numero} for ${f.cliente} (${f.monto.toFixed(2)} ${f.moneda})?`,
    cancelada: (f) => `Invoice #${f.numero} was cancelled.`,
    pagada: (f) => `Done: invoice #${f.numero} is marked as paid.`,
    confirmarPago: (f) => `Mark invoice #${f.numero} for ${f.cliente} as paid outside PayPal?`,
    ayuda: 'I can invoice your clients through PayPal, chase late payments and tell you how you are doing. Try: "Invoice Acme Corp 800 USD for the logo redesign, ap@acme.com" or "Who owes me money?"',
    limite: 'You sent a lot of messages in the last hour. Try again in a few minutes.',
    nada: 'No invoices match that yet.',
    resumen: ({ cobrado, pendiente, vencido, nPend, nVenc, ars, medidor }) =>
      [
        `Collected in the last 12 months: ${cobrado}${ars ? ` (≈ ${ars} at the official rate)` : ''}.`,
        `Outstanding: ${pendiente} in ${nPend} invoice(s)${nVenc ? `, ${vencido} overdue in ${nVenc}` : ''}.`,
        medidor ? `Monotributo category ${medidor.categoria}: ${Math.round(medidor.proporcion * 100)}% of the annual cap used.` : '',
      ]
        .filter(Boolean)
        .join(' '),
  },
  es: {
    borrador: 'Acá está el borrador. Revisalo y tocá "Crear y enviar": no le llega nada al cliente hasta que confirmes.',
    faltan: (c) => `Me falta: ${c.join(', ')}. Completalo en el borrador.`,
    campos: { cliente: 'el nombre del cliente', email: 'el email del cliente', items: 'qué cobrás y cuánto' },
    enviada: (f) => `La factura #${f.numero} por ${f.monto.toFixed(2)} ${f.moneda} se envió a ${f.email}. Te aviso apenas la paguen.`,
    noEncontrada: 'No encontré una factura abierta de ese cliente. Preguntame "¿quién me debe?" para verlas.',
    recordatorio: (f) => `Este es el recordatorio para ${f.cliente} (factura #${f.numero}). Editalo si querés y tocá "Enviar recordatorio".`,
    recordatorioEnviado: (f) => `Le mandé el recordatorio a ${f.cliente} por la factura #${f.numero}.`,
    cancelar: (f) => `¿Cancelo la factura #${f.numero} de ${f.cliente} (${f.monto.toFixed(2)} ${f.moneda})?`,
    cancelada: (f) => `La factura #${f.numero} quedó cancelada.`,
    pagada: (f) => `Listo: la factura #${f.numero} quedó marcada como pagada.`,
    confirmarPago: (f) => `¿Marco la factura #${f.numero} de ${f.cliente} como pagada por fuera de PayPal?`,
    ayuda: 'Puedo facturarle a tus clientes por PayPal, perseguir los pagos atrasados y contarte cómo venís. Probá: "Facturale 800 dólares a Acme Corp por el rediseño del logo, ap@acme.com" o "¿Quién me debe?"',
    limite: 'Mandaste muchos mensajes en la última hora. Probá de nuevo en unos minutos.',
    nada: 'Todavía no hay facturas que coincidan.',
    resumen: ({ cobrado, pendiente, vencido, nPend, nVenc, ars, medidor }) =>
      [
        `Cobrado en los últimos 12 meses: ${cobrado}${ars ? ` (≈ ${ars} al oficial)` : ''}.`,
        `Pendiente: ${pendiente} en ${nPend} factura(s)${nVenc ? `, ${vencido} vencido en ${nVenc}` : ''}.`,
        medidor ? `Monotributo categoría ${medidor.categoria}: usaste el ${Math.round(medidor.proporcion * 100)}% del tope anual.` : '',
      ]
        .filter(Boolean)
        .join(' '),
  },
};
T.pt = T.en;
const textos = (idioma) => T[idioma] || T.en;

const dinero = (n, moneda) => new Intl.NumberFormat('en-US', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(n);
const pesos = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

/* ---------------- Espacio de trabajo (cookie firmada) ---------------- */

async function espacioDe(request, env) {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const id = m ? await leerValorFirmado(env.SESSION_SECRET, decodeURIComponent(m[1])) : null;
  if (id) {
    const e = await env.DB.prepare('SELECT * FROM espacios WHERE id = ?').bind(id).first();
    if (e) return { espacio: e, setCookie: null };
  }
  const nuevo = aBase64url(crypto.getRandomValues(new Uint8Array(12)));
  const idioma = /^es\b/i.test(request.headers.get('Accept-Language') || '') ? 'es' : 'en';
  await env.DB.prepare('INSERT INTO espacios (id, idioma, creado) VALUES (?, ?, ?)').bind(nuevo, idioma, new Date().toISOString()).run();
  const valor = await firmarValor(env.SESSION_SECRET, nuevo, UN_ANIO);
  return {
    espacio: await env.DB.prepare('SELECT * FROM espacios WHERE id = ?').bind(nuevo).first(),
    setCookie: `${COOKIE}=${encodeURIComponent(valor)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${UN_ANIO}`,
  };
}

const paypalDe = (env) => crearPaypal({ clientId: env.PAYPAL_CLIENT_ID, secret: env.PAYPAL_CLIENT_SECRET, base: env.PAYPAL_API || undefined });

async function facturasDe(env, espacioId) {
  const { results } = await env.DB.prepare('SELECT * FROM facturas WHERE espacio_id = ? ORDER BY creada DESC').bind(espacioId).all();
  return results;
}

async function guardarMensaje(env, espacioId, rol, texto, datos = null) {
  return env.DB.prepare('INSERT INTO mensajes (espacio_id, rol, texto, datos, creado) VALUES (?, ?, ?, ?, ?) RETURNING id, rol, texto, datos, creado')
    .bind(espacioId, rol, texto, datos ? JSON.stringify(datos) : null, new Date().toISOString())
    .first();
}

const mensajeApi = (m) => ({ id: m.id, rol: m.rol, texto: m.texto, datos: m.datos ? JSON.parse(m.datos) : null, creado: m.creado });

/** Guarda la factura que devolvió PayPal; si pasó a pagada, calcula los pesos del día. */
async function guardarFactura(env, inv, espacioId, extras = {}) {
  const f = filaDesdePaypal(inv, { espacioId });
  const previa = await env.DB.prepare('SELECT * FROM facturas WHERE paypal_id = ?').bind(f.paypal_id).first();
  let arsOficial = previa?.ars_oficial ?? null;
  let arsMep = previa?.ars_mep ?? null;
  if (ESTADOS_PAGADA.has(f.estado) && arsOficial == null && f.moneda === 'USD') {
    try {
      const p = enPesos(f.monto, await obtenerCotizaciones(env.DB, { url: env.DOLARAPI || undefined }));
      arsOficial = p.oficial;
      arsMep = p.mep;
    } catch {}
  }
  const ahora = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO facturas (paypal_id, espacio_id, numero, cliente, email, concepto, monto, moneda, estado, vence, url_pago, idioma, creada, pagada, ars_oficial, ars_mep, actualizada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(paypal_id) DO UPDATE SET numero = excluded.numero, cliente = CASE WHEN excluded.cliente = excluded.email THEN cliente ELSE excluded.cliente END, email = excluded.email, concepto = excluded.concepto, monto = excluded.monto,
       moneda = excluded.moneda, estado = excluded.estado, vence = excluded.vence, url_pago = COALESCE(excluded.url_pago, url_pago), pagada = excluded.pagada,
       ars_oficial = excluded.ars_oficial, ars_mep = excluded.ars_mep, actualizada = excluded.actualizada`,
  )
    .bind(f.paypal_id, previa?.espacio_id || espacioId, f.numero, f.cliente, f.email, f.concepto, f.monto, f.moneda, f.estado, f.vence, extras.url_pago || f.url_pago, extras.idioma || previa?.idioma || 'en', previa?.creada || ahora, f.pagada, arsOficial, arsMep, ahora)
    .run();
  return env.DB.prepare('SELECT * FROM facturas WHERE paypal_id = ?').bind(f.paypal_id).first();
}

/** Busca la factura abierta a la que se refiere el usuario (por número o cliente; la más vencida primero). */
function buscarFactura(facturas, objetivo, { abiertas = true } = {}) {
  const candidatas = facturas.filter((f) => (abiertas ? ESTADOS_ABIERTA.has(f.estado) : true));
  if (!objetivo) return candidatas.length === 1 ? candidatas[0] : null;
  const num = objetivo.numero?.replace(/^#/, '');
  if (num) {
    const f = candidatas.find((x) => x.numero === num || x.numero?.endsWith(num));
    if (f) return f;
  }
  const nombre = objetivo.cliente?.toLowerCase().trim();
  if (nombre) {
    const coinciden = candidatas.filter((x) => x.cliente?.toLowerCase().includes(nombre) || nombre.includes(x.cliente?.toLowerCase() || '\u0000'));
    return coinciden.sort((a, b) => (a.vence || '').localeCompare(b.vence || ''))[0] || null;
  }
  return null;
}

/* ---------------- Estado para la interfaz ---------------- */

async function estado(env, espacio) {
  const [facturas, { results: mensajes }] = await Promise.all([
    facturasDe(env, espacio.id),
    env.DB.prepare('SELECT * FROM (SELECT * FROM mensajes WHERE espacio_id = ? ORDER BY id DESC LIMIT 40) ORDER BY id').bind(espacio.id).all(),
  ]);
  let cotizaciones = [];
  try {
    cotizaciones = await obtenerCotizaciones(env.DB, { url: env.DOLARAPI || undefined });
  } catch {}
  const ahora = Date.now();
  return {
    espacio: { nombre: espacio.nombre, idioma: espacio.idioma, categoria: espacio.categoria, recordatoriosAuto: Boolean(espacio.recordatorios_auto) },
    facturas: facturas.map((f) => ({ ...f, vencida: vencida(f, ahora) })),
    totales: totales(facturas, ahora),
    medidor: medidorMonotributo(facturas, espacio.categoria),
    categorias: Object.keys(MONOTRIBUTO_2026_08),
    dolar: {
      oficial: cotizaciones.find((c) => c.casa === 'oficial')?.compra ?? null,
      mep: cotizaciones.find((c) => c.casa === 'bolsa')?.compra ?? null,
    },
    mensajes: mensajes.map(mensajeApi),
  };
}

/* ---------------- Chat ---------------- */

async function procesarMensaje(env, espacio, texto) {
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM mensajes WHERE espacio_id = ? AND rol = 'user' AND creado > ?").bind(espacio.id, desde).first();
  if (n >= MAX_MENSAJES_HORA) return { status: 429, mensajes: [mensajeApi({ id: 0, rol: 'assistant', texto: textos(espacio.idioma).limite, creado: new Date().toISOString() })] };

  const usuario = await guardarMensaje(env, espacio.id, 'user', texto);
  const facturas = await facturasDe(env, espacio.id);
  const clientes = [...new Set(facturas.map((f) => f.cliente).filter(Boolean))];
  const i = await interpretar(env.AI, texto, { hoy: new Date().toISOString().slice(0, 10), facturas, clientes, idioma: espacio.idioma });
  const t = textos(i.language);
  let respuesta;

  if (i.intent === 'create_invoice') {
    // Si el cliente ya existe, completamos su email.
    if (!i.borrador.email && i.borrador.cliente) {
      const nombre = i.borrador.cliente.toLowerCase().trim();
      const mismo = (f) => f.cliente?.toLowerCase() === nombre;
      const parecido = (f) => f.cliente && (f.cliente.toLowerCase().includes(nombre) || nombre.includes(f.cliente.toLowerCase()));
      const conocido = facturas.find((f) => f.email && mismo(f)) || facturas.find((f) => f.email && parecido(f));
      if (conocido) i.borrador.email = conocido.email;
    }
    const v = validarBorrador(i.borrador);
    const texto2 = v.ok ? t.borrador : t.faltan(v.faltan.map((c) => t.campos[c]));
    respuesta = await guardarMensaje(env, espacio.id, 'assistant', texto2, { tipo: 'borrador', borrador: v.borrador, faltan: v.faltan, idioma: i.language, fuente: i.fuente });
  } else if (['send_reminder', 'cancel_invoice', 'mark_paid'].includes(i.intent)) {
    const f = buscarFactura(facturas, i.objetivo);
    if (!f) {
      respuesta = await guardarMensaje(env, espacio.id, 'assistant', t.noEncontrada);
    } else if (i.intent === 'send_reminder') {
      const borrador = await redactarRecordatorio(env.AI, { ...f, vencida: vencida(f) }, f.idioma || 'en');
      respuesta = await guardarMensaje(env, espacio.id, 'assistant', t.recordatorio(f), { tipo: 'recordatorio', paypal_id: f.paypal_id, ...borrador });
    } else if (i.intent === 'cancel_invoice') {
      respuesta = await guardarMensaje(env, espacio.id, 'assistant', t.cancelar(f), { tipo: 'confirmar_cancelar', paypal_id: f.paypal_id });
    } else {
      respuesta = await guardarMensaje(env, espacio.id, 'assistant', t.confirmarPago(f), { tipo: 'confirmar_pago', paypal_id: f.paypal_id });
    }
  } else if (i.intent === 'query') {
    const ahora = Date.now();
    const filtradas = facturas.filter((f) =>
      i.filtro === 'overdue' ? vencida(f, ahora) : i.filtro === 'unpaid' ? ESTADOS_ABIERTA.has(f.estado) : i.filtro === 'paid' ? ESTADOS_PAGADA.has(f.estado) : true,
    );
    const tot = totales(facturas, ahora).USD || { cobrado: 0, pendiente: 0, vencido: 0, cantidadPendientes: 0, cantidadVencidas: 0 };
    const ars = facturas.filter((f) => ESTADOS_PAGADA.has(f.estado) && f.ars_oficial).reduce((s, f) => s + f.ars_oficial, 0);
    const texto2 = facturas.length
      ? t.resumen({
          cobrado: dinero(tot.cobrado, 'USD'),
          pendiente: dinero(tot.pendiente, 'USD'),
          vencido: dinero(tot.vencido, 'USD'),
          nPend: tot.cantidadPendientes,
          nVenc: tot.cantidadVencidas,
          ars: ars ? pesos(ars) : null,
          medidor: medidorMonotributo(facturas, espacio.categoria),
        })
      : t.nada;
    respuesta = await guardarMensaje(env, espacio.id, 'assistant', texto2, { tipo: 'lista', ids: filtradas.map((f) => f.paypal_id).slice(0, 20) });
  } else {
    respuesta = await guardarMensaje(env, espacio.id, 'assistant', t.ayuda);
  }
  return { status: 200, mensajes: [mensajeApi(usuario), mensajeApi(respuesta)] };
}

/* ---------------- Acciones sobre facturas ---------------- */

async function crearYEnviar(env, espacio, cuerpo) {
  const v = validarBorrador(cuerpo.borrador || {});
  const t = textos(cuerpo.idioma || espacio.idioma);
  if (!v.ok) return json({ error: t.faltan(v.faltan.map((c) => t.campos[c])) }, 400);
  const pp = paypalDe(env);
  const numero = await pp.siguienteNumero();
  const borrador = await pp.crearBorrador(payloadPaypal(v.borrador, { numero, emisor: espacio.nombre || undefined }));
  const envio = await pp.enviar(borrador.id, {});
  const inv = await pp.obtener(borrador.id);
  const f = await guardarFactura(env, inv, espacio.id, { url_pago: enlacePago(envio, inv), idioma: cuerpo.idiomaCliente || 'en' });
  const m = await guardarMensaje(env, espacio.id, 'assistant', t.enviada(f), { tipo: 'enviada', paypal_id: f.paypal_id, url_pago: f.url_pago });
  return json({ factura: f, mensaje: mensajeApi(m) });
}

async function accionFactura(env, espacio, id, accion, cuerpo) {
  const f = await env.DB.prepare('SELECT * FROM facturas WHERE paypal_id = ? AND espacio_id = ?').bind(id, espacio.id).first();
  if (!f) return json({ error: 'not found' }, 404);
  const t = textos(cuerpo.idioma || espacio.idioma);
  const pp = paypalDe(env);
  let texto;
  if (accion === 'recordar') {
    const subject = String(cuerpo.subject || '').slice(0, 120);
    const note = String(cuerpo.note || '').slice(0, 1000);
    await pp.recordar(f.paypal_id, { subject, note });
    await env.DB.prepare('UPDATE facturas SET recordatorios = recordatorios + 1, ultimo_recordatorio = ? WHERE paypal_id = ?').bind(new Date().toISOString(), f.paypal_id).run();
    texto = t.recordatorioEnviado(f);
  } else if (accion === 'cancelar') {
    await pp.cancelar(f.paypal_id, {});
    texto = t.cancelada(f);
  } else if (accion === 'pagada') {
    await pp.registrarPago(f.paypal_id, { metodo: cuerpo.metodo === 'CASH' ? 'CASH' : 'BANK_TRANSFER', monto: f.monto, moneda: f.moneda, fecha: new Date().toISOString().slice(0, 10) });
    texto = t.pagada(f);
  } else {
    return json({ error: 'acción desconocida' }, 400);
  }
  const actual = await guardarFactura(env, await pp.obtener(f.paypal_id), espacio.id);
  const m = await guardarMensaje(env, espacio.id, 'assistant', texto, { tipo: 'hecho', paypal_id: f.paypal_id });
  return json({ factura: actual, mensaje: mensajeApi(m) });
}

/** Trae de PayPal el estado de las facturas abiertas (hasta "limite" pedidos). */
async function sincronizar(env, { espacioId = null, limite = 20 } = {}) {
  const consulta = espacioId
    ? env.DB.prepare(`SELECT * FROM facturas WHERE espacio_id = ? AND estado IN ('SENT','UNPAID','PARTIALLY_PAID','SCHEDULED','PAYMENT_PENDING') ORDER BY actualizada LIMIT ?`).bind(espacioId, limite)
    : env.DB.prepare(`SELECT * FROM facturas WHERE estado IN ('SENT','UNPAID','PARTIALLY_PAID','SCHEDULED','PAYMENT_PENDING') ORDER BY actualizada LIMIT ?`).bind(limite);
  const { results } = await consulta.all();
  const pp = paypalDe(env);
  let cambiadas = 0;
  for (const f of results) {
    try {
      const inv = await pp.obtener(f.paypal_id);
      if (inv.status !== f.estado) cambiadas++;
      const nueva = await guardarFactura(env, inv, f.espacio_id);
      if (ESTADOS_PAGADA.has(nueva.estado) && !ESTADOS_PAGADA.has(f.estado)) await avisarPago(env, nueva);
    } catch {}
  }
  return { revisadas: results.length, cambiadas };
}

async function avisarPago(env, f) {
  const e = await env.DB.prepare('SELECT idioma FROM espacios WHERE id = ?').bind(f.espacio_id).first();
  const texto = e?.idioma === 'es' ? `💸 ¡${f.cliente} pagó la factura #${f.numero}! ${dinero(f.monto, f.moneda)}${f.ars_oficial ? ` (≈ ${pesos(f.ars_oficial)} al oficial)` : ''}.` : `💸 ${f.cliente} paid invoice #${f.numero}! ${dinero(f.monto, f.moneda)}${f.ars_oficial ? ` (≈ ${pesos(f.ars_oficial)} at the official rate)` : ''}.`;
  await guardarMensaje(env, f.espacio_id, 'assistant', texto, { tipo: 'pago', paypal_id: f.paypal_id });
}

/** El agente persigue solo: recordatorio a facturas vencidas, como mucho cada 3 días y hasta 3 veces. */
async function recordatoriosAutomaticos(env, { limite = 10, ahora = Date.now() } = {}) {
  const hace3dias = new Date(ahora - 3 * 86400000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT f.* FROM facturas f JOIN espacios e ON e.id = f.espacio_id
     WHERE e.recordatorios_auto = 1 AND f.estado IN ('SENT','UNPAID','PARTIALLY_PAID') AND f.recordatorios < 3
     AND (f.ultimo_recordatorio IS NULL OR f.ultimo_recordatorio < ?) ORDER BY f.vence LIMIT ?`,
  )
    .bind(hace3dias, limite * 3)
    .all();
  const pp = paypalDe(env);
  let enviados = 0;
  for (const f of results.filter((x) => vencida(x, ahora)).slice(0, limite)) {
    try {
      const r = await redactarRecordatorio(env.AI, { ...f, vencida: true }, f.idioma || 'en');
      await pp.recordar(f.paypal_id, r);
      await env.DB.prepare('UPDATE facturas SET recordatorios = recordatorios + 1, ultimo_recordatorio = ? WHERE paypal_id = ?').bind(new Date(ahora).toISOString(), f.paypal_id).run();
      const e = await env.DB.prepare('SELECT idioma FROM espacios WHERE id = ?').bind(f.espacio_id).first();
      await guardarMensaje(env, f.espacio_id, 'assistant', e?.idioma === 'es' ? `🤖 Le mandé un recordatorio automático a ${f.cliente} por la factura #${f.numero}, que está vencida.` : `🤖 I sent an automatic reminder to ${f.cliente} for overdue invoice #${f.numero}.`, { tipo: 'auto', paypal_id: f.paypal_id, subject: r.subject, note: r.note });
      enviados++;
    } catch {}
  }
  return enviados;
}

/** Registra el webhook de PayPal una sola vez (guarda su id para verificar firmas). */
async function asegurarWebhook(env) {
  if (!env.APP_URL?.startsWith('https://')) return null;
  const url = `${env.APP_URL}/api/paypal/webhook`;
  const ajuste = (clave) => env.DB.prepare('SELECT valor FROM ajustes WHERE clave = ?').bind(clave).first();
  const [guardado, guardadaUrl] = await Promise.all([ajuste('webhook_id'), ajuste('webhook_url')]);
  if (guardado && guardadaUrl?.valor === url) return guardado.valor;
  const pp = paypalDe(env);
  const webhooks = await pp.listarWebhooks();
  // Si cambió la dirección de la app, se borran los webhooks de Cobra que apuntan a la vieja.
  for (const w of webhooks) if (w.url !== url && w.url.endsWith('/api/paypal/webhook')) await pp.borrarWebhook(w.id).catch(() => {});
  const id = webhooks.find((w) => w.url === url)?.id || (await pp.crearWebhook(url, EVENTOS_PAYPAL)).id;
  const guardar = env.DB.prepare('INSERT OR REPLACE INTO ajustes (clave, valor) VALUES (?, ?)');
  await env.DB.batch([guardar.bind('webhook_id', id), guardar.bind('webhook_url', url)]);
  return id;
}

async function webhookPaypal(request, env) {
  const evento = await request.json().catch(() => null);
  const webhookId = (await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'webhook_id'").first())?.valor;
  if (!evento || !webhookId) return new Response('sin configurar', { status: 400 });
  const pp = paypalDe(env);
  if (!(await pp.verificarWebhook(request.headers, evento, webhookId))) return new Response('firma inválida', { status: 401 });
  const id = evento.resource?.invoice?.id || evento.resource?.id;
  const f = id && (await env.DB.prepare('SELECT * FROM facturas WHERE paypal_id = ?').bind(id).first());
  if (f) {
    const nueva = await guardarFactura(env, await pp.obtener(id), f.espacio_id);
    if (ESTADOS_PAGADA.has(nueva.estado) && !ESTADOS_PAGADA.has(f.estado)) await avisarPago(env, nueva);
  }
  return new Response('ok');
}

/* ---------------- Router ---------------- */

async function enrutar(request, env) {
  const url = new URL(request.url);
  const ruta = url.pathname;
  const metodo = request.method;

  if (metodo === 'POST' && ruta === '/api/paypal/webhook') return webhookPaypal(request, env);
  if (metodo === 'GET' && ruta === '/api/salud') return json({ ok: true });
  if (!ruta.startsWith('/api/')) return new Response('not found', { status: 404 });

  // Protección CSRF: las llamadas de la app llevan este encabezado (un formulario de otro sitio no puede ponerlo).
  if (metodo !== 'GET' && request.headers.get('X-Cobra') !== '1') return json({ error: 'forbidden' }, 403);

  const { espacio, setCookie } = await espacioDe(request, env);
  const con = (r) => {
    if (setCookie) r.headers.append('Set-Cookie', setCookie);
    return r;
  };

  if (metodo === 'GET' && ruta === '/api/estado') return con(json(await estado(env, espacio)));

  if (metodo === 'POST' && ruta === '/api/mensaje') {
    const { texto } = await request.json().catch(() => ({}));
    if (!texto || typeof texto !== 'string' || !texto.trim()) return con(json({ error: 'texto vacío' }, 400));
    const r = await procesarMensaje(env, espacio, texto.trim().slice(0, 2000));
    return con(json({ mensajes: r.mensajes }, r.status));
  }

  if (metodo === 'POST' && ruta === '/api/voz') {
    const audio = await request.arrayBuffer();
    if (!audio.byteLength || audio.byteLength > 5_000_000) return con(json({ error: 'audio inválido' }, 400));
    if (!env.AI) return con(json({ error: 'sin IA' }, 503));
    const texto = await transcribir(env.AI, audio);
    if (!texto) return con(json({ error: 'no se entendió el audio' }, 422));
    const r = await procesarMensaje(env, espacio, texto.slice(0, 2000));
    return con(json({ transcripcion: texto, mensajes: r.mensajes }, r.status));
  }

  if (metodo === 'POST' && ruta === '/api/facturas') return con(await crearYEnviar(env, espacio, await request.json().catch(() => ({}))));

  // Un turno de los agentes de Cobra Insights (AG Studio).
  if (metodo === 'POST' && ruta === '/api/insights/llm') {
    const crudo = await request.text();
    try {
      return con(json(await turnoStudio(env, espacio, JSON.parse(crudo || 'null'), crudo.length)));
    } catch (e) {
      if (e instanceof SyntaxError) return con(json({ error: { code: 'bad_request', message: 'Invalid JSON' } }, 400));
      if (e instanceof ErrorStudio) return con(json({ error: { code: e.codigo, message: e.message } }, e.status));
      throw e;
    }
  }

  const acc = ruta.match(/^\/api\/facturas\/([A-Za-z0-9-]+)\/(recordar|cancelar|pagada)$/);
  if (metodo === 'POST' && acc) return con(await accionFactura(env, espacio, acc[1], acc[2], await request.json().catch(() => ({}))));

  if (metodo === 'POST' && ruta === '/api/sincronizar') {
    const r = await sincronizar(env, { espacioId: espacio.id, limite: 20 });
    return con(json({ ...r, estado: await estado(env, espacio) }));
  }

  if (metodo === 'POST' && ruta === '/api/ajustes') {
    const b = await request.json().catch(() => ({}));
    const categoria = b.categoria in MONOTRIBUTO_2026_08 ? b.categoria : espacio.categoria;
    const idioma = ['en', 'es'].includes(b.idioma) ? b.idioma : espacio.idioma;
    const nombre = typeof b.nombre === 'string' ? b.nombre.trim().slice(0, 80) || null : espacio.nombre;
    const auto = typeof b.recordatoriosAuto === 'boolean' ? Number(b.recordatoriosAuto) : espacio.recordatorios_auto;
    await env.DB.prepare('UPDATE espacios SET categoria = ?, idioma = ?, nombre = ?, recordatorios_auto = ? WHERE id = ?').bind(categoria, idioma, nombre, auto, espacio.id).run();
    return con(json(await estado(env, { ...espacio, categoria, idioma, nombre, recordatorios_auto: auto })));
  }

  return con(json({ error: 'not found' }, 404));
}

export default {
  async fetch(request, env) {
    try {
      return await enrutar(request, env);
    } catch (e) {
      console.error(e);
      const mensaje = e instanceof ErrorPaypal ? `PayPal: ${e.message}` : 'Unexpected error';
      return json({ error: mensaje }, e instanceof ErrorPaypal && e.status < 500 ? 400 : 500);
    }
  },
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          await asegurarWebhook(env);
        } catch (e) {
          console.error('webhook', e);
        }
        await sincronizar(env, { limite: 25 });
        await recordatoriosAutomaticos(env, { limite: 8 });
      })(),
    );
  },
};

