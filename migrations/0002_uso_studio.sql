-- Turnos del asistente de IA de Cobra Insights (AG Studio), para limitar el uso por hora y por día.
CREATE TABLE uso_studio (
  espacio_id TEXT NOT NULL,
  dia TEXT NOT NULL,
  hora TEXT NOT NULL,
  turnos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (espacio_id, hora)
);
CREATE INDEX uso_studio_por_dia ON uso_studio (dia);
