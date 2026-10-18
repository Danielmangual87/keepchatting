# XAUUSD 3.9-lite en Claude (sin n8n, sin Gemini)

Port del workflow n8n **"XAUUSD 3.9-lite - RR honesto + sombra NY + PD + RR5"**.
Todo el código determinista se conserva tal cual; solo cambian la fuente de
datos y quién toma la decisión:

| n8n | Aquí |
|---|---|
| Sheets "MT4 Feed" (D1/H4/H1/M5 + quote) | Conector **Axi MT5**: `get_mt5_candles` + `get_mt5_quote` |
| `Code: Analyze Market Structure` | `engine.js` (mismas funciones, copiadas) |
| `HTF Bias Node1` (Gemini) | **Claude**, con `prompt_htf_bias.md` |
| `Message a model` (Gemini) | **Claude**, con `prompt_entry_decision.md` → `decision.json` |
| Filter News Risk / Build Alert (PD_BLOCK, RR_BLOCK, NEWS_BLOCK) / Account Config / Lot Size | `finalize.js`, que ejecuta los nodos de `n8n_nodes/` sin cambios |
| Balance desde la pestaña Balance | `get_account` de Axi |
| "Previous trade still OPEN" (Sheet + Twelve Data) | `get_mt5_positions` / `get_mt5_orders` de Axi |
| EA que lee el Sheet y coloca la orden | `place_mt5_order` de Axi, **con confirmación del usuario** |

## Cómo se ejecuta un análisis (lo hace Claude)

1. **Saltar fin de semana** (igual que el `If` de n8n) y **saltar si ya hay una
   posición u orden pendiente en XAUUSD** (`get_mt5_positions`, `get_mt5_orders`).
2. Descargar datos de Axi (cuenta MT5): `get_mt5_candles` XAUUSD para D1, H4, H1 y
   M5 (≈225 velas por timeframe) y `get_mt5_quote`.
3. `python3 axi_input.py <transcript.jsonl> input.json`. Toma las respuestas de
   Axi del registro de la sesión, así que las velas no se copian a mano.
4. `node engine.js input.json > structure.json`.
5. Claude aplica `prompt_htf_bias.md` sobre D1/H4/H1 (sesgo + score) y después
   `prompt_entry_decision.md` sobre M5 + sesgo, y escribe `decision.json` con el
   formato JSON exacto del prompt.
6. `node finalize.js --structure structure.json --decision decision.json --balance <balance Axi> [--calendar ff.json]`.
7. Si `finalData.orderType` es `Buy Limit` / `Sell Limit` y el lote no viene
   `rejected`, Claude muestra la orden y la coloca con `place_mt5_order` **solo
   tras la confirmación del usuario** (el conector de Axi lo exige).

## Diferencias conocidas con n8n

- **Calendario**: `nfs.faireconomy.media` está bloqueado por la red de este
  entorno. Sin `--calendar`, `finalize.js` reproduce el caso en que el fetch
  falla en n8n: `newsDataAvailable=false`, sin `NEWS_BLOCK`. Para recuperar el
  bloqueo por noticia, hay que permitir ese host en la red del entorno y pasar
  el JSON con `--calendar`.
- **Precios**: vienen del servidor MT5 de Axi, no de la hoja "MT4 Feed" ni de
  Twelve Data. El nivel de precios es el del bróker donde se ejecuta.
- **Registro**: no se escribe en el Google Sheet "SMC 2".
