-- Espacio de trabajo de cada freelancer (en la demo, uno por navegador).
CREATE TABLE espacios (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  idioma TEXT NOT NULL DEFAULT 'en',
  categoria TEXT NOT NULL DEFAULT 'A',
  recordatorios_auto INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL
);

-- Copia local de las facturas de PayPal del espacio (PayPal es la fuente de verdad).
CREATE TABLE facturas (
  paypal_id TEXT PRIMARY KEY,
  espacio_id TEXT NOT NULL,
  numero TEXT,
  cliente TEXT,
  email TEXT,
  concepto TEXT,
  monto REAL NOT NULL,
  moneda TEXT NOT NULL,
  estado TEXT NOT NULL,
  vence TEXT,
  url_pago TEXT,
  idioma TEXT NOT NULL DEFAULT 'en',
  creada TEXT NOT NULL,
  pagada TEXT,
  ars_oficial REAL,
  ars_mep REAL,
  recordatorios INTEGER NOT NULL DEFAULT 0,
  ultimo_recordatorio TEXT,
  actualizada TEXT NOT NULL
);
CREATE INDEX facturas_por_espacio ON facturas (espacio_id, creada);

-- Historial de la conversación y de lo que hizo el agente.
CREATE TABLE mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  espacio_id TEXT NOT NULL,
  rol TEXT NOT NULL,
  texto TEXT NOT NULL,
  datos TEXT,
  creado TEXT NOT NULL
);
CREATE INDEX mensajes_por_espacio ON mensajes (espacio_id, id);

CREATE TABLE ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);

CREATE TABLE cotizaciones (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  datos TEXT NOT NULL,
  obtenida_en TEXT NOT NULL
);
