// Widget propio de AG Studio: "Collections scoreboard". Quién te debe, como un marcador amistoso
// (y no como un informe de cobranzas): una fila por cliente con lo que debe, una barra y cuánto se atrasó.

export const TIPO_MARCADOR = 'cobra-scoreboard';

const ICONO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 9h6M7 13h9M7 17h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

const moneda = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

/** Cómo se ve el atraso: a tiempo, un poco tarde, muy tarde. */
export function atraso(dias) {
  if (!dias) return { texto: 'On time', clase: 'ok' };
  if (dias < 30) return { texto: `${dias} day${dias === 1 ? '' : 's'} late`, clase: 'poco' };
  return { texto: `${dias} days late`, clase: 'mucho' };
}

export class Marcador {
  init(params) {
    this.raiz = document.createElement('div');
    this.raiz.className = 'cobra-marcador';
    return this.refresh(params);
  }
  getGui() {
    return this.raiz;
  }
  async refresh(params) {
    const { dataMapping: dm, widgetApi } = params;
    const [cliente] = dm.client || [];
    const [debe] = dm.owed || [];
    const [dias] = dm.days || [];
    if (!cliente || !debe) {
      widgetApi.setDisplayState('incompleteDataMapping');
      return;
    }
    widgetApi.setDisplayState('loading', { prominent: false });
    let filas;
    try {
      const r = await widgetApi.getData({ fields: [cliente, debe, ...(dias ? [dias] : [])], sort: [{ field: debe, direction: 'desc' }] });
      filas = r.results.rows.map((f) => ({ cliente: f[cliente.key], debe: Number(f[debe.key]) || 0, dias: dias ? Number(f[dias.key]) || 0 : 0 })).filter((f) => f.debe > 0);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      throw e;
    }
    if (!filas.length) {
      widgetApi.setDisplayState('noData');
      return;
    }
    const max = Math.max(...filas.map((f) => f.debe));
    this.raiz.replaceChildren(
      ...filas.map((f, i) => {
        const a = atraso(f.dias);
        const fila = document.createElement('div');
        fila.className = 'cobra-marcador-fila';
        const puesto = document.createElement('span');
        puesto.className = 'cobra-marcador-puesto';
        puesto.textContent = String(i + 1);
        const nombre = document.createElement('span');
        nombre.className = 'cobra-marcador-nombre';
        nombre.textContent = f.cliente;
        const monto = document.createElement('strong');
        monto.className = 'cobra-marcador-monto';
        monto.textContent = moneda(f.debe);
        const barra = document.createElement('span');
        barra.className = `cobra-marcador-barra ${a.clase}`;
        barra.style.setProperty('--ancho', `${Math.max(4, (f.debe / max) * 100)}%`);
        const chip = document.createElement('span');
        chip.className = `cobra-marcador-chip ${a.clase}`;
        chip.textContent = a.texto;
        fila.append(puesto, nombre, monto, barra, chip);
        return fila;
      }),
    );
    widgetApi.setDisplayState('displayed');
  }
}

/** Definición para createWidgets (additionalTypes). */
export const MARCADOR = {
  id: TIPO_MARCADOR,
  label: 'Collections scoreboard',
  icon: ICONO,
  dataMapping: {
    client: { type: 'field', supportedRoles: ['category'], requires: { cardinality: 'many' }, required: true, aiDescription: 'Who owes: one row per value (usually the client).' },
    owed: { type: 'field', supportedRoles: ['numeric'], requires: { per: 'dataMapping.client', cardinality: 'one' }, required: true, aiDescription: 'Amount owed per row (usually the sum of outstanding).' },
    days: { type: 'field', supportedRoles: ['numeric'], requires: { per: 'dataMapping.client', cardinality: 'one' }, aiDescription: 'Optional: how late the oldest unpaid invoice is, in days (usually the max of days overdue).' },
  },
  form: (params) =>
    params.createDefaults({
      dataMappingItems: [
        { key: 'client', label: 'Client' },
        { key: 'owed', label: 'Amount owed' },
        { key: 'days', label: 'Days late' },
      ],
    }),
  comp: Marcador,
  defaultSize: { width: 420, height: 320 },
  minSize: { width: 260, height: 160 },
  ai: { description: 'A friendly scoreboard of who owes the freelancer money: one row per client with the amount owed, a bar and how many days late they are.' },
};
