from xauusd_sweep_fvg.candle import Candle
from xauusd_sweep_fvg.liquidity import LiquidityRegistry
from xauusd_sweep_fvg.sessions import SessionTracker
from xauusd_sweep_fvg.swings import SwingDetector
from xauusd_sweep_fvg.sweep import SweepDetector
from conftest import at


def _c(m, o, h, l, c):
    return Candle(timestamp=at(m), open=o, high=h, low=l, close=c)


def _make_registry_with_swing_low(price=99.0):
    swings = SwingDetector(lookback=2)
    for c in [
        _c(0, 100, 100.0, 99.6, 100),
        _c(1, 100, 100.0, 99.4, 100),
        _c(2, 100, 100.0, price, 100),
        _c(3, 100, 100.0, 99.3, 100),
        _c(4, 100, 100.0, 99.5, 100),
    ]:
        swings.update(c)
    return LiquidityRegistry(SessionTracker(), swings), swings


def test_sweep_of_swing_low_gives_long_bias_and_marks_swept():
    registry, swings = _make_registry_with_swing_low(99.0)
    detector = SweepDetector()

    sweep_candle = _c(10, 99.1, 99.2, 98.8, 99.05)  # wicks below 99.0, closes back above
    events = detector.scan(sweep_candle, registry)

    assert len(events) == 1
    assert events[0].direction == "long"
    assert events[0].level.price == 99.0
    assert swings.swings[0].swept is True
    assert registry.unswept("low") == []


def test_no_sweep_when_close_stays_outside():
    registry, _ = _make_registry_with_swing_low(99.0)
    detector = SweepDetector()

    # closes below the level too -> clean breakout, not a sweep
    breakout_candle = _c(10, 99.1, 99.2, 98.8, 98.85)
    events = detector.scan(breakout_candle, registry)
    assert events == []


def test_level_from_future_ignored():
    registry, _ = _make_registry_with_swing_low(99.0)
    detector = SweepDetector()

    # a candle timestamped before the swing was confirmed shouldn't sweep it
    early_candle = Candle(timestamp=at(1), open=99.1, high=99.2, low=98.8, close=99.05)
    events = detector.scan(early_candle, registry)
    assert events == []
