// Cotizaciones del dólar desde DolarApi, con una copia en D1 para no pedirlas
// en cada ejecución. https://dolarapi.com
const CASAS = { oficial: 'Oficial', blue: 'Blue', bolsa: 'MEP', contadoconliqui: 'Contado con liqui', tarjeta: 'Tarjeta', mayorista: 'Mayorista', cripto: 'Cripto' };

export const DOLARAPI = 'https://dolarapi.com/v1/dolares';

export function normalizar(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((c) => c && c.casa in CASAS)
    .map((c) => ({ casa: c.casa, nombre: CASAS[c.casa], compra: Number(c.compra) || null, venta: Number(c.venta) || null, fecha: c.fechaActualizacion || null }));
}

/** Devuelve las cotizaciones (de la copia si tiene menos de maxEdadMs). */
export async function obtenerCotizaciones(db, { url = DOLARAPI, fetchImpl = fetch, ahora = Date.now(), maxEdadMs = 10 * 60 * 1000 } = {}) {
  const copia = await db.prepare('SELECT datos, obtenida_en FROM cotizaciones WHERE id = 1').first();
  if (copia && ahora - Date.parse(copia.obtenida_en) < maxEdadMs) return JSON.parse(copia.datos);
  try {
    const r = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`DolarApi respondió ${r.status}`);
    const datos = normalizar(await r.json());
    if (!datos.length) throw new Error('DolarApi devolvió una lista vacía');
    await db
      .prepare('INSERT INTO cotizaciones (id, datos, obtenida_en) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET datos = excluded.datos, obtenida_en = excluded.obtenida_en')
      .bind(JSON.stringify(datos), new Date(ahora).toISOString())
      .run();
    return datos;
  } catch (e) {
    if (copia) return JSON.parse(copia.datos);
    throw e;
  }
}
