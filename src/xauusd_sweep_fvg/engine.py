"""Engine: orchestrates the full sweep -> displacement -> 1m FVG pipeline.

Feed it 1-minute candles (primary, drives detection) and 5-minute candles
(context, drives swing-point structure) in chronological order. It emits
Alerts through whatever AlertSink(s) it's configured with on every setup
state transition.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Optional

from .alerts.base import Alert, AlertSink
from .candle import Candle
from .fvg import DEFAULT_DISPLACEMENT_FACTOR, average_range, detect_fvg
from .liquidity import LiquidityRegistry
from .sessions import SessionTracker
from .setup import Setup
from .sweep import SweepDetector
from .swings import SwingDetector

DEFAULT_WATCHING_EXPIRY = timedelta(minutes=30)
DEFAULT_AVG_RANGE_WINDOW = 20


@dataclass
class EngineConfig:
    watching_expiry: timedelta = DEFAULT_WATCHING_EXPIRY
    displacement_factor: float = DEFAULT_DISPLACEMENT_FACTOR
    avg_range_window: int = DEFAULT_AVG_RANGE_WINDOW
    swing_lookback: int = 2
    max_buffer: int = 500


class Engine:
    def __init__(self, config: Optional[EngineConfig] = None, sinks: Optional[List[AlertSink]] = None) -> None:
        self.config = config or EngineConfig()
        self.sinks = sinks or []

        self.session_tracker = SessionTracker()
        self.swing_detector = SwingDetector(lookback=self.config.swing_lookback)
        self.registry = LiquidityRegistry(self.session_tracker, self.swing_detector)
        self.sweep_detector = SweepDetector()

        self._buffer_1m: List[Candle] = []
        self.setups: List[Setup] = []

    def _emit(self, setup: Setup, message: str) -> None:
        alert = Alert.from_setup(setup, message)
        for sink in self.sinks:
            sink.emit(alert)

    def on_5m_candle(self, candle: Candle) -> None:
        self.swing_detector.update(candle)

    def on_1m_candle(self, candle: Candle) -> None:
        self.session_tracker.update(candle)

        self._buffer_1m.append(candle)
        max_len = self.config.avg_range_window + 3
        if len(self._buffer_1m) > max_len:
            self._buffer_1m.pop(0)

        for event in self.sweep_detector.scan(candle, self.registry):
            setup = Setup(
                direction=event.direction,
                sweep_level=event.level,
                sweep_extreme=candle.high if event.direction == "short" else candle.low,
                sweep_time=candle.timestamp,
            )
            self.setups.append(setup)
            self._emit(setup, f"sweep of {event.level.source} {event.level.kind} @ {event.level.price:.2f}")

        for setup in self.setups:
            if not setup.is_active:
                continue

            if setup.state == "watching":
                self._advance_watching(setup, candle)
            elif setup.state == "triggered":
                self._advance_triggered(setup, candle)
            elif setup.state == "presumed_filled":
                self._advance_filled(setup, candle)

    def _advance_watching(self, setup: Setup, candle: Candle) -> None:
        if candle.timestamp - setup.sweep_time > self.config.watching_expiry:
            setup.expire(candle.timestamp)
            self._emit(setup, "watching setup expired without a 1m FVG forming")
            return

        breached = (
            candle.low <= setup.sweep_extreme if setup.direction == "long" else candle.high >= setup.sweep_extreme
        )
        if breached and candle.timestamp > setup.sweep_time:
            setup.invalidate(candle.timestamp)
            self._emit(setup, "invalidated: price re-breached the sweep extreme before an FVG formed")
            return

        if len(self._buffer_1m) < 3:
            return

        a, b, c = self._buffer_1m[-3], self._buffer_1m[-2], self._buffer_1m[-1]
        if a.timestamp <= setup.sweep_time:
            return  # displacement must start strictly after the sweep candle

        history = self._buffer_1m[:-3][-self.config.avg_range_window :]
        avg_rng = average_range(history) if history else average_range(self._buffer_1m[:-1])

        result = detect_fvg(a, b, c, setup.direction, avg_rng, self.config.displacement_factor)
        if result is None:
            return

        target = self.registry.next_opposing_target(setup.direction, from_price=result.shallow_edge)
        setup.trigger(
            fvg_deep_edge=result.deep_edge,
            fvg_shallow_edge=result.shallow_edge,
            target=target,
            at=candle.timestamp,
        )
        self._emit(setup, "1m FVG confirmed, entry order active")

    def _advance_triggered(self, setup: Setup, candle: Candle) -> None:
        if setup.price_in_entry_zone(candle.low, candle.high):
            setup.mark_presumed_filled(candle.timestamp)
            self._emit(setup, "price traded through the entry zone (presumed filled)")

        extreme = candle.low if setup.direction == "long" else candle.high
        if setup.price_breaches_stop(extreme):
            setup.invalidate(candle.timestamp)
            self._emit(setup, "invalidated: stop level breached")

    def _advance_filled(self, setup: Setup, candle: Candle) -> None:
        extreme = candle.low if setup.direction == "long" else candle.high
        if setup.price_breaches_stop(extreme):
            setup.invalidate(candle.timestamp)
            self._emit(setup, "invalidated: stop level breached after fill")

    def active_setups(self) -> List[Setup]:
        return [s for s in self.setups if s.is_active]
