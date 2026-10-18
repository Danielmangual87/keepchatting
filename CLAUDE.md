# Instrucciones para Claude en este repo

## Trading XAUUSD con `claude_trader/` (estrategia 3.9-lite)

Procedimiento completo en `claude_trader/README.md`. Las reglas siguientes las
fijó el usuario y **tienen prioridad sobre `prompt_entry_decision.md`** donde
choquen:

### Riesgo/beneficio
- RR mínimo aceptable: **1:2** (el prompt original pedía 1:2.5). Entre 1:2 y
  1:2.5 es perfectamente válido; no hace falta buscar RR altos.
- El tope de RR > 5 (`RR_BLOCK` en `build_alert_message.js`) se mantiene.
- Nunca subir el RR acercando el stop: si el stop correcto deja el RR por debajo
  de 1:2, la señal es `NONE`.

### Stop loss: nada de stops pegados
- El SL no puede quedar solo en el borde de la zona M5 + `slBuffer` cuando esa
  zona está dentro de una zona mayor (OB/FVG de H1 o H4). En ese caso el SL va
  **al menos por encima/debajo de la mitad de la zona mayor + `slBuffer`**, o
  más allá de la zona completa si el RR lo permite.
- Como referencia en XAUUSD, un SL de ~$4 es demasiado ajustado. La distancia
  debe ser al menos ~0.75x el rango medio de las últimas 10 velas H1
  (`marketMap.H1.avgRange10`), unos $10-12 en condiciones normales.
- El lote se recalcula con el stop más amplio para mantener ~1 % de riesgo (lo
  hace `calculate_lot_size.js`). Tope duro: 2 %.

Ejemplo aprobado por el usuario (18-oct-2026): Sell Limit 4181.47 dentro del OB
bajista de H1 4181.32-4198.92. El SL de 4185.51 ($4.04) fue rechazado por
ajustado; se aceptó un SL de 4193.12 (mitad del OB 4190.12 + 3) con TP 4156.09,
RR 1:2.2 y 0.04 lotes.

### Ejecución
- Cuenta de pruebas: Axi MT5 DEMO, login 10069167.
- Toda orden se coloca, modifica o cancela solo tras confirmación explícita del
  usuario, mostrando antes todos los parámetros.
- El usuario escribe en español; responder en español.
