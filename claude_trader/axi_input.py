"""Arma el input.json de engine.js con las velas que Claude descargo de Axi MT5.

Claude llama al conector de Axi (get_mt5_candles para D1/H4/H1/M5 y
get_mt5_quote). Esas respuestas quedan en el registro de la sesion de Claude
Code (un .jsonl); este script toma la respuesta MAS RECIENTE de cada periodo y
la convierte al formato que espera el motor, sin copiar velas a mano.

Uso:
    python3 axi_input.py <sesion.jsonl> <salida.json> [--limit 225]
"""

import argparse
import json
from datetime import datetime, timezone

PERIODS = ("D1", "H4", "H1", "M5")


def tool_result_text(block):
    content = block.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if part.get("type") == "text")
    return ""


def latest_axi_results(transcript_path):
    uses = {}
    candles = {}
    quote = None
    with open(transcript_path, encoding="utf-8") as fh:
        for line in fh:
            entry = json.loads(line)
            content = (entry.get("message") or {}).get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if block.get("type") == "tool_use" and block.get("name", "").startswith("mcp__Axi__"):
                    uses[block["id"]] = (block["name"], block.get("input") or {})
                elif block.get("type") == "tool_result" and block.get("tool_use_id") in uses:
                    name, args = uses[block["tool_use_id"]]
                    try:
                        data = json.loads(tool_result_text(block))
                    except ValueError:
                        continue
                    if name.endswith("get_mt5_candles") and isinstance(data, list):
                        candles[args.get("period") or "M1"] = (args.get("symbol"), data)
                    elif name.endswith("get_mt5_quote") and isinstance(data, dict):
                        quote = data
    return candles, quote


def to_engine_candle(c):
    t = datetime.fromisoformat(c["time"]).astimezone(timezone.utc)
    return {
        "datetime": t.strftime("%Y-%m-%d %H:%M:%S"),
        "open": c["open"],
        "high": c["high"],
        "low": c["low"],
        "close": c["close"],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("transcript")
    ap.add_argument("output")
    ap.add_argument("--limit", type=int, default=225, help="velas por timeframe (las mas recientes)")
    args = ap.parse_args()

    candles, quote = latest_axi_results(args.transcript)
    missing = [p for p in PERIODS if p not in candles]
    if missing:
        raise SystemExit(f"Faltan velas de Axi para: {', '.join(missing)}")
    if quote is None:
        raise SystemExit("Falta la cotizacion (get_mt5_quote)")

    raw_symbol = quote["symbol"]
    # n8n mostraba el par como "XAU/USD"; se conserva para que los filtros por
    # simbolo (piso del SL, calculo de lote) se comporten igual.
    symbol = raw_symbol[:3] + "/" + raw_symbol[3:] if len(raw_symbol) == 6 else raw_symbol

    out = {
        "symbol": symbol,
        "mt5Symbol": raw_symbol,
        "quote": {
            "close": quote["bid"],
            "bid": quote["bid"],
            "ask": quote["ask"],
            "datetime": quote["time"],
            "tradeSessionOpen": quote.get("tradeSessionOpen"),
        },
    }
    for p in PERIODS:
        series = sorted((to_engine_candle(c) for c in candles[p][1]), key=lambda c: c["datetime"])
        out[p] = series[-args.limit:]

    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
    counts = ", ".join(f"{p}={len(out[p])}" for p in PERIODS)
    print(f"{symbol} precio {quote['bid']} ({quote['time']}) | velas {counts}")


if __name__ == "__main__":
    main()
