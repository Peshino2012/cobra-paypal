// Prueba de punta a punta contra la app publicada, con Workers AI y el sandbox de PayPal reales:
// chat → borrador (IA) → factura enviada → recordatorio escrito por IA → consulta → pagada → cancelada.
// Uso: node e2e/en-vivo.mjs https://cobra.peshino2012.workers.dev
const BASE = (process.argv[2] || process.env.URL || '').replace(/\/$/, '');
if (!BASE) throw new Error('Falta la URL de la app');

let cookie = '';
async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'X-Cobra': '1', 'Content-Type': 'application/json', 'Accept-Language': 'en-US', ...(cookie ? { Cookie: cookie } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const datos = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status} ${JSON.stringify(datos)}`);
  return datos;
}
const ultimo = (d) => d.mensajes.at(-1);
const paso = (t) => console.log(`\n▶ ${t}`);
function exigir(cond, msj) {
  if (!cond) throw new Error(msj);
}

async function borrador(texto) {
  const m = ultimo(await api('/api/mensaje', { metodo: 'POST', cuerpo: { texto } }));
  console.log(m.texto);
  console.log(JSON.stringify(m.datos.borrador));
  exigir(m.datos.tipo === 'borrador', `se esperaba un borrador y llegó ${m.datos.tipo}`);
  exigir(m.datos.fuente === 'ia' || process.env.PERMITIR_REGLAS, 'el borrador no lo armó la IA (Workers AI no respondió y entró el parser de reglas)');
  exigir(m.datos.faltan.length === 0, `faltan datos: ${m.datos.faltan}`);
  return m.datos.borrador;
}

paso('Estado inicial');
const e = await api('/api/estado');
console.log(`dólar oficial ${e.dolar.oficial} · MEP ${e.dolar.mep}`);

paso('Chat en inglés → borrador armado por Llama 3.3');
const b1 = await borrador('Invoice Globex Corp 1,200 USD for the landing page redesign, due in 15 days, ap@example.com');
exigir(b1.total === 1200 && b1.moneda === 'USD', 'monto o moneda mal interpretados');

paso('Crear y enviar con PayPal');
const c1 = await api('/api/facturas', { metodo: 'POST', cuerpo: { borrador: b1, idioma: 'en' } });
console.log(c1.mensaje.texto, c1.factura.url_pago);
exigir(['SENT', 'UNPAID'].includes(c1.factura.estado), `estado inesperado: ${c1.factura.estado}`);
exigir(c1.factura.cliente === b1.cliente, 'el nombre del cliente no volvió de PayPal');

paso('Recordatorio escrito por la IA y enviado por PayPal');
const r = ultimo(await api('/api/mensaje', { metodo: 'POST', cuerpo: { texto: 'Send Globex a friendly reminder' } }));
exigir(r.datos.tipo === 'recordatorio', `se esperaba un recordatorio y llegó ${r.datos.tipo}`);
console.log(`Asunto: ${r.datos.subject}\n${r.datos.note}`);
const rec = await api(`/api/facturas/${r.datos.paypal_id}/recordar`, { metodo: 'POST', cuerpo: { subject: r.datos.subject, note: r.datos.note } });
exigir(rec.factura.recordatorios === 1, 'no se contó el recordatorio');

paso('Chat en español → borrador');
const b2 = await borrador('Facturale 300 dólares a Initech por el mantenimiento de octubre, it@example.com');
const c2 = await api('/api/facturas', { metodo: 'POST', cuerpo: { borrador: b2, idioma: 'es' } });
console.log(c2.mensaje.texto);

paso('Marcar pagada (pago registrado en PayPal)');
const p = await api(`/api/facturas/${c2.factura.paypal_id}/pagada`, { metodo: 'POST', cuerpo: { metodo: 'BANK_TRANSFER' } });
console.log(p.mensaje.texto, p.factura.estado);
exigir(p.factura.estado === 'MARKED_AS_PAID', `estado inesperado: ${p.factura.estado}`);

paso('Consulta en lenguaje natural (respuesta con datos reales)');
console.log(ultimo(await api('/api/mensaje', { metodo: 'POST', cuerpo: { texto: 'Who owes me money?' } })).texto);

paso('Cancelar la factura de prueba');
const k = await api(`/api/facturas/${c1.factura.paypal_id}/cancelar`, { metodo: 'POST', cuerpo: {} });
exigir(k.factura.estado === 'CANCELLED', `estado inesperado: ${k.factura.estado}`);

const fin = await api('/api/estado');
console.log(`\n✅ Todo bien: ${fin.facturas.length} facturas en el espacio, cobrado ${JSON.stringify(fin.totales)}`);
