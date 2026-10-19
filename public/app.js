// Cobra — interfaz: chat con el agente, tarjetas de confirmación y tablero.
import qrcode from './vendor/qrcode.js';

const $ = (id) => document.getElementById(id);

const I18N = {
  en: {
    tagline: 'Your AI collections agent', sandbox: 'PayPal sandbox', insights: 'Insights', ajustes: 'Settings', enviar: 'Send', voz: 'Record a voice note',
    placeholder: 'Invoice Acme Corp 800 USD for the logo, ap@acme.com', grabando: 'Recording… tap the mic again to send.',
    cobrado: 'Collected (12 months)', pendiente: 'Outstanding', vencido: 'Overdue', monotributo: 'Monotributo (Argentina)', dolarHoy: 'USD today', oficial: 'official',
    facturas: 'Invoices', sincronizar: 'Sync with PayPal', sinFacturas: 'No invoices yet. Ask Cobra to bill your first client.',
    tuNombre: 'Your name (shown on invoices)', categoria: 'Monotributo category', autoRec: 'Let Cobra remind overdue clients automatically (max. 3 reminders, every 3 days)',
    cerrar: 'Close', guardar: 'Save', qrTitulo: 'Payment link', qrNota: 'Your client can scan it to pay with PayPal.',
    borrador: 'Invoice draft', cliente: 'Client', email: 'Client email', moneda: 'Currency', plazo: 'Due in (days)', nota: 'Note to client (optional)', idiomaCliente: 'Client language',
    concepto: 'Description', cant: 'Qty', precio: 'Price', agregarItem: '+ Add line', total: 'Total', crearEnviar: 'Create & send with PayPal', descartar: 'Discard',
    recordatorio: 'Reminder', asunto: 'Subject', mensaje: 'Message', enviarRecordatorio: 'Send reminder', confirmar: 'Confirm', cancelarFactura: 'Cancel invoice', marcarPagada: 'Mark as paid',
    abrirPago: 'Open payment page', verQr: 'QR', recordar: 'Remind', pagada: 'Paid', cancelar: 'Cancel', copiarLink: 'Copy link', copiado: 'Link copied',
    vence: 'due', vencio: 'overdue since', hecho: 'Done', error: 'Something went wrong', escuchando: 'Transcribing…', pensando: 'Thinking…', descartado: 'Draft discarded',
    usado: (p, tope) => `${p}% of the ${tope} annual cap used`, estimado: (f) => ` · at this pace you reach it around ${f}`, sugerida: (c) => ` · suggested category: ${c}`,
    sugerencias: ['Invoice Acme Corp 800 USD for the logo redesign, ap@acme.com', 'Who owes me money?', 'Remind overdue clients', '¿Cuánto cobré este año?'],
    estados: { DRAFT: 'Draft', SENT: 'Sent', UNPAID: 'Unpaid', PAID: 'Paid', MARKED_AS_PAID: 'Paid (outside PayPal)', CANCELLED: 'Cancelled', PARTIALLY_PAID: 'Partially paid', REFUNDED: 'Refunded', SCHEDULED: 'Scheduled', PAYMENT_PENDING: 'Payment pending' },
    vencidaChip: 'Overdue', recordatorios: (n) => `${n} reminder${n === 1 ? '' : 's'}`, sinMicrofono: 'Microphone not available in this browser',
  },
  es: {
    tagline: 'Tu agente de cobranzas con IA', sandbox: 'PayPal sandbox', insights: 'Tablero', ajustes: 'Ajustes', enviar: 'Enviar', voz: 'Grabar un audio',
    placeholder: 'Facturale 800 dólares a Acme Corp por el logo, ap@acme.com', grabando: 'Grabando… tocá el micrófono otra vez para enviar.',
    cobrado: 'Cobrado (12 meses)', pendiente: 'Pendiente', vencido: 'Vencido', monotributo: 'Monotributo', dolarHoy: 'Dólar hoy', oficial: 'oficial',
    facturas: 'Facturas', sincronizar: 'Sincronizar con PayPal', sinFacturas: 'Todavía no hay facturas. Pedile a Cobra que le facture a tu primer cliente.',
    tuNombre: 'Tu nombre (aparece en las facturas)', categoria: 'Categoría de monotributo', autoRec: 'Que Cobra le recuerde solo a los clientes con facturas vencidas (máx. 3 recordatorios, cada 3 días)',
    cerrar: 'Cerrar', guardar: 'Guardar', qrTitulo: 'Link de pago', qrNota: 'Tu cliente lo escanea para pagar con PayPal.',
    borrador: 'Borrador de factura', cliente: 'Cliente', email: 'Email del cliente', moneda: 'Moneda', plazo: 'Vence en (días)', nota: 'Nota para el cliente (opcional)', idiomaCliente: 'Idioma del cliente',
    concepto: 'Concepto', cant: 'Cant.', precio: 'Precio', agregarItem: '+ Agregar línea', total: 'Total', crearEnviar: 'Crear y enviar por PayPal', descartar: 'Descartar',
    recordatorio: 'Recordatorio', asunto: 'Asunto', mensaje: 'Mensaje', enviarRecordatorio: 'Enviar recordatorio', confirmar: 'Confirmar', cancelarFactura: 'Cancelar factura', marcarPagada: 'Marcar como pagada',
    abrirPago: 'Abrir página de pago', verQr: 'QR', recordar: 'Recordar', pagada: 'Pagada', cancelar: 'Cancelar', copiarLink: 'Copiar link', copiado: 'Link copiado',
    vence: 'vence', vencio: 'vencida desde', hecho: 'Listo', error: 'Algo salió mal', escuchando: 'Transcribiendo…', pensando: 'Pensando…', descartado: 'Borrador descartado',
    usado: (p, tope) => `Usaste el ${p}% del tope anual de ${tope}`, estimado: (f) => ` · a este ritmo llegás cerca del ${f}`, sugerida: (c) => ` · categoría sugerida: ${c}`,
    sugerencias: ['Facturale 800 dólares a Acme Corp por el rediseño del logo, ap@acme.com', '¿Quién me debe?', 'Recordale a los que están vencidos', 'How much did I collect?'],
    estados: { DRAFT: 'Borrador', SENT: 'Enviada', UNPAID: 'Impaga', PAID: 'Pagada', MARKED_AS_PAID: 'Pagada (fuera de PayPal)', CANCELLED: 'Cancelada', PARTIALLY_PAID: 'Pagada en parte', REFUNDED: 'Reembolsada', SCHEDULED: 'Programada', PAYMENT_PENDING: 'Pago pendiente' },
    vencidaChip: 'Vencida', recordatorios: (n) => `${n} recordatorio${n === 1 ? '' : 's'}`, sinMicrofono: 'El micrófono no está disponible en este navegador',
  },
};

let estado = null;
let idioma = 'en';
const t = (k) => I18N[idioma][k] ?? I18N.en[k] ?? k;

/* ---------------- Utilidades ---------------- */

function el(tag, props = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...hijos.flat().filter((h) => h != null && h !== false));
  return e;
}

const dinero = (n, moneda = 'USD') => new Intl.NumberFormat(idioma === 'es' ? 'es-AR' : 'en-US', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(n || 0);
const pesos = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const fecha = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(idioma === 'es' ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short' }) : '');

let toastTimer;
function toast(msg) {
  const e = $('toast');
  e.textContent = msg;
  e.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (e.hidden = true), 3500);
}

// Pedidos en curso que cambian el chat, y cuántos hubo: el refresco automático no repinta en el medio
// (si lo hiciera, el mensaje del usuario, ya guardado en el servidor, aparecería dos veces).
let ocupado = 0;
let cambios = 0;
async function api(ruta, opciones = {}) {
  if ((opciones.metodo || 'GET') === 'GET') return pedir(ruta, opciones);
  ocupado++;
  cambios++;
  try {
    return await pedir(ruta, opciones);
  } finally {
    ocupado--;
  }
}
async function pedir(ruta, { metodo = 'GET', cuerpo, crudo, tipo } = {}) {
  const r = await fetch(ruta, {
    method: metodo,
    headers: { 'X-Cobra': '1', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(tipo ? { 'Content-Type': tipo } : {}) },
    body: crudo ?? (cuerpo ? JSON.stringify(cuerpo) : undefined),
    credentials: 'same-origin',
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok && !datos.mensajes) throw new Error(datos.error || `${r.status}`);
  return datos;
}

/* ---------------- Idioma ---------------- */

function aplicarIdioma() {
  document.documentElement.lang = idioma;
  for (const e of document.querySelectorAll('[data-t]')) e.textContent = t(e.dataset.t);
  for (const e of document.querySelectorAll('[data-t-placeholder]')) e.placeholder = t(e.dataset.tPlaceholder);
  for (const e of document.querySelectorAll('[data-t-label]')) e.setAttribute('aria-label', t(e.dataset.tLabel));
  $('btn-idioma').textContent = idioma === 'es' ? 'EN' : 'ES';
  $('sugerencias').replaceChildren(...t('sugerencias').map((s) => el('button', { class: 'sugerencia', type: 'button', onclick: () => enviarTexto(s) }, s)));
}

/* ---------------- Mensajes y tarjetas ---------------- */

function tarjetaBorrador(m) {
  const b = m.datos.borrador;
  const items = el('div', { class: 'items' });
  const filaItem = (i = { descripcion: '', cantidad: 1, precio: '' }) => {
    const fila = el(
      'div',
      { class: 'item' },
      el('input', { name: 'descripcion', value: i.descripcion, 'aria-label': t('concepto'), placeholder: t('concepto') }),
      el('input', { name: 'cantidad', value: i.cantidad, inputmode: 'decimal', 'aria-label': t('cant') }),
      el('input', { name: 'precio', value: i.precio, inputmode: 'decimal', 'aria-label': t('precio'), placeholder: t('precio') }),
      el('button', { type: 'button', class: 'quitar', 'aria-label': '×', onclick: () => { fila.remove(); recalcular(); } }, '×'),
    );
    items.append(fila);
  };
  (b.items.length ? b.items : [undefined]).forEach(filaItem);
  const totalEl = el('strong');
  const form = el(
    'form',
    { class: 'tarjeta' },
    el('h4', {}, t('borrador')),
    el('div', { class: 'campos' },
      el('label', {}, t('cliente'), el('input', { name: 'cliente', value: b.cliente, required: true })),
      el('label', {}, t('email'), el('input', { name: 'email', type: 'email', value: b.email, required: true, 'aria-invalid': m.datos.faltan?.includes('email') ? 'true' : null })),
    ),
    items,
    el('button', { type: 'button', class: 'mas', onclick: () => { filaItem(); recalcular(); } }, t('agregarItem')),
    el('div', { class: 'campos' },
      el('label', {}, t('moneda'), el('select', { name: 'moneda' }, ...['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'BRL'].map((c) => el('option', { value: c, selected: c === b.moneda }, c)))),
      el('label', {}, t('plazo'), el('input', { name: 'dias', value: b.dias, inputmode: 'numeric' })),
      el('label', {}, t('idiomaCliente'), el('select', { name: 'idiomaCliente' }, el('option', { value: 'en' }, 'English'), el('option', { value: 'es' }, 'Español'), el('option', { value: 'pt' }, 'Português'))),
    ),
    el('label', {}, t('nota'), el('input', { name: 'nota', value: b.nota })),
    el('div', { class: 'total' }, el('span', {}, t('total')), totalEl),
    el('div', { class: 'acciones' },
      el('button', { type: 'button', class: 'btn', onclick: () => { form.closest('.msj').querySelector('.tarjeta').remove(); toast(t('descartado')); } }, t('descartar')),
      el('button', { class: 'btn btn-primario' }, t('crearEnviar')),
    ),
  );
  function leer() {
    const f = new FormData(form);
    const filas = [...items.querySelectorAll('.item')].map((r) => ({
      descripcion: r.querySelector('[name=descripcion]').value,
      cantidad: Number(r.querySelector('[name=cantidad]').value.replace(',', '.')) || 1,
      precio: Number(r.querySelector('[name=precio]').value.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0,
    }));
    return { cliente: f.get('cliente'), email: f.get('email'), moneda: f.get('moneda'), dias: Number(f.get('dias')) || 0, nota: f.get('nota'), items: filas, idiomaCliente: f.get('idiomaCliente') };
  }
  function recalcular() {
    const d = leer();
    totalEl.textContent = dinero(d.items.reduce((s, i) => s + i.cantidad * i.precio, 0), d.moneda);
  }
  form.addEventListener('input', recalcular);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = form.querySelector('.btn-primario');
    boton.disabled = true;
    try {
      const d = leer();
      const r = await api('/api/facturas', { metodo: 'POST', cuerpo: { borrador: d, idioma, idiomaCliente: d.idiomaCliente } });
      form.remove();
      agregarMensaje(r.mensaje);
      await refrescar();
    } catch (e) {
      toast(`${t('error')}: ${e.message}`);
      boton.disabled = false;
    }
  });
  recalcular();
  return form;
}

function tarjetaRecordatorio(m) {
  const form = el(
    'form',
    { class: 'tarjeta' },
    el('h4', {}, t('recordatorio')),
    el('label', {}, t('asunto'), el('input', { name: 'subject', value: m.datos.subject })),
    el('label', {}, t('mensaje'), el('textarea', { name: 'note', value: m.datos.note })),
    el('div', { class: 'acciones' }, el('button', { class: 'btn btn-primario' }, t('enviarRecordatorio'))),
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    await accion(m.datos.paypal_id, 'recordar', { subject: f.get('subject'), note: f.get('note') }, form);
  });
  return form;
}

function tarjetaConfirmar(m, accionNombre, etiqueta, extra = {}) {
  return el('div', { class: 'tarjeta' }, el('div', { class: 'acciones' }, el('button', { class: 'btn btn-primario', type: 'button', onclick: (ev) => accion(m.datos.paypal_id, accionNombre, extra, ev.currentTarget.closest('.tarjeta')) }, etiqueta)));
}

function tarjetaEnviada(m) {
  if (!m.datos.url_pago) return null;
  return el('div', { class: 'acciones izq' },
    el('a', { class: 'btn', href: m.datos.url_pago, target: '_blank', rel: 'noopener' }, t('abrirPago')),
    el('button', { class: 'btn', type: 'button', onclick: () => mostrarQr(m.datos.url_pago) }, t('verQr')),
  );
}

async function accion(id, nombre, cuerpo, tarjeta) {
  const botones = tarjeta?.querySelectorAll('button') || [];
  botones.forEach((b) => (b.disabled = true));
  try {
    const r = await api(`/api/facturas/${encodeURIComponent(id)}/${nombre}`, { metodo: 'POST', cuerpo: { ...cuerpo, idioma } });
    tarjeta?.remove();
    agregarMensaje(r.mensaje);
    await refrescar();
  } catch (e) {
    toast(`${t('error')}: ${e.message}`);
    botones.forEach((b) => (b.disabled = false));
  }
}

function agregarMensaje(m, { animar = true } = {}) {
  const tipo = m.datos?.tipo;
  const li = el('li', { class: `msj ${m.rol} ${tipo === 'pago' ? 'pago' : ''} ${tipo === 'auto' ? 'auto' : ''}` }, el('div', { class: 'burbuja' }, m.texto));
  // Las tarjetas solo se muestran en el último mensaje que las pide (las viejas quedan como texto).
  if (m.pendiente) {
    if (tipo === 'borrador') li.append(tarjetaBorrador(m));
    if (tipo === 'recordatorio') li.append(tarjetaRecordatorio(m));
    if (tipo === 'confirmar_cancelar') li.append(tarjetaConfirmar(m, 'cancelar', t('cancelarFactura')));
    if (tipo === 'confirmar_pago') li.append(tarjetaConfirmar(m, 'pagada', t('marcarPagada'), { metodo: 'BANK_TRANSFER' }));
  }
  if (tipo === 'enviada') li.append(tarjetaEnviada(m) || '');
  $('mensajes').append(li);
  li.scrollIntoView({ behavior: animar ? 'smooth' : 'auto', block: 'end' });
  return li;
}

function pintarMensajes(mensajes) {
  $('mensajes').replaceChildren();
  if (!mensajes.length) {
    agregarMensaje({ rol: 'assistant', texto: idioma === 'es' ? '¡Hola! Soy Cobra 🐍💸 Decime a quién facturar (escribiendo o con un audio) y yo armo la factura de PayPal, la mando y persigo el pago.' : "Hi! I'm Cobra 🐍💸 Tell me who to bill — type it or send a voice note — and I'll create the PayPal invoice, send it and chase the payment." }, { animar: false });
    return;
  }
  // Una tarjeta (borrador, confirmación) solo sigue abierta si es el último mensaje: si vino algo después, ya se resolvió.
  const ultimo = mensajes.length - 1;
  mensajes.forEach((m, i) => agregarMensaje({ ...m, pendiente: i === ultimo }, { animar: false }));
}

/* ---------------- Tablero ---------------- */

function pintarTablero() {
  const usd = estado.totales.USD || { cobrado: 0, pendiente: 0, vencido: 0, cantidadPendientes: 0, cantidadVencidas: 0 };
  $('k-cobrado').textContent = dinero(usd.cobrado);
  const ars = estado.facturas.filter((f) => ['PAID', 'MARKED_AS_PAID'].includes(f.estado) && f.ars_oficial).reduce((s, f) => s + f.ars_oficial, 0);
  $('k-cobrado-ars').textContent = ars ? `≈ ${pesos(ars)}` : '';
  $('k-pendiente').textContent = dinero(usd.pendiente);
  $('k-pendiente-n').textContent = usd.cantidadPendientes ? `${usd.cantidadPendientes} ${idioma === 'es' ? 'factura(s)' : 'invoice(s)'}` : '';
  $('k-vencido').textContent = dinero(usd.vencido);
  $('k-vencido-n').textContent = usd.cantidadVencidas ? `${usd.cantidadVencidas} ${idioma === 'es' ? 'factura(s)' : 'invoice(s)'}` : '';

  const m = estado.medidor;
  const pct = Math.min(100, Math.round(m.proporcion * 100));
  $('m-cat').textContent = `${idioma === 'es' ? 'Categoría' : 'Category'} ${m.categoria}`;
  $('m-cat').className = `chip ${m.nivel === 'ok' ? '' : m.nivel}`;
  $('m-barra').className = `barra ${m.nivel === 'ok' ? '' : m.nivel}`;
  $('m-barra').setAttribute('aria-valuenow', String(pct));
  $('m-relleno').style.width = `${pct}%`;
  $('m-texto').textContent = t('usado')(pct, pesos(m.tope)) + (m.usado > 0 && m.fechaTopeEstimada ? t('estimado')(fecha(m.fechaTopeEstimada)) : '') + (m.categoriaSugerida && m.categoriaSugerida !== m.categoria && m.usado > 0 ? t('sugerida')(m.categoriaSugerida) : '');
  $('d-oficial').textContent = estado.dolar.oficial ? pesos(estado.dolar.oficial) : '—';
  $('d-mep').textContent = estado.dolar.mep ? pesos(estado.dolar.mep) : '—';

  $('sin-facturas').hidden = estado.facturas.length > 0;
  $('facturas').replaceChildren(
    ...estado.facturas.map((f) => {
      const abierta = ['SENT', 'UNPAID', 'PARTIALLY_PAID', 'SCHEDULED', 'PAYMENT_PENDING'].includes(f.estado);
      const clase = f.vencida ? 'vencida' : ['PAID', 'MARKED_AS_PAID'].includes(f.estado) ? 'pagada' : f.estado === 'CANCELLED' ? 'cancelada' : 'enviada';
      return el(
        'li',
        { class: 'factura' },
        el('div', { class: 'quien' }, f.cliente, ' ', el('small', {}, `#${f.numero}`)),
        el('div', { class: 'monto' }, dinero(f.monto, f.moneda)),
        el(
          'div',
          { class: 'linea2' },
          el('span', { class: `chip ${clase}` }, f.vencida ? t('vencidaChip') : t('estados')[f.estado] || f.estado),
          f.vence && abierta ? el('span', {}, `${f.vencida ? t('vencio') : t('vence')} ${fecha(f.vence)}`) : null,
          f.recordatorios ? el('span', {}, t('recordatorios')(f.recordatorios)) : null,
          el(
            'span',
            { class: 'acciones-f' },
            f.url_pago && abierta ? el('button', { class: 'mini', type: 'button', onclick: () => { navigator.clipboard?.writeText(f.url_pago); toast(t('copiado')); } }, t('copiarLink')) : null,
            f.url_pago && abierta ? el('button', { class: 'mini', type: 'button', onclick: () => mostrarQr(f.url_pago) }, t('verQr')) : null,
            abierta ? el('button', { class: 'mini', type: 'button', onclick: () => enviarTexto(idioma === 'es' ? `Mandale un recordatorio a ${f.cliente} por la factura #${f.numero}` : `Send a reminder to ${f.cliente} for invoice #${f.numero}`) }, t('recordar')) : null,
          ),
        ),
      );
    }),
  );
}

function mostrarQr(url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + 4} ${n + 4}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('qrTitulo'));
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + 2} ${y + 2}h1v1h-1z`;
  const fondo = document.createElementNS(ns, 'rect');
  fondo.setAttribute('width', n + 4);
  fondo.setAttribute('height', n + 4);
  fondo.setAttribute('fill', '#fff');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.append(fondo, path);
  $('qr').replaceChildren(svg);
  $('dlg-qr').showModal();
}

/* ---------------- Flujo principal ---------------- */

async function refrescar() {
  estado = await api('/api/estado');
  pintarTablero();
}

async function enviarTexto(texto) {
  texto = texto.trim();
  if (!texto) return;
  $('texto').value = '';
  const provisoria = agregarMensaje({ rol: 'user', texto });
  const pensando = agregarMensaje({ rol: 'assistant', texto: t('pensando') });
  try {
    const r = await api('/api/mensaje', { metodo: 'POST', cuerpo: { texto } });
    provisoria.remove();
    pensando.remove();
    r.mensajes.forEach((m, i) => agregarMensaje({ ...m, pendiente: i === r.mensajes.length - 1 }));
    await refrescar();
  } catch (e) {
    pensando.remove();
    toast(`${t('error')}: ${e.message}`);
  }
}

let grabador = null;
async function alternarVoz() {
  const boton = $('btn-voz');
  if (grabador?.state === 'recording') {
    grabador.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast(t('sinMicrofono'));
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const partes = [];
    grabador = new MediaRecorder(stream);
    grabador.ondataavailable = (e) => partes.push(e.data);
    grabador.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      boton.setAttribute('aria-pressed', 'false');
      $('grabando').hidden = true;
      const blob = new Blob(partes, { type: grabador.mimeType || 'audio/webm' });
      const pensando = agregarMensaje({ rol: 'assistant', texto: t('escuchando') });
      try {
        const r = await api('/api/voz', { metodo: 'POST', crudo: blob, tipo: blob.type });
        pensando.remove();
        r.mensajes.forEach((m, i) => agregarMensaje({ ...m, texto: m.rol === 'user' ? `🎙️ ${m.texto}` : m.texto, pendiente: i === r.mensajes.length - 1 }));
        await refrescar();
      } catch (e) {
        pensando.remove();
        toast(`${t('error')}: ${e.message}`);
      }
    };
    grabador.start();
    boton.setAttribute('aria-pressed', 'true');
    $('grabando').hidden = false;
  } catch {
    toast(t('sinMicrofono'));
  }
}

function abrirAjustes() {
  const f = $('form-ajustes');
  f.nombre.value = estado.espacio.nombre || '';
  f.categoria.replaceChildren(...estado.categorias.map((c) => el('option', { value: c, selected: c === estado.espacio.categoria }, c)));
  f.recordatoriosAuto.checked = estado.espacio.recordatoriosAuto;
  $('dlg-ajustes').showModal();
}

async function guardarAjustes() {
  const f = $('form-ajustes');
  estado = await api('/api/ajustes', { metodo: 'POST', cuerpo: { nombre: f.nombre.value, categoria: f.categoria.value, recordatoriosAuto: f.recordatoriosAuto.checked } });
  pintarTablero();
  toast(t('hecho'));
}

async function iniciar() {
  $('form-chat').addEventListener('submit', (e) => {
    e.preventDefault();
    enviarTexto($('texto').value);
  });
  $('btn-voz').addEventListener('click', alternarVoz);
  $('btn-ajustes').addEventListener('click', abrirAjustes);
  $('dlg-ajustes').addEventListener('close', () => $('dlg-ajustes').returnValue === 'ok' && guardarAjustes());
  $('btn-idioma').addEventListener('click', async () => {
    idioma = idioma === 'es' ? 'en' : 'es';
    aplicarIdioma();
    estado = await api('/api/ajustes', { metodo: 'POST', cuerpo: { idioma } });
    pintarTablero();
    pintarMensajes(estado.mensajes);
  });
  $('btn-sync').addEventListener('click', async () => {
    const boton = $('btn-sync');
    boton.disabled = true;
    try {
      estado = (await api('/api/sincronizar', { metodo: 'POST', cuerpo: {} })).estado;
      pintarTablero();
      pintarMensajes(estado.mensajes);
    } catch (e) {
      toast(`${t('error')}: ${e.message}`);
    } finally {
      boton.disabled = false;
    }
  });
  estado = await api('/api/estado');
  idioma = estado.espacio.idioma === 'es' ? 'es' : 'en';
  aplicarIdioma();
  pintarTablero();
  pintarMensajes(estado.mensajes);
  // Los pagos llegan por webhook: refrescamos de vez en cuando para mostrarlos.
  setInterval(async () => {
    if (document.hidden || ocupado) return;
    const n = estado.mensajes.length;
    const c = cambios;
    await refrescar();
    if (!ocupado && c === cambios && estado.mensajes.length !== n) pintarMensajes(estado.mensajes);
  }, 20000);
}

iniciar().catch((e) => toast(`${t('error')}: ${e.message}`));
