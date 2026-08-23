"""Sweep (stop-run / liquidity grab) detection.

A sweep is a wick beyond a tracked liquidity level that closes back
inside it — the opposite of a clean breakout. Detected on the 1-minute
chart, against the current set of unswept liquidity levels.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .candle import Candle
from .liquidity import LiquidityLevel, LiquidityRegistry


@dataclass
class SweepEvent:
    level: LiquidityLevel
    candle: Candle
    direction: str  # "long" | "short" — the resulting fade bias


class SweepDetector:
    def scan(self, candle: Candle, registry: LiquidityRegistry) -> list[SweepEvent]:
        events: list[SweepEvent] = []

        for level in registry.unswept("high"):
            if level.timestamp >= candle.timestamp:
                continue
            if candle.high > level.price and candle.close < level.price:
                registry.mark_swept(level, candle.timestamp)
                events.append(SweepEvent(level=level, candle=candle, direction="short"))

        for level in registry.unswept("low"):
            if level.timestamp >= candle.timestamp:
                continue
            if candle.low < level.price and candle.close > level.price:
                registry.mark_swept(level, candle.timestamp)
                events.append(SweepEvent(level=level, candle=candle, direction="long"))

        return events
