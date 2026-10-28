# Instrucciones para Claude en este repo

## Trading XAUUSD con `claude_trader/` (estrategia 3.8)

Versión activa: **XAUUSD 3.8 - restaurado (00:01, sin noticias)**. Procedimiento
completo en `claude_trader/README.md`. Las reglas siguientes las fijó el usuario
y **tienen prioridad sobre `prompt_entry_decision.md`** donde choquen.

### Riesgo/beneficio
Regla del usuario (28-oct-2026; sustituye el tope 1:1-1:2 del 27-oct):
- RR **mínimo 1:2 y máximo 1:5**, con el TP en el objetivo de liquidez de 3.8.
  Si ese objetivo queda más allá de 5R, el TP va en 5R (entrada ∓ 5 × distancia
  del SL). Si queda a menos de 2R, la señal es `NONE`.
- 3.8 no tiene tope de RR ni filtro premium/discount en código; el tope lo
  aplica Claude al escribir `decision.json`.
- Nunca subir el RR acercando el stop: si el stop correcto deja el RR por debajo
  de 1:2, la señal es `NONE`.

Motivo: el tope 1:1-1:2 salió de 7 señales de una tendencia bajista. En el
backtest de 9 meses (27-ene a 28-oct-2026, versión mecánica de 3.8) fue la peor
forma de poner el TP: −12.8R en 125 operaciones contra −5.4R con 2R-5R, y con el
filtro de entrada de abajo −1.5R contra +12.2R.

### Entrada: no pegada al precio
Regla del usuario (28-oct-2026), XAUUSD y EURUSD:
- Al colocar una orden nueva (análisis programado, reanálisis de la revisión
  horaria o análisis a pedido), la entrada tiene que estar al menos a
  **0.5x `marketMap.H1.avgRange10`** del precio actual (bid de `get_mt5_quote`):
  por encima para Sell Limit, por debajo para Buy Limit.
- Si la entrada que da 3.8 queda más cerca, la señal es `NONE`. No se mueve la
  entrada para cumplir la distancia.
- No aplica a una pendiente ya colocada a la que el precio se le acerca: esa se
  deja llenar.

Motivo: en el backtest, la mitad de las órdenes se llenaban en menos de una
hora tras las 00:01 (61 de 125) y ahí estaba casi toda la pérdida (−12.7R). Con
la entrada a ≥ 0.5x H1 del precio, 3.8 con RR 2-5 dio 45 operaciones, +12.2R y
una caída máxima de 4.2R. El resultado no es concluyente (error de ±12R): se
revisa cuando haya ~40 operaciones en DEMO con estas reglas.

### XAUUSD y EURUSD: una sola apuesta al dólar
Regla del usuario (28-oct-2026):
- Vender oro o EURUSD es comprar dólares, y comprarlos es vender dólares. No se
  tienen a la vez órdenes pendientes ni posiciones de los dos símbolos en la
  misma dirección (las dos ventas o las dos compras).
- Si ya hay una pendiente o una posición de uno y la señal del otro va en la
  misma dirección, la señal se informa pero no se coloca. En direcciones
  contrarias sí se permite.

Motivo: el 20-oct las ventas de XAUUSD y EURUSD llegaron al SL con 4 minutos
de diferencia (−$94, casi 2 % de la cuenta).

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
  sesión.
- Autorización del usuario (19-oct-2026, 23:25 AST): en la cuenta DEMO, si el análisis da
  una orden ejecutable, se coloca **sin pedir confirmación** y se le avisa
  después. Condiciones: Buy/Sell Limit con lote no rechazado, riesgo ≤ 1,5 %,
  RR 1:2 a 1:5, SL no pegado, entrada a ≥ 0.5x `marketMap.H1.avgRange10` del
  precio, sin pendiente ni posición del otro símbolo (EURUSD para XAUUSD y al
  revés) en la misma dirección, y una
  cotización fresca confirma que la entrada sigue del lado correcto y el TP no
  se ha alcanzado. Si hay una pendiente de XAUUSD distinta, se cancela y se
  reemplaza.

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
