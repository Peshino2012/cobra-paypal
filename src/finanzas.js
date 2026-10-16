// Números del freelancer: totales por estado, conversión a pesos y el
// medidor del monotributo. Lógica pura.

/** Topes anuales de ingresos brutos del monotributo vigentes desde el 1/8/2026 (ARCA). */
export const MONOTRIBUTO_2026_08 = {
  A: 12009410.45,
  B: 17595182.74,
  C: 24670494.31,
  D: 30628651.43,
  E: 36028231.33,
  F: 45151659.41,
  G: 53995798.87,
  H: 81924660.37,
  I: 91699761.9,
  J: 105012519.2,
  K: 126610838.75,
};

export const ESTADOS_PAGADA = new Set(['PAID', 'MARKED_AS_PAID']);
export const ESTADOS_ABIERTA = new Set(['SENT', 'UNPAID', 'PARTIALLY_PAID', 'SCHEDULED', 'PAYMENT_PENDING']);

const DIA = 86400000;

export function vencida(f, ahora = Date.now()) {
  return ESTADOS_ABIERTA.has(f.estado) && f.vence && Date.parse(`${f.vence}T23:59:59-03:00`) < ahora;
}

/** Totales por moneda: cobrado (últimos 365 días), pendiente y vencido. */
export function totales(facturas, ahora = Date.now()) {
  const t = {};
  for (const f of facturas) {
    const m = (t[f.moneda] ??= { cobrado: 0, pendiente: 0, vencido: 0, cantidadPendientes: 0, cantidadVencidas: 0 });
    if (ESTADOS_PAGADA.has(f.estado) && f.pagada && ahora - Date.parse(f.pagada) <= 365 * DIA) m.cobrado += f.monto;
    if (ESTADOS_ABIERTA.has(f.estado)) {
      m.pendiente += f.monto;
      m.cantidadPendientes++;
      if (vencida(f, ahora)) {
        m.vencido += f.monto;
        m.cantidadVencidas++;
      }
    }
  }
  return t;
}

/** Pesos al dólar oficial comprador (el que usa ARCA para facturas de exportación) y al MEP. */
export function enPesos(montoUsd, cotizaciones) {
  const oficial = cotizaciones.find((c) => c.casa === 'oficial');
  const mep = cotizaciones.find((c) => c.casa === 'bolsa');
  return {
    oficial: oficial?.compra ? montoUsd * oficial.compra : null,
    mep: mep?.compra ? montoUsd * mep.compra : null,
  };
}

/**
 * Medidor del monotributo: ingresos de los últimos 12 meses (en pesos al
 * oficial del día del cobro) contra el tope de la categoría, y a qué ritmo
 * se llegaría.
 */
export function medidorMonotributo(facturas, categoria = 'A', { ahora = Date.now(), topes = MONOTRIBUTO_2026_08 } = {}) {
  const tope = topes[categoria];
  if (!tope) throw new RangeError(`Categoría desconocida: ${categoria}`);
  let usado = 0;
  let primero = ahora;
  for (const f of facturas) {
    if (!ESTADOS_PAGADA.has(f.estado) || !f.pagada || !(f.ars_oficial > 0)) continue;
    const t = Date.parse(f.pagada);
    if (ahora - t > 365 * DIA) continue;
    usado += f.ars_oficial;
    primero = Math.min(primero, t);
  }
  const proporcion = usado / tope;
  const dias = Math.max(30, (ahora - primero) / DIA);
  const porDia = usado / dias;
  const diasHastaTope = porDia > 0 ? Math.max(0, (tope - usado) / porDia) : null;
  const letras = Object.keys(topes);
  const siguiente = letras.find((l) => topes[l] >= usado * (365 / dias)) || null;
  return {
    categoria,
    tope,
    usado,
    proporcion,
    restante: Math.max(0, tope - usado),
    fechaTopeEstimada: diasHastaTope == null ? null : new Date(ahora + diasHastaTope * DIA).toISOString().slice(0, 10),
    categoriaSugerida: siguiente,
    nivel: proporcion >= 1 ? 'excedido' : proporcion >= 0.8 ? 'alerta' : 'ok',
  };
}
