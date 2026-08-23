# XAUUSD Sweep → 1-Minute FVG Reversal — Alert System

A live alert/dashboard system implementing the strategy in
[`SPEC.md`](./SPEC.md): fade a liquidity sweep on XAUUSD once it displaces
into a 1-minute Fair Value Gap, across all trading hours (no Silver Bullet
time-window filter, no 15m bias filter, no order-block logic).

**Alert/dashboard only.** Nothing in this repo places broker orders.

## Architecture

```
feed (1m candles) --> runner (derives 5m by resampling) --> Engine
                                                                |
                              SessionTracker (Asia/London/NY H/L, from 1m)
                              SwingDetector  (fractal swing H/L, from 5m)
                                       \        /
                                   LiquidityRegistry
                                          |
                                   SweepDetector  -> spawns Setup(watching)
                                          |
                          displacement + 1m FVG check each new 1m candle
                                          |
                                   Setup state machine -> AlertSink(s)
```

| Module | Responsibility |
|---|---|
| `candle.py` | OHLC bar model |
| `sessions.py` | Asia/London/NY session high/low, frozen once the session window closes |
| `swings.py` | Williams-fractal swing high/low detection (configurable lookback) |
| `liquidity.py` | Merges session + swing levels into one sweep-target / target-selection registry |
| `sweep.py` | Wick-beyond-level-and-close-back-inside detection |
| `fvg.py` | Displacement filter (body vs. recent avg range) + 3-candle 1m FVG detection, shallow/deep edges |
| `setup.py` | Per-setup state machine: `watching → triggered → presumed_filled`, with `invalidated`/`expired` branches |
| `engine.py` | Orchestrates the above per incoming candle, emits `Alert`s on every state transition |
| `runner.py` | Feeds a `Feed`'s 1m stream into the engine, deriving causally-correct 5m bars along the way |
| `feeds/replay.py` | CSV replay feed (backtesting / demo) |
| `feeds/twelvedata.py` | Live 1m polling feed via Twelve Data's REST API |
| `alerts/console.py` | Prints each alert |
| `alerts/dashboard.py` | Local Flask dashboard: active setups + alert log, polls `/api/setups` and `/api/alerts` every 3s |

## Open implementation decisions (resolved)

The spec left these for build time:

- **Swing detection**: classic 5-candle Williams fractal (`lookback=2`, i.e. 2 candles
  each side), run on the **5-minute** chart to keep structure stable while the
  1-minute chart stays noisy scalping territory. Session highs/lows are tracked
  from the 1-minute chart for precision.
- **`watching` expiry**: 30 minutes by default (`EngineConfig.watching_expiry`).
  If a sweep doesn't produce a displacement + 1m FVG within that window, the
  setup expires rather than staying live indefinitely.
- **Multiple simultaneous setups**: allowed. The spec explicitly wants every
  valid sequence alerted with no discretionary filtering, so the engine tracks
  an unbounded list of concurrent setups, each independently state-tracked.
- **Delivery format**: local dashboard (Flask, auto-refreshing table of active
  setups + alert log) plus console/log output — same pattern as the prior
  gold-alert-system decision against broker-API auto-trading.
- **Displacement definition**: the FVG's middle candle must be a body of at least
  `1.5x` (`EngineConfig.displacement_factor`) the recent average 1m candle range,
  and in the bias direction. This is what "displacement" cashes out to
  algorithmically — a purely relative, timeframe-agnostic filter rather than a
  fixed pip/point threshold, since gold's volatility regime shifts over time.

## Entry, stop, target mechanics

For a 3-candle 1m FVG `(A, B, C)` where `B` is the displacement candle:

- **Long** (swept a low): gap = `[A.high, C.low]`. Shallow edge (entry) = `C.low`.
  Deep edge = `A.high`.
- **Short** (swept a high): gap = `[C.high, A.low]`. Shallow edge (entry) = `C.high`.
  Deep edge = `A.low`.
- **Stop**: the sweep candle's extreme wick price (`sweep_extreme`).
- **Target**: the nearest unswept opposing liquidity level (session or swing
  high/low) in the trade's direction, via `LiquidityRegistry.next_opposing_target`.

## Setup states

`watching` → `triggered` (1m FVG confirmed, entry order "active") →
`presumed_filled` (price traded back through the entry zone). `invalidated`
fires whenever price breaches the stop, from any active state. `expired`
fires only from `watching`, once `watching_expiry` elapses without a
qualifying FVG.

## Running it

```bash
pip install -r requirements.txt

# Replay a historical (or synthetic demo) 1m CSV through the engine:
python -m xauusd_sweep_fvg replay data/sample_1m.csv

# ...with the local dashboard (serves after replay completes, until Ctrl+C):
python -m xauusd_sweep_fvg replay data/sample_1m.csv --dashboard
# -> http://127.0.0.1:8765

# Live mode (requires a Twelve Data API key: https://twelvedata.com):
export TWELVEDATA_API_KEY=...
python -m xauusd_sweep_fvg live --dashboard
```

`data/sample_1m.csv` is a small synthetic dataset (no real market data) built
to walk through one full setup lifecycle: sweep → watching → 1m FVG →
triggered → presumed_filled, for demoing the pipeline end to end.

CSV format for replay: `timestamp,open,high,low,close,volume` with
ISO-8601 timestamps.

## Tests

```bash
pip install -r requirements.txt
pytest
```

Covers: swing fractal confirmation, session high/low tracking and daily
reset, sweep detection (including the "close stays outside = breakout, not
a sweep" and future-level cases), displacement + FVG edge calculation, the
setup state machine's transition rules, and two end-to-end engine scenarios
(full trigger → fill → invalidate lifecycle, and a `watching` setup aging
out).

## Extending to another live feed

Implement `Feed.stream() -> Iterator[Candle]` yielding chronological 1-minute
candles (see `feeds/twelvedata.py`); `runner.run()` handles 5m derivation and
dispatch to the engine identically regardless of source.
