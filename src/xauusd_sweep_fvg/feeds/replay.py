"""Replay a historical CSV of 1-minute candles through the engine.

Used for backtesting the detection logic and for demoing the system
without a live data subscription. CSV columns: timestamp,open,high,low,close[,volume]
timestamp must be ISO-8601 (UTC assumed if no offset given).
"""
from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path
from typing import Iterator

from ..candle import Candle


class ReplayFeed:
    def __init__(self, csv_path: str | Path) -> None:
        self.csv_path = Path(csv_path)

    def stream(self) -> Iterator[Candle]:
        with self.csv_path.open(newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                yield Candle(
                    timestamp=datetime.fromisoformat(row["timestamp"]),
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row.get("volume") or 0.0),
                )
