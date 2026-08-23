import pytest

from xauusd_sweep_fvg.liquidity import LiquidityLevel
from xauusd_sweep_fvg.setup import Setup
from conftest import at


def _level():
    return LiquidityLevel(kind="low", price=99.0, source="swing", timestamp=at(2))


def test_lifecycle_long_trigger_fill_invalidate():
    setup = Setup(direction="long", sweep_level=_level(), sweep_extreme=98.80, sweep_time=at(10))
    assert setup.state == "watching"
    assert setup.is_active

    setup.trigger(fvg_deep_edge=99.30, fvg_shallow_edge=99.90, target=None, at=at(13))
    assert setup.state == "triggered"
    assert setup.entry == 99.90
    assert setup.stop == 98.80

    assert setup.price_in_entry_zone(low=99.80, high=100.60) is True
    assert setup.price_in_entry_zone(low=100.00, high=100.60) is False

    setup.mark_presumed_filled(at=at(14))
    assert setup.state == "presumed_filled"

    assert setup.price_breaches_stop(98.70) is True
    assert setup.price_breaches_stop(99.00) is False

    setup.invalidate(at=at(15))
    assert setup.state == "invalidated"
    assert not setup.is_active


def test_watching_can_expire():
    setup = Setup(direction="short", sweep_level=_level(), sweep_extreme=101.5, sweep_time=at(0))
    setup.expire(at=at(30))
    assert setup.state == "expired"
    assert not setup.is_active


def test_cannot_trigger_twice():
    setup = Setup(direction="long", sweep_level=_level(), sweep_extreme=98.80, sweep_time=at(0))
    setup.trigger(fvg_deep_edge=99.30, fvg_shallow_edge=99.90, target=None, at=at(5))
    with pytest.raises(ValueError):
        setup.trigger(fvg_deep_edge=99.30, fvg_shallow_edge=99.90, target=None, at=at(6))


def test_invalidate_is_idempotent_terminal():
    setup = Setup(direction="long", sweep_level=_level(), sweep_extreme=98.80, sweep_time=at(0))
    setup.invalidate(at=at(1))
    setup.invalidate(at=at(2))  # no-op, state already terminal
    assert setup.invalidated_time == at(1)
