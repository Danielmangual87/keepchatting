from datetime import datetime, timedelta

from xauusd_sweep_fvg.candle import Candle
from xauusd_sweep_fvg.sessions import SessionTracker


def _c(ts, o, h, l, c):
    return Candle(timestamp=ts, open=o, high=h, low=l, close=c)


def test_asia_session_high_low_and_close():
    tracker = SessionTracker()
    base = datetime(2026, 1, 1, 0, 0)

    tracker.update(_c(base, 100, 101, 99, 100))
    tracker.update(_c(base + timedelta(minutes=30), 100, 105, 98, 100))
    tracker.update(_c(base + timedelta(hours=4), 100, 102, 97, 100))

    ranges = tracker.closed_ranges()
    assert ranges == []  # still inside the Asia window (00:00-08:00)

    # step outside the window to close it
    tracker.update(_c(base + timedelta(hours=9), 100, 100.5, 99.5, 100))

    closed = tracker.closed_ranges()
    asia = [r for r in closed if r.session == "asia"][0]
    assert asia.high == 105
    assert asia.low == 97
    assert asia.closed is True


def test_sessions_track_independently_per_day():
    tracker = SessionTracker()
    day1 = datetime(2026, 1, 1, 1, 0)
    day2 = datetime(2026, 1, 2, 1, 0)

    tracker.update(_c(day1, 100, 110, 90, 100))
    tracker.update(_c(day1 + timedelta(hours=8), 100, 100, 100, 100))  # closes day1 asia
    tracker.update(_c(day2, 100, 120, 80, 100))
    tracker.update(_c(day2 + timedelta(hours=8), 100, 100, 100, 100))  # closes day2 asia

    closed = [r for r in tracker.closed_ranges() if r.session == "asia"]
    assert len(closed) == 2
    highs = sorted(r.high for r in closed)
    assert highs == [110, 120]
