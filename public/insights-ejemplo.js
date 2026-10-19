// Datos de ejemplo para el tablero (ficticios), con el mismo formato que /api/estado.
// Fechas relativas a hoy, así el ejemplo siempre tiene facturas vencidas y por vencer.
const CLIENTES = [
  { nombre: 'Delta Studio', email: 'billing@deltastudio.example', base: 1200, demora: 6 },
  { nombre: 'Northwind Labs', email: 'ap@northwind.example', base: 2400, demora: 21 },
  { nombre: 'Bluebird Media', email: 'finance@bluebird.example', base: 650, demora: 3 },
  { nombre: 'Kite & Co', email: 'accounts@kite.example', base: 900, demora: 35 },
  { nombre: 'Lumen Apps', email: 'pay@lumen.example', base: 1800, demora: 12 },
  { nombre: 'Orbit Health', email: 'ap@orbithealth.example', base: 3000, demora: 28 },
];
const CONCEPTOS = ['Landing page redesign', 'Monthly maintenance', 'Mobile app sprint', 'Brand identity', 'SEO audit', 'Dashboard development', 'Content writing', 'API integration'];

export function facturasEjemplo(hoy = new Date()) {
  const dia = (n) => new Date(hoy.getTime() - n * 86_400_000).toISOString();
  const facturas = [];
  let numero = 1001;
  // Una factura cada ~12 días durante 14 meses, rotando clientes.
  for (let atras = 420, i = 0; atras >= 2; atras -= 12, i++) {
    const c = CLIENTES[(i * 5 + (i >> 2)) % CLIENTES.length];
    const monto = Math.round((c.base * (0.75 + ((i * 37) % 50) / 100)) / 10) * 10;
    const creada = dia(atras);
    const vence = dia(atras - 15);
    const pagoEn = atras - c.demora;
    let estado = 'SENT';
    let pagada = null;
    if (pagoEn > 0 && (i % 9 !== 4 || atras < 60)) {
      estado = 'PAID';
      pagada = dia(pagoEn);
    }
    if (i % 17 === 8) estado = 'CANCELLED';
    const recordatorios = estado === 'SENT' && atras - 15 > 0 ? Math.min(3, Math.floor((atras - 15) / 4) + 1) : estado === 'PAID' && c.demora > 15 ? 1 : 0;
    facturas.push({
      numero: String(numero++),
      cliente: c.nombre,
      email: c.email,
      concepto: CONCEPTOS[i % CONCEPTOS.length],
      monto,
      moneda: 'USD',
      estado,
      creada,
      vence: vence.slice(0, 10),
      pagada,
      recordatorios,
      ars_oficial: pagada ? Math.round(monto * (1180 + (420 - atras) * 0.65)) : null,
    });
  }
  return facturas;
}
