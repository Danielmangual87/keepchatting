"""Unified liquidity level registry: session highs/lows + swing highs/lows.

This is the single source of "sweep targets" the sweep detector scans
against, and the single source of "opposing liquidity" the target
calculator uses once a trade is set up.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from .candle import Candle
from .sessions import SessionTracker
from .swings import SwingDetector


@dataclass
class LiquidityLevel:
    kind: str  # "high" | "low"
    price: float
    source: str  # e.g. "session:asia", "session:london", "swing"
    timestamp: datetime
    swept: bool = False
    swept_at: Optional[datetime] = None


class LiquidityRegistry:
    """Wraps a SessionTracker (fed 1m candles) and a SwingDetector (fed
    5m candles, by convention) and exposes a merged, de-duplicated view
    of tracked liquidity levels for sweep detection and target selection.
    """

    def __init__(self, session_tracker: SessionTracker, swing_detector: SwingDetector) -> None:
        self.sessions = session_tracker
        self.swings = swing_detector
        self._swept_session_keys: set[str] = set()

    def levels(self) -> List[LiquidityLevel]:
        out: List[LiquidityLevel] = []
        for rng in self.sessions.closed_ranges():
            swept = f"{rng.key()}:high" in self._swept_session_keys
            out.append(
                LiquidityLevel(
                    kind="high",
                    price=rng.high,
                    source=f"session:{rng.session}",
                    timestamp=rng.high_time,
                    swept=swept,
                )
            )
            swept = f"{rng.key()}:low" in self._swept_session_keys
            out.append(
                LiquidityLevel(
                    kind="low",
                    price=rng.low,
                    source=f"session:{rng.session}",
                    timestamp=rng.low_time,
                    swept=swept,
                )
            )
        for sw in self.swings.swings:
            out.append(
                LiquidityLevel(
                    kind=sw.kind,
                    price=sw.price,
                    source="swing",
                    timestamp=sw.timestamp,
                    swept=sw.swept,
                )
            )
        return out

    def unswept(self, kind: Optional[str] = None) -> List[LiquidityLevel]:
        return [lvl for lvl in self.levels() if not lvl.swept and (kind is None or lvl.kind == kind)]

    def mark_swept(self, level: LiquidityLevel, at: datetime) -> None:
        if level.source == "swing":
            for sw in self.swings.swings:
                if sw.kind == level.kind and sw.price == level.price and sw.timestamp == level.timestamp:
                    sw.swept = True
        else:
            for rng in self.sessions.closed_ranges():
                if f"session:{rng.session}" == level.source:
                    if level.kind == "high" and rng.high == level.price:
                        self._swept_session_keys.add(f"{rng.key()}:high")
                    if level.kind == "low" and rng.low == level.price:
                        self._swept_session_keys.add(f"{rng.key()}:low")

    def next_opposing_target(self, direction: str, from_price: float) -> Optional[LiquidityLevel]:
        """Nearest unswept level in the trade direction from `from_price`.

        direction="long" -> nearest unswept high above from_price (target for a long).
        direction="short" -> nearest unswept low below from_price.
        """
        if direction == "long":
            candidates = [lvl for lvl in self.unswept("high") if lvl.price > from_price]
            return min(candidates, key=lambda lvl: lvl.price) if candidates else None
        if direction == "short":
            candidates = [lvl for lvl in self.unswept("low") if lvl.price < from_price]
            return max(candidates, key=lambda lvl: lvl.price) if candidates else None
        raise ValueError(f"unknown direction {direction!r}")
