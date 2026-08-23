"""Displacement + 1-minute Fair Value Gap detection.

A 3-candle FVG (A, B, C) forms when B is a displacement candle that leaves
a gap between A and C:

  bullish (long bias): A.high < C.low  -> gap = [A.high, C.low]
  bearish (short bias): A.low > C.high -> gap = [C.high, A.low]

The middle candle B is the displacement candle: it must move strongly in
the bias direction, which we measure as body size relative to the recent
average candle range (a simple, timeframe-agnostic displacement filter).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .candle import Candle

DEFAULT_DISPLACEMENT_FACTOR = 1.5


@dataclass
class FvgResult:
    deep_edge: float
    shallow_edge: float
    a: Candle
    b: Candle
    c: Candle


def average_range(candles: list[Candle]) -> float:
    if not candles:
        return 0.0
    return sum(c.range for c in candles) / len(candles)


def is_displacement(candle: Candle, direction: str, avg_range: float, factor: float) -> bool:
    if avg_range <= 0:
        return False
    if direction == "long" and not candle.is_bullish:
        return False
    if direction == "short" and not candle.is_bearish:
        return False
    return candle.body >= factor * avg_range


def detect_fvg(
    a: Candle,
    b: Candle,
    c: Candle,
    direction: str,
    avg_range: float,
    displacement_factor: float = DEFAULT_DISPLACEMENT_FACTOR,
) -> Optional[FvgResult]:
    """Check whether candles (a, b, c), in that chronological order, form a
    valid displacement FVG in `direction`. Returns None if not.
    """
    if not is_displacement(b, direction, avg_range, displacement_factor):
        return None

    if direction == "long" and a.high < c.low:
        return FvgResult(deep_edge=a.high, shallow_edge=c.low, a=a, b=b, c=c)
    if direction == "short" and a.low > c.high:
        return FvgResult(deep_edge=a.low, shallow_edge=c.high, a=a, b=b, c=c)
    return None
