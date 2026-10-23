// Tamaño mínimo para los gráficos que agregan los agentes de AG Studio: los ubican bien, pero a veces de
// 6 × 6 celdas (120 px de alto), donde no se lee nada. Cada widget nuevo se ajusta una sola vez, al aparecer.
import { GRILLA } from './insights-reporte.js';

export const MINIMO = { xSpan: 12, ySpan: 16 }; // media pantalla de ancho y 320 px de alto
// Los KPI, textos, imágenes y filtros pueden ser chicos.
const CHICOS = new Set(['value', 'text', 'image', 'button-filter', 'list-filter', 'date-filter']);
const choca = (a, b) => a.xTrack < b.xTrack + b.xSpan && a.xTrack + a.xSpan > b.xTrack && a.yTrack < b.yTrack + b.ySpan && a.yTrack + a.ySpan > b.yTrack;

/** Agranda los widgets nuevos (los que no están en `vistos`) que quedaron chicos. Devuelve el estado nuevo o null. */
export function ajustarNuevos(estado, vistos, columnas = GRILLA.columns) {
  let cambio = false;
  const pages = (estado?.pages || []).map((p) => {
    const layout = { ...p.widgetLayout };
    for (const [id, l] of Object.entries(layout)) {
      const clave = `${p.id}/${id}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const tipo = p.widgets?.[id]?.type;
      if (!tipo || CHICOS.has(tipo) || (l.xSpan >= MINIMO.xSpan && l.ySpan >= MINIMO.ySpan)) continue;
      const xSpan = Math.min(Math.max(l.xSpan, MINIMO.xSpan), columnas);
      let nuevo = { xTrack: Math.max(0, Math.min(l.xTrack, columnas - xSpan)), yTrack: l.yTrack, xSpan, ySpan: Math.max(l.ySpan, MINIMO.ySpan) };
      const otros = Object.entries(layout).filter(([k]) => k !== id).map(([, v]) => v);
      // Si al agrandarlo pisa a otro, va abajo de todo.
      if (otros.some((o) => choca(nuevo, o))) nuevo = { ...nuevo, xTrack: 0, yTrack: Math.max(0, ...otros.map((o) => o.yTrack + o.ySpan)) };
      layout[id] = nuevo;
      cambio = true;
    }
    return { ...p, widgetLayout: layout };
  });
  return cambio ? { ...estado, pages } : null;
}

/** Ids de los widgets de un estado, para no tocar los del tablero inicial. */
export const idsDe = (estado) => new Set((estado?.pages || []).flatMap((p) => Object.keys(p.widgetLayout || {}).map((id) => `${p.id}/${id}`)));
