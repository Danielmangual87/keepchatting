"""Fractal swing high/low detection.

A swing high/low is confirmed once `lookback` candles have closed on both
sides of the pivot without making a higher high / lower low. This is the
standard Williams-fractal definition, run on a rolling buffer so it works
on a live streaming feed (a swing is only confirmed `lookback` candles
after it actually formed — that lag is unavoidable with any fractal
definition).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from .candle import Candle

DEFAULT_LOOKBACK = 2  # 2 candles each side => classic 5-candle fractal


@dataclass
class SwingPoint:
    kind: str  # "high" | "low"
    price: float
    timestamp: datetime
    swept: bool = False


class SwingDetector:
    """Feed candles in chronological order via `update`; confirmed swings
    accumulate in `.swings`. Intended to run on the 5-minute chart to keep
    swing structure stable (configurable by feeding whichever timeframe's
    candles you want swings detected on).
    """

    def __init__(self, lookback: int = DEFAULT_LOOKBACK, max_buffer: int = 500) -> None:
        if lookback < 1:
            raise ValueError("lookback must be >= 1")
        self.lookback = lookback
        self.max_buffer = max_buffer
        self._buffer: List[Candle] = []
        self.swings: List[SwingPoint] = []

    def update(self, candle: Candle) -> Optional[SwingPoint]:
        self._buffer.append(candle)
        if len(self._buffer) > self.max_buffer:
            self._buffer.pop(0)

        window = 2 * self.lookback + 1
        if len(self._buffer) < window:
            return None

        pivot_idx = len(self._buffer) - 1 - self.lookback
        segment = self._buffer[pivot_idx - self.lookback : pivot_idx + self.lookback + 1]
        pivot = self._buffer[pivot_idx]

        is_high = all(pivot.high >= c.high for c in segment) and any(
            pivot.high > c.high for c in segment if c is not pivot
        )
        is_low = all(pivot.low <= c.low for c in segment) and any(
            pivot.low < c.low for c in segment if c is not pivot
        )

        found: Optional[SwingPoint] = None
        if is_high:
            found = SwingPoint(kind="high", price=pivot.high, timestamp=pivot.timestamp)
            self.swings.append(found)
        if is_low:
            low_swing = SwingPoint(kind="low", price=pivot.low, timestamp=pivot.timestamp)
            self.swings.append(low_swing)
            found = found or low_swing
        return found

    def unswept(self, kind: Optional[str] = None) -> List[SwingPoint]:
        return [s for s in self.swings if not s.swept and (kind is None or s.kind == kind)]
