"""Feed protocol: anything that can hand chronological 1-minute candles to
the engine implements this. 5-minute candles are derived from the 1-minute
stream by the runner (see `xauusd_sweep_fvg.runner`), so every feed —
replay or live — only has to produce one thing: 1m OHLC bars in order.
"""
from __future__ import annotations

from typing import Iterator, Protocol

from ..candle import Candle


class Feed(Protocol):
    def stream(self) -> Iterator[Candle]:
        ...
