"""Session high/low tracking (Asia, London, NY) as liquidity sources.

Session windows are defined in UTC using conventional forex session boundaries.
These are configurable so they can be tuned without touching detection logic.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timezone
from typing import Dict, Optional

from .candle import Candle

# Conventional UTC session windows. London/NY overlap is expected and fine —
# both sessions independently track their own high/low over their window.
DEFAULT_SESSION_WINDOWS: Dict[str, tuple[time, time]] = {
    "asia": (time(0, 0), time(8, 0)),
    "london": (time(7, 0), time(16, 0)),
    "ny": (time(12, 0), time(21, 0)),
}


@dataclass
class SessionRange:
    session: str
    date: str  # YYYY-MM-DD (UTC) the session window started on
    high: float
    low: float
    high_time: datetime
    low_time: datetime
    closed: bool = False

    def key(self) -> str:
        return f"{self.session}:{self.date}"


class SessionTracker:
    """Maintains today's and prior sessions' high/low for Asia/London/NY.

    Feed it 1-minute (or finer) candles in chronological order via `update`.
    Once a session window ends, its range is frozen (`closed=True`) and
    becomes an eligible liquidity target until swept.
    """

    def __init__(self, windows: Optional[Dict[str, tuple[time, time]]] = None) -> None:
        self.windows = windows or DEFAULT_SESSION_WINDOWS
        self._ranges: Dict[str, SessionRange] = {}

    def _in_window(self, name: str, t: time) -> bool:
        start, end = self.windows[name]
        if start <= end:
            return start <= t < end
        return t >= start or t < end  # wraps midnight

    def update(self, candle: Candle) -> None:
        ts = candle.timestamp.astimezone(timezone.utc)
        date_str = ts.date().isoformat()
        t = ts.time()

        for name in self.windows:
            in_window = self._in_window(name, t)
            key = f"{name}:{date_str}"
            existing = self._ranges.get(key)

            if in_window:
                if existing is None:
                    self._ranges[key] = SessionRange(
                        session=name,
                        date=date_str,
                        high=candle.high,
                        low=candle.low,
                        high_time=ts,
                        low_time=ts,
                    )
                else:
                    if candle.high > existing.high:
                        existing.high = candle.high
                        existing.high_time = ts
                    if candle.low < existing.low:
                        existing.low = candle.low
                        existing.low_time = ts
            elif existing is not None and not existing.closed:
                existing.closed = True

    def active_ranges(self) -> list[SessionRange]:
        """All tracked session ranges, open or closed, most recent first."""
        return sorted(self._ranges.values(), key=lambda r: (r.date, r.session), reverse=True)

    def closed_ranges(self) -> list[SessionRange]:
        return [r for r in self.active_ranges() if r.closed]
