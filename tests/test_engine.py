from datetime import timedelta

from xauusd_sweep_fvg.candle import Candle
from xauusd_sweep_fvg.engine import Engine, EngineConfig
from conftest import at


def _c(m, o, h, l, c):
    return Candle(timestamp=at(m), open=o, high=h, low=l, close=c)


def _seed_swings(engine: Engine) -> None:
    """5m candles: a swing low at 99.0 (idx2) and a swing high at 101.5 (idx6)."""
    fives = [
        (0, 100, 100.0, 99.6, 100),
        (5, 100, 100.0, 99.4, 100),
        (10, 100, 100.0, 99.0, 100),
        (15, 100, 100.0, 99.3, 100),
        (20, 100, 100.0, 99.5, 100),
        (25, 100, 101.0, 99.6, 100),
        (30, 100, 101.5, 99.6, 100),
        (35, 100, 101.0, 99.6, 100),
        (40, 100, 100.8, 99.6, 100),
    ]
    for m, o, h, l, c in fives:
        engine.on_5m_candle(Candle(timestamp=at(m), open=o, high=h, low=l, close=c))


def test_full_long_lifecycle_trigger_fill_invalidate():
    engine = Engine(config=EngineConfig())
    _seed_swings(engine)

    # quiet 1m candles establishing a low average range, well above the swing low
    for i in range(10):
        m = 60 + i
        engine.on_1m_candle(_c(m, 99.55, 99.65, 99.45, 99.55))

    sweep = _c(70, 99.05, 99.15, 98.80, 99.10)  # wicks below 99.0, closes back above
    engine.on_1m_candle(sweep)

    setups = engine.setups
    assert len(setups) == 1
    setup = setups[0]
    assert setup.direction == "long"
    assert setup.state == "watching"
    assert setup.sweep_extreme == 98.80

    p1 = _c(71, 99.10, 99.30, 99.05, 99.25)
    p2 = _c(72, 99.25, 100.50, 99.20, 100.40)  # displacement
    p3 = _c(73, 100.40, 100.60, 99.90, 100.55)  # completes the FVG (gap 99.30 -> 99.90)
    engine.on_1m_candle(p1)
    engine.on_1m_candle(p2)
    engine.on_1m_candle(p3)

    assert setup.state == "triggered"
    assert setup.entry == 99.90
    assert setup.stop == 98.80
    assert setup.target is not None
    assert setup.target.price == 101.5  # nearest unswept swing high

    p4 = _c(74, 100.55, 100.60, 99.80, 100.00)  # trades back through the entry zone
    engine.on_1m_candle(p4)
    assert setup.state == "presumed_filled"

    p5 = _c(75, 99.00, 99.05, 98.70, 98.75)  # breaches the stop
    engine.on_1m_candle(p5)
    assert setup.state == "invalidated"
    assert not setup.is_active


def test_watching_setup_expires_without_fvg():
    engine = Engine(config=EngineConfig(watching_expiry=timedelta(minutes=5)))
    _seed_swings(engine)

    for i in range(5):
        engine.on_1m_candle(_c(60 + i, 99.55, 99.65, 99.45, 99.55))

    sweep = _c(65, 99.05, 99.15, 98.80, 99.10)
    engine.on_1m_candle(sweep)
    setup = engine.setups[0]
    assert setup.state == "watching"

    # drift sideways past the expiry window without ever forming an FVG
    for i in range(1, 8):
        engine.on_1m_candle(_c(65 + i, 99.10, 99.20, 99.05, 99.12))

    assert setup.state == "expired"
    assert not setup.is_active


def test_invalidated_while_still_watching():
    engine = Engine(config=EngineConfig())
    _seed_swings(engine)

    for i in range(5):
        engine.on_1m_candle(_c(60 + i, 99.55, 99.65, 99.45, 99.55))

    sweep = _c(65, 99.05, 99.15, 98.80, 99.10)
    engine.on_1m_candle(sweep)
    setup = engine.setups[0]

    # price dives back through the sweep extreme before any FVG forms
    engine.on_1m_candle(_c(66, 99.10, 99.15, 98.60, 98.70))
    assert setup.state == "invalidated"
