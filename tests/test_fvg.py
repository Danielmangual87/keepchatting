from xauusd_sweep_fvg.candle import Candle
from xauusd_sweep_fvg.fvg import average_range, detect_fvg, is_displacement
from conftest import at


def _c(m, o, h, l, c):
    return Candle(timestamp=at(m), open=o, high=h, low=l, close=c)


def test_average_range_of_empty_is_zero():
    assert average_range([]) == 0.0


def test_is_displacement_requires_direction_match():
    bullish = _c(0, 99.25, 100.50, 99.20, 100.40)
    assert is_displacement(bullish, "long", avg_range=0.5, factor=1.5)
    assert not is_displacement(bullish, "short", avg_range=0.5, factor=1.5)


def test_is_displacement_requires_size():
    small = _c(0, 100.0, 100.1, 99.9, 100.05)
    assert not is_displacement(small, "long", avg_range=0.5, factor=1.5)


def test_detect_bullish_fvg():
    a = _c(0, 99.10, 99.30, 99.05, 99.25)
    b = _c(1, 99.25, 100.50, 99.20, 100.40)  # displacement
    c = _c(2, 100.40, 100.60, 99.90, 100.55)
    result = detect_fvg(a, b, c, "long", avg_range=0.5, displacement_factor=1.5)
    assert result is not None
    assert result.deep_edge == 99.30  # a.high
    assert result.shallow_edge == 99.90  # c.low


def test_detect_bearish_fvg():
    a = _c(0, 100.90, 100.95, 100.70, 100.75)
    b = _c(1, 100.75, 100.80, 99.50, 99.60)  # displacement down
    c = _c(2, 99.60, 99.65, 99.10, 99.15)
    result = detect_fvg(a, b, c, "short", avg_range=0.5, displacement_factor=1.5)
    assert result is not None
    assert result.deep_edge == 100.70  # a.low
    assert result.shallow_edge == 99.65  # c.high


def test_no_gap_returns_none():
    a = _c(0, 99.10, 99.30, 99.05, 99.25)
    b = _c(1, 99.25, 100.50, 99.20, 100.40)
    c = _c(2, 100.40, 100.60, 99.20, 100.55)  # overlaps a.high, no gap
    result = detect_fvg(a, b, c, "long", avg_range=0.5, displacement_factor=1.5)
    assert result is None


def test_weak_displacement_returns_none():
    a = _c(0, 99.10, 99.30, 99.05, 99.25)
    b = _c(1, 99.25, 99.40, 99.20, 99.35)  # too small
    c = _c(2, 99.35, 99.95, 99.90, 99.92)
    result = detect_fvg(a, b, c, "long", avg_range=0.5, displacement_factor=1.5)
    assert result is None
