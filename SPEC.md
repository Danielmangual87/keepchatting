# XAUUSD Sweep → 1-Minute FVG Reversal — Strategy Spec

## Origin
Derived from backtesting of 25,000+ configurations of the ICT "Silver Bullet" framework.
Testing showed the named time windows (London 3-4am, NY AM 10-11am, NY PM 2-3pm) provide
**no measurable edge** over other hours — so this spec drops the time-window restriction
entirely and keeps only the elements that tested as consistently profitable.

## Instrument
XAUUSD (gold) only.

## Session Filter
None. Evaluate setups across all trading hours — testing showed no benefit to restricting
to specific windows.

## Core Setup Sequence

1. **Liquidity mapping**
   Track two categories of liquidity as sweep targets:
   - Session highs/lows (Asia, London, NY)
   - Recent swing highs/lows (standard fractal/pivot swing points)

2. **Sweep trigger**
   Price wicks beyond a tracked liquidity level and closes back inside it
   (i.e., a stop-run / liquidity grab, not a clean breakout).

3. **Directional bias**
   Fade the sweep:
   - Swept a high → bias short
   - Swept a low → bias long

4. **Displacement confirmation**
   A strong directional candle (or sequence) moving away from the sweep, in the
   direction of the new bias, with enough range to leave an imbalance.

5. **Entry zone: 1-minute Fair Value Gap only**
   The displacement must leave a 3-candle FVG on the **1-minute chart**.
   5-minute FVGs are explicitly excluded — they underperformed in testing.

6. **Entry price**
   Pending limit order at the **shallow edge** of the FVG — the edge closest to
   current price when the gap forms (not the 50% midpoint, not the deep edge).

7. **Stop-loss**
   Placed beyond the sweep wick (the extreme of the liquidity grab).

8. **Target**
   The opposing liquidity level — next session high/low or swing point in the
   direction of the trade.

9. **Frequency**
   No discretionary filtering. Every valid sweep → displacement → 1min FVG
   sequence generates an alert. Edge per trade is small; frequency is part of
   the edge.

10. **Explicitly excluded**
    - No 15-minute structural bias filter (tested negative impact)
    - No order-block entries or targets
    - No restriction to Silver Bullet time windows

## System Behavior (live alert system, not auto-execution)

Same architecture pattern as the existing gold-alert-system project:

- Claude Code watches the live 1-min (and 5-min for context) XAUUSD chart
- Maintains a running map of session highs/lows and recent swing points
- Detects sweep events in real time
- Watches for displacement + 1-min FVG formation following a sweep
- On FVG formation, computes entry (shallow edge), stop (sweep wick), target
  (opposing liquidity) and fires an alert
- **No live order execution** — alert/dashboard only, matching prior decision
  against broker API auto-trading

### Zone/setup state tracking
Each detected setup should carry a state, tracked over time rather than
fired once:
- `watching` — sweep detected, waiting on FVG formation
- `triggered` — FVG formed, entry alert fired
- `presumed_filled` — price traded through the entry zone
- `invalidated` — stop level breached before/after entry
- `expired` — setup aged out without triggering

## Open Implementation Details (to resolve during build)
- Exact swing-point detection method (lookback length / fractal definition)
- How long a `watching` setup stays valid before expiring
- Whether multiple simultaneous setups are allowed or only one active at a time
- Delivery format for alerts (local dashboard, as decided for gold-alert-system)

See [`README.md`](./README.md) for how each of these was resolved and the
resulting implementation.
