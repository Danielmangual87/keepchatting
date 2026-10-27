# Instrucciones para Claude en este repo

## Trading XAUUSD con `claude_trader/` (estrategia 3.8)

Versión activa: **XAUUSD 3.8 - restaurado (00:01, sin noticias)**. Procedimiento
completo en `claude_trader/README.md`. Las reglas siguientes las fijó el usuario
y **tienen prioridad sobre `prompt_entry_decision.md`** donde choquen.

### Riesgo/beneficio
Regla del usuario (27-oct-2026), en lugar del mínimo 1:2 del prompt de 3.8:
- RR **máximo 1:2 y mínimo 1:1**.
- El TP sigue saliendo del objetivo de liquidez de 3.8. Si ese objetivo queda
  más allá de 2R, el TP va exactamente en 2R (entrada ∓ 2 × distancia del SL).
  Si queda entre 1R y 2R, se usa el objetivo tal cual. Si queda a menos de 1R,
  la señal es `NONE`.
- 3.8 no tiene tope de RR ni filtro premium/discount en código; el tope lo
  aplica Claude al escribir `decision.json`.
- Nunca subir el RR acercando el stop: si el stop correcto deja el RR por debajo
  de 1:1, la señal es `NONE`.

Motivo: en las 7 señales llenadas del 18 al 27-oct, con TP en 2R cuatro llegaban
al TP antes que el SL (+$193 en total), contra +$44 con los TP de liquidez.

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
RR 1:2.2 y 0.04 lotes. (Con la regla de RR máximo 1:2, ese TP sería 4158.17.)

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
  sesión.
- Autorización del usuario (19-oct-2026, 23:25 AST): en la cuenta DEMO, si el análisis da
  una orden ejecutable, se coloca **sin pedir confirmación** y se le avisa
  después. Condiciones: Buy/Sell Limit con lote no rechazado, riesgo ≤ 1,5 %,
  RR 1:1 a 1:2, SL no pegado, y una cotización fresca confirma que la entrada
  sigue del lado correcto y el TP no se ha alcanzado. Si hay una pendiente de
  XAUUSD distinta, se cancela y se reemplaza.

### Revisión horaria de órdenes pendientes
Autorización del usuario (22-oct-2026, 22:45 AST; EURUSD añadido el mismo día):
mientras haya una orden pendiente de XAUUSD o EURUSD en la cuenta DEMO, se revisa
cada hora (tarea "Revisión horaria XAUUSD/EURUSD DEMO"), solo de lunes a viernes
entre las 12:30 am y las 12:30 pm AST (horario fijado por el usuario el 25-oct-2026). Si el precio se alejó mucho de la entrada, se reanaliza y, si
hace falta, se cancela la vieja y se pone la nueva **sin pedir confirmación**,
avisando después.
- Cada símbolo se revisa por separado. No se toca un símbolo con posición
  abierta (no se mueve SL ni TP); tampoco si el mercado está cerrado o no hay
  pendiente de ese símbolo.
- Si una pendiente se llenó desde la última revisión, solo se avisa.
- "Muy lejos" = el precio se alejó de la entrada al menos 1x
  `marketMap.H1.avgRange10` más que cuando se colocó la orden (precio de
  referencia: cierre M5 de la vela de `timeSetup`), o el precio tocó el TP sin
  llenar la orden.
- Si el TP se tocó sin llenar: se cancela siempre, y se reanaliza.
- Reanálisis = procedimiento completo de 3.8 para ese símbolo con datos frescos
  y las reglas de este archivo. Si la señal nueva es ejecutable, distinta y
  cumple las condiciones del análisis programado → cancelar y colocar la nueva.
  Si coincide → mantener. Si es `NONE` → mantener la vieja salvo que su zona ya
  no exista en la estructura o el TP se haya tocado; en ese caso cancelarla.
- EURUSD usa las mismas reglas de SL en proporción: buffer = el mayor entre 1x
  `marketMap.M5.avgRange10` y 3 pips (0.0003), y SL a al menos 0.75x
  `marketMap.H1.avgRange10`. El lote lo calcula `calculate_lot_size.js`.
- Las revisiones sin cambios no generan mensaje.

### Cierre de viernes (nada abierto el fin de semana)
Regla del usuario (23-oct-2026), cuenta DEMO, XAUUSD y EURUSD, sin pedir
confirmación (tarea "Cierre de viernes DEMO", viernes 12:01 pm y 3:01 pm AST):
- Viernes 12:00 pm AST: toda orden pendiente que no se haya llenado se cancela.
- Viernes 3:00 pm AST: toda posición abierta se cierra, en ganancia o en
  pérdida, y se cancela cualquier pendiente que quede.
- Desde el viernes 12:00 pm AST hasta la apertura del domingo no se colocan
  órdenes nuevas (ni el análisis ni la revisión horaria).

### Break even: DESACTIVADO
El usuario lo quitó el 22-oct-2026: en los backtests (estrategia 3.8 y señales del
sheet SMC2) mover el SL a break even al 50 % no mejoró el resultado. La tarea
horaria "Break even XAUUSD DEMO (horaria)" está desactivada. No mover el SL de
posiciones abiertas salvo que el usuario lo pida.

### Ejecución
- Cuenta de pruebas: Axi MT5 DEMO, login 10069167.
- Fuera de la ejecución automática del análisis programado, la revisión
  horaria y el cierre de viernes (y siempre en cuentas reales), toda orden se coloca, modifica o cancela solo tras
  confirmación explícita del usuario, mostrando antes todos los parámetros.
- El usuario escribe en español; responder en español.
- Todas las horas se dan y se interpretan en hora de Puerto Rico (AST, UTC−4,
  sin horario de verano). Las tareas programadas usan CRON_TZ=America/Puerto_Rico.
