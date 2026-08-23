import pytest

from xauusd_sweep_fvg.candle import Candle
from conftest import at


def test_naive_timestamp_gets_utc():
    c = Candle(timestamp=at(0), open=1, high=2, low=0.5, close=1.5)
    assert c.timestamp.tzinfo is not None


def test_high_below_low_rejected():
    with pytest.raises(ValueError):
        Candle(timestamp=at(0), open=1, high=0.5, low=2, close=1)


def test_bullish_bearish():
    up = Candle(timestamp=at(0), open=1, high=2, low=0.5, close=1.8)
    down = Candle(timestamp=at(0), open=1.8, high=2, low=0.5, close=1)
    assert up.is_bullish and not up.is_bearish
    assert down.is_bearish and not down.is_bullish
    assert up.range == pytest.approx(1.5)
    assert up.body == pytest.approx(0.8)
