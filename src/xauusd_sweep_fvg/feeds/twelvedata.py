"""Live 1-minute XAUUSD feed via Twelve Data's REST API (polling).

This is one concrete live feed implementation behind the `Feed` protocol —
swap in any other data vendor by implementing `.stream()` the same way.
No broker/order-execution code lives here or anywhere else in this
package: this is alert/dashboard only.

Requires:
    pip install requests
    export TWELVEDATA_API_KEY=...   # https://twelvedata.com (free tier works)
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Iterator, Optional

from ..candle import Candle

API_URL = "https://api.twelvedata.com/time_series"


class TwelveDataFeed:
    def __init__(
        self,
        symbol: str = "XAU/USD",
        api_key: Optional[str] = None,
        poll_seconds: int = 20,
        outputsize: int = 5,
    ) -> None:
        self.symbol = symbol
        self.api_key = api_key or os.environ.get("TWELVEDATA_API_KEY")
        if not self.api_key:
            raise RuntimeError(
                "TWELVEDATA_API_KEY is not set. Get a free key at https://twelvedata.com "
                "and export it, or pass api_key= explicitly."
            )
        self.poll_seconds = poll_seconds
        self.outputsize = outputsize

    def _fetch(self) -> list[Candle]:
        params = {
            "symbol": self.symbol,
            "interval": "1min",
            "outputsize": str(self.outputsize),
            "apikey": self.api_key,
            "format": "JSON",
            "order": "ASC",
        }
        url = f"{API_URL}?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=15) as resp:
            payload = json.loads(resp.read())

        if payload.get("status") == "error":
            raise RuntimeError(f"Twelve Data error: {payload.get('message')}")

        out = []
        for row in payload.get("values", []):
            out.append(
                Candle(
                    timestamp=datetime.fromisoformat(row["datetime"]).replace(tzinfo=timezone.utc),
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row.get("volume") or 0.0),
                )
            )
        return out

    def stream(self) -> Iterator[Candle]:
        """Polls forever, yielding each new closed 1m candle exactly once."""
        last_ts: Optional[datetime] = None
        while True:
            try:
                for candle in self._fetch():
                    if last_ts is None or candle.timestamp > last_ts:
                        last_ts = candle.timestamp
                        yield candle
            except (urllib.error.URLError, RuntimeError, ValueError) as exc:
                print(f"[twelvedata feed] fetch failed, retrying: {exc}")
            time.sleep(self.poll_seconds)
