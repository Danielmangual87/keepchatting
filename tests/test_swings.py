from xauusd_sweep_fvg.candle import Candle
from xauusd_sweep_fvg.swings import SwingDetector
from conftest import at


def _c(m, o, h, l, c):
    return Candle(timestamp=at(m), open=o, high=h, low=l, close=c)


def test_low_fractal_confirms_after_lookback():
    det = SwingDetector(lookback=2)
    candles = [
        _c(0, 100, 100.0, 99.6, 100),
        _c(1, 100, 100.0, 99.4, 100),
        _c(2, 100, 100.0, 99.0, 100),  # pivot: lowest low
        _c(3, 100, 100.0, 99.3, 100),
        _c(4, 100, 100.0, 99.5, 100),
    ]
    found = [det.update(c) for c in candles]
    assert found[0] is None and found[1] is None
    assert found[-1] is not None
    lows = [s for s in det.swings if s.kind == "low"]
    assert len(lows) == 1
    assert lows[0].price == 99.0
    assert lows[0].timestamp == at(2)


def test_high_fractal_confirms_after_lookback():
    det = SwingDetector(lookback=2)
    candles = [
        _c(0, 100, 100.5, 99.6, 100),
        _c(1, 100, 100.8, 99.6, 100),
        _c(2, 100, 101.5, 99.6, 100),  # pivot: highest high
        _c(3, 100, 100.9, 99.6, 100),
        _c(4, 100, 100.6, 99.6, 100),
    ]
    for c in candles:
        det.update(c)
    highs = [s for s in det.swings if s.kind == "high"]
    assert len(highs) == 1
    assert highs[0].price == 101.5


def test_unswept_filter():
    det = SwingDetector(lookback=2)
    candles = [
        _c(0, 100, 100.0, 99.6, 100),
        _c(1, 100, 100.0, 99.4, 100),
        _c(2, 100, 100.0, 99.0, 100),
        _c(3, 100, 100.0, 99.3, 100),
        _c(4, 100, 100.0, 99.5, 100),
    ]
    for c in candles:
        det.update(c)
    assert len(det.unswept("low")) == 1
    det.swings[0].swept = True
    assert len(det.unswept("low")) == 0
