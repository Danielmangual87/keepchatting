"""Drives an Engine from a Feed: consumes the 1m candle stream, derives 5m
candles by resampling, and dispatches both to the engine in causal order
(a 5m bar is only handed to the engine once its 5th constituent 1m bar has
closed, so swing detection never sees data from the future).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from .candle import Candle
from .engine import Engine
from .feeds.base import Feed


def _bucket_start(ts: datetime, minutes: int = 5) -> datetime:
    ts = ts.astimezone(timezone.utc)
    floored_minute = (ts.minute // minutes) * minutes
    return ts.replace(minute=floored_minute, second=0, microsecond=0)


def run(engine: Engine, feed: Feed) -> None:
    buckets: Dict[datetime, List[Candle]] = defaultdict(list)

    for candle in feed.stream():
        engine.on_1m_candle(candle)

        bucket = _bucket_start(candle.timestamp)
        group = buckets[bucket]
        group.append(candle)

        if len(group) >= 5:
            five_min = Candle(
                timestamp=bucket,
                open=group[0].open,
                high=max(c.high for c in group),
                low=min(c.low for c in group),
                close=group[-1].close,
                volume=sum(c.volume for c in group),
            )
            engine.on_5m_candle(five_min)
            del buckets[bucket]
