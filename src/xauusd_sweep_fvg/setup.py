"""Setup (trade idea) state machine.

Each detected sweep spawns a Setup that is tracked over time through:

    watching -> triggered -> presumed_filled
       |            |
       v            v
    expired     invalidated (can also occur from watching, or after fill)
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from .liquidity import LiquidityLevel

_id_counter = itertools.count(1)


@dataclass
class Setup:
    direction: str  # "long" | "short"
    sweep_level: LiquidityLevel
    sweep_extreme: float  # the wick price of the sweep (stop-loss basis)
    sweep_time: datetime

    id: int = field(default_factory=lambda: next(_id_counter))
    state: str = "watching"

    # Filled in once the 1m FVG forms (state -> triggered)
    fvg_deep_edge: Optional[float] = None
    fvg_shallow_edge: Optional[float] = None
    entry: Optional[float] = None
    stop: Optional[float] = None
    target: Optional[LiquidityLevel] = None
    triggered_time: Optional[datetime] = None

    presumed_filled_time: Optional[datetime] = None
    invalidated_time: Optional[datetime] = None
    expired_time: Optional[datetime] = None

    def trigger(
        self,
        *,
        fvg_deep_edge: float,
        fvg_shallow_edge: float,
        target: Optional[LiquidityLevel],
        at: datetime,
    ) -> None:
        if self.state != "watching":
            raise ValueError(f"cannot trigger setup {self.id} from state {self.state}")
        self.fvg_deep_edge = fvg_deep_edge
        self.fvg_shallow_edge = fvg_shallow_edge
        self.entry = fvg_shallow_edge
        self.stop = self.sweep_extreme
        self.target = target
        self.triggered_time = at
        self.state = "triggered"

    def mark_presumed_filled(self, at: datetime) -> None:
        if self.state != "triggered":
            raise ValueError(f"cannot fill setup {self.id} from state {self.state}")
        self.presumed_filled_time = at
        self.state = "presumed_filled"

    def invalidate(self, at: datetime) -> None:
        if self.state in ("invalidated", "expired"):
            return
        self.invalidated_time = at
        self.state = "invalidated"

    def expire(self, at: datetime) -> None:
        if self.state != "watching":
            raise ValueError(f"cannot expire setup {self.id} from state {self.state}")
        self.expired_time = at
        self.state = "expired"

    @property
    def is_active(self) -> bool:
        return self.state in ("watching", "triggered", "presumed_filled")

    def price_breaches_stop(self, price: float) -> bool:
        if self.direction == "long":
            return price <= self.stop if self.stop is not None else price <= self.sweep_extreme
        return price >= self.stop if self.stop is not None else price >= self.sweep_extreme

    def price_in_entry_zone(self, low: float, high: float) -> bool:
        """True if a candle's [low, high] range traded through the FVG entry zone."""
        if self.fvg_deep_edge is None or self.fvg_shallow_edge is None:
            return False
        zone_low = min(self.fvg_deep_edge, self.fvg_shallow_edge)
        zone_high = max(self.fvg_deep_edge, self.fvg_shallow_edge)
        return high >= zone_low and low <= zone_high
