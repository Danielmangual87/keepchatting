"""Junta en un archivo por timeframe las velas de Axi MT5 que quedaron en los
registros de la sesion (sesion principal y subagentes).

Uso:
    python3 collect_axi.py <salida_dir> <transcript.jsonl> [<transcript.jsonl> ...] [--symbol XAUUSD]

Escribe <salida_dir>/<SYMBOL>_<PERIODO>.json: lista de velas
{"t": epoch_utc, "o", "h", "l", "c"} ordenada y sin duplicados.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from axi_input import tool_result_text  # noqa: E402


def collect(paths, symbol):
    series = {}
    for path in paths:
        uses = {}
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                entry = json.loads(line)
                content = (entry.get("message") or {}).get("content")
                if not isinstance(content, list):
                    continue
                for block in content:
                    if block.get("type") == "tool_use" and block.get("name", "").endswith("get_mt5_candles"):
                        uses[block["id"]] = block.get("input") or {}
                    elif block.get("type") == "tool_result" and block.get("tool_use_id") in uses:
                        args = uses[block["tool_use_id"]]
                        if args.get("symbol") != symbol:
                            continue
                        try:
                            data = json.loads(tool_result_text(block))
                        except ValueError:
                            continue
                        if not isinstance(data, list):
                            continue
                        bucket = series.setdefault(args.get("period") or "M1", {})
                        for c in data:
                            t = int(datetime.fromisoformat(c["time"]).timestamp())
                            bucket[t] = {"t": t, "o": c["open"], "h": c["high"], "l": c["low"], "c": c["close"]}
    return {p: [b[t] for t in sorted(b)] for p, b in series.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir")
    ap.add_argument("transcripts", nargs="+")
    ap.add_argument("--symbol", default="XAUUSD")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    for period, bars in sorted(collect(args.transcripts, args.symbol).items()):
        with open(os.path.join(args.out_dir, f"{args.symbol}_{period}.json"), "w", encoding="utf-8") as fh:
            json.dump(bars, fh)
        first = datetime.fromtimestamp(bars[0]["t"], timezone.utc).isoformat()
        last = datetime.fromtimestamp(bars[-1]["t"], timezone.utc).isoformat()
        print(f"{period}: {len(bars)} velas {first} -> {last}")


if __name__ == "__main__":
    main()
