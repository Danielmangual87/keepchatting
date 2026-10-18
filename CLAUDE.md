# Instrucciones para Claude en este repo

## Trading XAUUSD con `claude_trader/` (estrategia 3.8)

Versión activa: **XAUUSD 3.8 - restaurado (00:01, sin noticias)**. Procedimiento
completo en `claude_trader/README.md`. Las reglas siguientes las fijó el usuario
y **tienen prioridad sobre `prompt_entry_decision.md`** donde choquen.

### Riesgo/beneficio
- RR mínimo aceptable: **1:2** (igual que el prompt de 3.8). Entre 1:2 y 1:2.5
  es perfectamente válido; no hace falta buscar RR altos.
- 3.8 no tiene tope de RR ni filtro premium/discount en código.
- Nunca subir el RR acercando el stop: si el stop correcto deja el RR por debajo
  de 1:2, la señal es `NONE`.

### Stop loss: nada de stops pegados
- El buffer base es el de 3.8: el mayor entre ~1x `marketMap.M5.avgRange10` y $3.
- Además, el SL no puede quedar solo en el borde de la zona M5 + buffer cuando
  esa zona está dentro de una zona mayor (OB/FVG de H1 o H4). En ese caso el SL
  va **al menos por encima/debajo de la mitad de la zona mayor + buffer**, o más
  allá de la zona completa si el RR lo permite.
- Como referencia en XAUUSD, un SL de ~$4 es demasiado ajustado. La distancia
  debe ser al menos ~0.75x `marketMap.H1.avgRange10`, unos $10-12 en
  condiciones normales.
- El lote se recalcula con el stop más amplio para mantener ~1 % de riesgo (lo
  hace `calculate_lot_size.js`). Tope duro: 2 %.

Ejemplo aprobado por el usuario (18-oct-2026): Sell Limit 4181.47 dentro del OB
bajista de H1 4181.32-4198.92. El SL de 4185.51 ($4.04) fue rechazado por
ajustado; se aceptó un SL de 4193.12 (mitad del OB 4190.12 + 3) con TP 4156.09,
RR 1:2.2 y 0.04 lotes.

### Noticias
- Como en 3.8, no entran en la decisión: no bloquean ni cambian la orden ni la
  confianza.
- Aparte de la señal, buscar con WebSearch el calendario de EE.UU. del día y los
  titulares que mueven el oro, y dar al usuario un resumen informativo con
  sugerencias. Si no se encuentra el calendario, decirlo; no suponer.

### Gate (3.8)
- Solo se salta el análisis si hay una **posición abierta** en XAUUSD.
- Si hay una orden pendiente sin llenar, se analiza igual y se propone
  reemplazarla (cancelar + colocar la nueva) o mantenerla si la señal coincide.

### Análisis programado
- Tarea programada de lunes a viernes a las 00:01 hora de Puerto Rico, en esta
  sesión. Prepara la orden y pide confirmación; no la coloca sola.

### Ejecución
- Cuenta de pruebas: Axi MT5 DEMO, login 10069167.
- Toda orden se coloca, modifica o cancela solo tras confirmación explícita del
  usuario, mostrando antes todos los parámetros.
- El usuario escribe en español; responder en español.
