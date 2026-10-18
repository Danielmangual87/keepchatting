# XAUUSD 3.8 en Claude (sin n8n, sin Gemini)

Port del workflow n8n **"XAUUSD 3.8 - restaurado (00:01, sin noticias)"**.
Todo el código determinista se conserva tal cual; solo cambian la fuente de
datos y quién toma la decisión:

| n8n | Aquí |
|---|---|
| Sheets "MT4 Feed" (D1/H4/H1/M5 + quote) | Conector **Axi MT5**: `get_mt5_candles` + `get_mt5_quote` |
| `Code: Analyze Market Structure` | `engine.js` (mismas funciones, copiadas) |
| `HTF Bias Node1` (Gemini) | **Claude**, con `prompt_htf_bias.md` |
| `Message a model` (Gemini) | **Claude**, con `prompt_entry_decision.md` → `decision.json` |
| Filter News Risk / Build Alert / Account Config / Lot Size | `finalize.js`, que ejecuta los nodos de `n8n_nodes/` sin cambios |
| Balance desde la pestaña Balance | `get_account` de Axi |
| Gate "operación anterior ABIERTA" (Sheet + Twelve Data) | `get_mt5_positions` / `get_mt5_orders` de Axi |
| EA que lee el Sheet y coloca la orden | `place_mt5_order` de Axi, **con confirmación del usuario** |

Para importar otra versión del workflow: `python3 -I claude_trader/import_n8n.py <workflow.json>`.

## Qué hace 3.8 (frente a 3.9-lite)

- RR mínimo **1:2.0** (en el prompt).
- El buffer del stop lo decide el modelo: el mayor entre ~1x el rango medio de
  las últimas 10 velas M5 y $3 (`marketMap.M5.avgRange10`). Las reglas del
  usuario en `/CLAUDE.md` piden además un stop no pegado.
- Sin filtro premium/discount, sin tope de RR > 5 y sin bloqueo por noticia.
- Noticias desactivadas: `filter_news_risk.js` descarta todos los eventos.
- Gate: solo se salta el análisis si hay una **posición abierta**. Una orden
  pendiente sin llenar se reemplaza con el análisis nuevo.

## Cómo se ejecuta un análisis (lo hace Claude)

1. **Saltar fin de semana**. Si hay una **posición abierta** en XAUUSD
   (`get_mt5_positions`), no se analiza. Si hay una **orden pendiente**
   (`get_mt5_orders`), se analiza y se propone reemplazarla.
2. Descargar datos de Axi (cuenta MT5): `get_mt5_candles` XAUUSD para D1, H4, H1 y
   M5 (≈225 velas por timeframe) y `get_mt5_quote`.
3. `python3 axi_input.py <transcript.jsonl> input.json`. Toma las respuestas de
   Axi del registro de la sesión, así que las velas no se copian a mano.
4. `node engine.js input.json > structure.json`.
5. Claude aplica `prompt_htf_bias.md` sobre D1/H4/H1 (sesgo + score) y después
   `prompt_entry_decision.md` sobre M5 + sesgo, y escribe `decision.json` con el
   formato JSON exacto del prompt.
6. `node finalize.js --structure structure.json --decision decision.json --balance <balance Axi>`.
7. Si `finalData.orderType` es `Buy Limit` / `Sell Limit` y el lote no viene
   `rejected`, Claude muestra la orden y la coloca con `place_mt5_order` **solo
   tras la confirmación del usuario** (el conector de Axi lo exige).

## Diferencias conocidas con n8n

- **Precios**: vienen del servidor MT5 de Axi, no de la hoja "MT4 Feed" ni de
  Twelve Data.
- **Registro**: no se escribe en el Google Sheet "SMC 2".
- **Noticias**: igual que 3.8, no entran en la decisión. Claude sí da al
  usuario un resumen informativo (WebSearch), aparte de la señal.
