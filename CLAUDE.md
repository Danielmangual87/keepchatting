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
  sesión.
- Autorización del usuario (19-oct-2026, 23:25 AST): en la cuenta DEMO, si el análisis da
  una orden ejecutable, se coloca **sin pedir confirmación** y se le avisa
  después. Condiciones: Buy/Sell Limit con lote no rechazado, riesgo ≤ 1,5 %,
  RR 1:2 a 1:5, SL no pegado, y una cotización fresca confirma que la entrada
  sigue del lado correcto y el TP no se ha alcanzado. Si hay una pendiente de
  XAUUSD distinta, se cancela y se reemplaza.

### Break even
Autorización del usuario (21-oct-2026, 09:15 AST): en la cuenta DEMO, cuando una
posición abierta de XAUUSD recorre el **50 % del camino al TP**, el SL se mueve
a break even **sin pedir confirmación** y se le avisa después.
- Revisión: tarea horaria (L-V) y, mientras haya una posición abierta, una
  revisión cada 15 min que se reprograma sola con `send_later` (las tareas
  recurrentes no pueden ser de menos de 1 h).
- Procedimiento por posición (E = priceOpen, TP = priceTP):
  1. Nivel 50 % = E + 0.5·(TP − E). Precio BE: venta E − 0.20, compra E + 0.20.
  2. Si el SL ya está en BE o mejor (venta SL ≤ E, compra SL ≥ E): nada que hacer.
  3. Velas M1 de XAUUSD desde `timeCreate`: ¿algún low (venta) ≤ nivel 50 %, o
     algún high (compra) ≥ nivel 50 %?
  4. Si se alcanzó y el BE es válido con la cotización actual (venta ask < BE,
     compra bid > BE): `modify_mt5_position` con priceSL = BE y **el mismo TP**;
     verificar con `get_mt5_positions` y avisar (mensaje + PushNotification).
  5. Si se alcanzó pero el precio ya volvió más allá de la entrada, no modificar
     y avisar una sola vez.
- Nunca alejar el SL, nunca tocar el TP, nunca cerrar la posición.
- Sin posición abierta, la revisión termina en silencio.

### Ejecución
- Cuenta de pruebas: Axi MT5 DEMO, login 10069167.
- Fuera de la ejecución automática del análisis programado y del break even
  (y siempre en cuentas reales), toda orden se coloca, modifica o cancela solo tras
  confirmación explícita del usuario, mostrando antes todos los parámetros.
- El usuario escribe en español; responder en español.
