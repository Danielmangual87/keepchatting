// Motor de estructura SMC/ICT copiado TAL CUAL del nodo n8n
// "Code: Analyze Market Structure" (XAUUSD 3.9-lite - RR honesto + sombra NY + PD + RR5).
// Solo cambia la orquestacion final: en vez de leer nodos de n8n ($('...')),
// lee un JSON con las velas de Axi MT5 y escribe el mismo objeto de salida.
//
// Uso: node engine.js input.json > structure.json
//   input.json = { symbol, quote: {close, datetime}, D1: [...], H4: [...], H1: [...], M5: [...] }
//   cada vela: {datetime, open, high, low, close}

/**
 * Deterministic SMC/ICT structure engine.
 *
 * Replaces "paste 225 raw candles into an LLM prompt and ask it to eyeball
 * order blocks and FVGs" with plain, testable arithmetic. The LLM's job
 * becomes judgment over pre-extracted, price-anchored zones -- not precise
 * numeric pattern extraction, which is not something LLMs do reliably.
 *
 * Input: candle array, OLDEST FIRST: [{datetime, open, high, low, close}, ...]
 * (Twelvedata returns newest-first -- always sort before calling analyze()).
 *
 * ---------------------------------------------------------------------------
 * FIXES APPLIED (2026-08-25)
 *
 *   1. BOS DEADLOCK. On a CHoCH the code nulled the opposite protected swing
 *      (`curProtectedHigh = null`), but the BOS branch for that direction
 *      REQUIRES that field, and it is only ever reassigned inside that same
 *      branch. Result: after the first CHoCH, BOS could never fire again.
 *      A clean 11-step ascending staircase produced 1 CHoCH and 0 BOS.
 *      Now both protected swings are re-seeded on a flip -> same series
 *      produces 11 BOS. This also un-breaks order blocks, which are derived
 *      from structure events and were therefore only ever coming from CHoCH.
 *
 *   2. NODE NAMES. The orchestration referenced "Time series D1" / "4H" /
 *      "1H" / "5M"; the live workflow has "Time series D" / "4H1" / "1H1" /
 *      "5M1". Names corrected -- see NODE NAMES block at the bottom.
 *
 *   3. DEAD CODE. classifyStructure() opened with a loop over merged swing
 *      points whose branches were empty and whose locals were never read.
 *      Removed; it computed nothing.
 * ---------------------------------------------------------------------------
 */

function toNum(c) {
  return { datetime: c.datetime, open: +c.open, high: +c.high, low: +c.low, close: +c.close };
}

function sortOldestFirst(candles) {
  return candles.map(toNum).sort((a, b) => (a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : 0));
}

// ---------------------------------------------------------------------------
// 1. SWING POINTS (fractals)
// A swing high at index i: candles[i].high is strictly greater than the
// `lookback` candles on each side. Swing low: mirrored on .low.
// ---------------------------------------------------------------------------
function detectSwings(candles, lookback = 2) {
  const highs = [];
  const lows = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: c.high, time: c.datetime });
    if (isLow) lows.push({ index: i, price: c.low, time: c.datetime });
  }
  return { highs, lows };
}

// ---------------------------------------------------------------------------
// 2. MARKET STRUCTURE: walk candle closes forward, tracking the protected
// swing on each side, and log confirmed BOS (continuation) / CHoCH (flip).
// A break counts on candle CLOSE beyond the swing price, not a wick -- wicks
// alone are liquidity sweeps, not structural breaks.
//
// Both protected swings are always kept populated. The one matching the
// trend is the level that must hold (breaking it = CHoCH); the opposite one
// is the reference the next BOS is measured against. Nulling either of them
// silently disables half the engine.
// ---------------------------------------------------------------------------
function classifyStructure(candles, swings) {
  const events = [];
  let curTrend = null;
  let curProtectedLow = null;
  let curProtectedHigh = null;
  let recentLow = null;
  let recentHigh = null;

  for (let i = 0; i < candles.length; i++) {
    const swingHighHere = swings.highs.find((s) => s.index === i);
    const swingLowHere = swings.lows.find((s) => s.index === i);
    if (swingHighHere) recentHigh = swingHighHere;
    if (swingLowHere) recentLow = swingLowHere;

    const close = candles[i].close;

    if (curTrend === null) {
      // seed initial trend once we have at least one high and one low
      if (recentHigh && recentLow) {
        curTrend = recentHigh.index < recentLow.index ? "bearish" : "bullish";
        curProtectedLow = recentLow;
        curProtectedHigh = recentHigh;
      }
      continue;
    }

    if (curTrend === "bullish" && curProtectedLow && close < curProtectedLow.price) {
      events.push({ type: "CHoCH", direction: "bearish", price: curProtectedLow.price, time: candles[i].datetime, index: i });
      curTrend = "bearish";
      curProtectedHigh = recentHigh;              // level to defend in the new trend
      curProtectedLow = recentLow;                // reference for the next bearish BOS
    } else if (curTrend === "bearish" && curProtectedHigh && close > curProtectedHigh.price) {
      events.push({ type: "CHoCH", direction: "bullish", price: curProtectedHigh.price, time: candles[i].datetime, index: i });
      curTrend = "bullish";
      curProtectedLow = recentLow;                // level to defend in the new trend
      curProtectedHigh = recentHigh;              // reference for the next bullish BOS
    } else if (curTrend === "bullish" && recentHigh && curProtectedHigh && recentHigh.price > curProtectedHigh.price && close > curProtectedHigh.price) {
      events.push({ type: "BOS", direction: "bullish", price: curProtectedHigh.price, time: candles[i].datetime, index: i });
      curProtectedHigh = recentHigh;
      curProtectedLow = recentLow || curProtectedLow;
    } else if (curTrend === "bearish" && recentLow && curProtectedLow && recentLow.price < curProtectedLow.price && close < curProtectedLow.price) {
      events.push({ type: "BOS", direction: "bearish", price: curProtectedLow.price, time: candles[i].datetime, index: i });
      curProtectedLow = recentLow;
      curProtectedHigh = recentHigh || curProtectedHigh;
    }
  }

  return {
    trend: curTrend || "undetermined",
    protectedSwingLow: curTrend === "bullish" ? curProtectedLow : null,
    protectedSwingHigh: curTrend === "bearish" ? curProtectedHigh : null,
    lastEvent: events.length ? events[events.length - 1] : null,
    recentEvents: events.slice(-3),
  };
}

// ---------------------------------------------------------------------------
// 3. FAIR VALUE GAPS: classic 3-candle imbalance. Mitigated = any later
// candle traded back into the gap.
// ---------------------------------------------------------------------------
function detectFVGs(candles) {
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];
    if (c1.high < c3.low) {
      fvgs.push({ direction: "bullish", top: c3.low, bottom: c1.high, formedAtIndex: i, formedAt: candles[i - 1].datetime });
    } else if (c1.low > c3.high) {
      fvgs.push({ direction: "bearish", top: c1.low, bottom: c3.high, formedAtIndex: i, formedAt: candles[i - 1].datetime });
    }
  }
  for (const fvg of fvgs) {
    fvg.mitigated = false;
    for (let k = fvg.formedAtIndex + 1; k < candles.length; k++) {
      const c = candles[k];
      if (fvg.direction === "bullish" && c.low <= fvg.top) { fvg.mitigated = true; break; }
      if (fvg.direction === "bearish" && c.high >= fvg.bottom) { fvg.mitigated = true; break; }
    }
  }
  return fvgs;
}

// ---------------------------------------------------------------------------
// 4. ORDER BLOCKS: the last opposite-colored candle immediately before a
// confirmed BOS/CHoCH displacement leg. Mitigated = price has traded back
// into the OB's range since it formed.
// ---------------------------------------------------------------------------
function detectOrderBlocks(candles, structureEvents) {
  const obs = [];
  for (const ev of structureEvents) {
    const breakIndex = ev.index;
    let obIndex = -1;
    for (let i = breakIndex - 1; i >= Math.max(0, breakIndex - 15); i--) {
      const c = candles[i];
      const isDown = c.close < c.open;
      const isUp = c.close > c.open;
      if (ev.direction === "bullish" && isDown) { obIndex = i; break; }
      if (ev.direction === "bearish" && isUp) { obIndex = i; break; }
    }
    if (obIndex === -1) continue;
    const ob = candles[obIndex];
    const zone = { direction: ev.direction, top: ob.high, bottom: ob.low, formedAtIndex: obIndex, formedAt: ob.datetime, causedEvent: ev.type };
    zone.mitigated = false;
    for (let k = breakIndex + 1; k < candles.length; k++) {
      const c = candles[k];
      if (ev.direction === "bullish" && c.low <= zone.top) { zone.mitigated = true; break; }
      if (ev.direction === "bearish" && c.high >= zone.bottom) { zone.mitigated = true; break; }
    }
    obs.push(zone);
  }
  return obs;
}

// ---------------------------------------------------------------------------
// 5. EQUAL HIGHS/LOWS (liquidity pools)
// ---------------------------------------------------------------------------
function findLiquidityPools(candles, swingPoints, tolerancePct = 0.0015, minGapCandles = 6) {
  if (!swingPoints.length) return [];

  const byIndex = [...swingPoints].sort((a, b) => a.index - b.index);
  const touches = [];
  let run = [byIndex[0]];
  for (let i = 1; i < byIndex.length; i++) {
    const prev = run[run.length - 1];
    const closeInPrice = Math.abs(byIndex[i].price - prev.price) / prev.price <= tolerancePct;
    const closeInTime = byIndex[i].index - prev.index <= minGapCandles;
    if (closeInPrice && closeInTime) {
      run.push(byIndex[i]);
    } else {
      touches.push(run[Math.floor(run.length / 2)]);
      run = [byIndex[i]];
    }
  }
  touches.push(run[Math.floor(run.length / 2)]);

  const sorted = [...touches].sort((a, b) => a.price - b.price);
  const clusters = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1];
    if (Math.abs(sorted[i].price - prev.price) / prev.price <= tolerancePct) {
      current.push(sorted[i]);
    } else {
      if (current.length >= 2) clusters.push(current);
      current = [sorted[i]];
    }
  }
  if (current.length >= 2) clusters.push(current);

  const maxTouches = 4;

  return clusters.filter((c) => c.length <= maxTouches).map((cluster) => {
    const avgPrice = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
    const lastIndex = Math.max(...cluster.map((p) => p.index));
    return { price: avgPrice, count: cluster.length, indices: cluster.map((p) => p.index), lastFormedAt: candles[lastIndex].datetime };
  });
}

function markSweptHighs(candles, pools) {
  return pools.map((p) => {
    let swept = false;
    for (let k = Math.max(...p.indices) + 1; k < candles.length; k++) {
      if (candles[k].high > p.price) { swept = true; break; }
    }
    return { ...p, swept };
  });
}
function markSweptLows(candles, pools) {
  return pools.map((p) => {
    let swept = false;
    for (let k = Math.max(...p.indices) + 1; k < candles.length; k++) {
      if (candles[k].low < p.price) { swept = true; break; }
    }
    return { ...p, swept };
  });
}

// ---------------------------------------------------------------------------
// 5b. ZONE REACTION HISTORY
//
// A zone's *formation* (OB/FVG) says nothing about whether that price range
// has actually behaved like support/resistance historically. Two zones can
// look identical structurally and still have opposite track records: one
// has bounced bullish every time price returned to it, the other reacts in
// both directions with no conviction (a "chop zone"), and a third might
// never have been revisited at all. This scans the FULL candle series (not
// just since the zone formed -- the price range can have mattered before
// the current OB/FVG existed) for every historical touch of a zone's price
// range and classifies what happened afterward.
//
// Definitions (fixed a priori, not tuned to any particular result):
//   - touch: any candle whose [low, high] overlaps the zone's [bottom, top].
//   - touch EVENT: touches within `clusterGapCandles` of each other are the
//     same visit, not separate reactions (a 4-candle consolidation sitting
//     in the zone is one touch, not four).
//   - reaction: over the `lookforwardCandles` after a touch, price moves at
//     least `minMoveZoneMultiples` * zone-height away in one direction, and
//     that move is at least 30% larger than the opposite-direction move
//     within the same window. Anything smaller/ambiguous is "none" -- noise
//     and chop should not count as a directional reaction just because
//     price drifted slightly.
//   - reliability: of the touches that DID produce a decisive reaction
//     (bullish or bearish, excluding "none"), what fraction went the
//     dominant direction. A zone with 3 bullish / 0 bearish / 1 none scores
//     1.0 (every decisive reaction agreed); 2 bullish / 2 bearish scores
//     0.5 regardless of the "none" count -- that's the "reacts both ways,
//     no conviction" case.
// ---------------------------------------------------------------------------
function analyzeZoneReactionHistory(candles, top, bottom, opts = {}) {
  const lookforwardCandles = opts.lookforwardCandles || 12;
  const clusterGapCandles = opts.clusterGapCandles || 3;
  const minMoveZoneMultiples = opts.minMoveZoneMultiples || 0.5;
  const decisiveMargin = 1.3; // one direction must beat the other by this factor to count

  const height = top - bottom;
  if (!(height > 0) || candles.length < 3) {
    return { totalTouches: 0, bullishReactions: 0, bearishReactions: 0, noReaction: 0, dominantDirection: "unknown", reliability: null };
  }
  const minMoveAbs = height * minMoveZoneMultiples;

  const touchIndices = [];
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].low <= top && candles[i].high >= bottom) touchIndices.push(i);
  }

  const events = [];
  let lastTouchIdx = null;
  for (const idx of touchIndices) {
    // compare to the PREVIOUS touch, not the event's start -- otherwise a
    // long run of consecutive touching candles (a consolidation sitting in
    // the zone) fragments into a new "event" every clusterGapCandles steps
    // instead of staying one continuous visit.
    if (lastTouchIdx === null || idx - lastTouchIdx > clusterGapCandles) events.push(idx);
    lastTouchIdx = idx;
  }

  const reactions = events.map((idx) => {
    const entryPrice = candles[idx].close;
    const future = candles.slice(idx + 1, idx + 1 + lookforwardCandles);
    if (!future.length) return "none";
    const upMove = Math.max(...future.map((c) => c.high)) - entryPrice;
    const downMove = entryPrice - Math.min(...future.map((c) => c.low));
    if (upMove >= minMoveAbs && upMove >= downMove * decisiveMargin) return "bullish";
    if (downMove >= minMoveAbs && downMove >= upMove * decisiveMargin) return "bearish";
    return "none";
  });

  const bullishReactions = reactions.filter((r) => r === "bullish").length;
  const bearishReactions = reactions.filter((r) => r === "bearish").length;
  const noReaction = reactions.filter((r) => r === "none").length;
  const resolved = bullishReactions + bearishReactions;

  let dominantDirection = "unknown";
  if (resolved > 0) {
    dominantDirection = bullishReactions === bearishReactions ? "mixed" : bullishReactions > bearishReactions ? "bullish" : "bearish";
  }

  return {
    totalTouches: reactions.length,
    bullishReactions,
    bearishReactions,
    noReaction,
    dominantDirection,
    reliability: resolved > 0 ? +(Math.max(bullishReactions, bearishReactions) / resolved).toFixed(2) : null,
  };
}

// ---------------------------------------------------------------------------
// 6. DEALING RANGE / PREMIUM-DISCOUNT
// ---------------------------------------------------------------------------
function dealingRange(structure, swings, currentPrice) {
  let low, high;
  if (structure.trend === "bullish" && structure.protectedSwingLow) {
    low = structure.protectedSwingLow.price;
    const highsAfter = swings.highs.filter((h) => h.index > structure.protectedSwingLow.index);
    high = highsAfter.length ? Math.max(...highsAfter.map((h) => h.price)) : currentPrice;
  } else if (structure.trend === "bearish" && structure.protectedSwingHigh) {
    high = structure.protectedSwingHigh.price;
    const lowsAfter = swings.lows.filter((l) => l.index > structure.protectedSwingHigh.index);
    low = lowsAfter.length ? Math.min(...lowsAfter.map((l) => l.price)) : currentPrice;
  } else {
    return null;
  }
  if (high <= low) return null;
  const equilibrium = (high + low) / 2;
  return {
    low, high, equilibrium,
    priceLocation: currentPrice > equilibrium ? "premium" : "discount",
  };
}

// ---------------------------------------------------------------------------
// MAIN ENTRY POINT
// ---------------------------------------------------------------------------
function analyzeTimeframe(rawCandles, currentPrice, opts = {}) {
  const candles = sortOldestFirst(rawCandles);
  if (candles.length < 10) {
    // Not enough data to say anything. Returning a shaped-but-empty result
    // keeps dataQuality.usable false instead of throwing mid-run.
    return {
      lastCandleTime: null, currentPrice, trend: "undetermined",
      protectedSwingLow: null, protectedSwingHigh: null, lastStructureEvent: null,
      dealingRange: null, unmitigatedFVGs: [], unmitigatedOrderBlocks: [],
      buySideLiquidity: [], sellSideLiquidity: [],
    };
  }

  const lookback = opts.swingLookback || 2;
  const tolerancePct = opts.liquidityTolerancePct || 0.0015;

  const swings = detectSwings(candles, lookback);
  const structure = classifyStructure(candles, swings);
  const fvgs = detectFVGs(candles).filter((f) => !f.mitigated);
  const orderBlocks = detectOrderBlocks(candles, structure.recentEvents).filter((o) => !o.mitigated);

  let buyPools = findLiquidityPools(candles, swings.highs, tolerancePct);
  buyPools = markSweptHighs(candles, buyPools).filter((p) => !p.swept);
  let sellPools = findLiquidityPools(candles, swings.lows, tolerancePct);
  sellPools = markSweptLows(candles, sellPools).filter((p) => !p.swept);

  const range = dealingRange(structure, swings, currentPrice);

  const byProximity = (a, b) => {
    const da = Math.min(Math.abs(a.top - currentPrice), Math.abs(a.bottom - currentPrice));
    const db = Math.min(Math.abs(b.top - currentPrice), Math.abs(b.bottom - currentPrice));
    return da - db;
  };
  const reactionOpts = { lookforwardCandles: 12, clusterGapCandles: 3, minMoveZoneMultiples: 0.5 };
  const nearestFVGs = fvgs.map((f) => ({ direction: f.direction, top: +f.top.toFixed(5), bottom: +f.bottom.toFixed(5), formedAt: f.formedAt }))
    .sort(byProximity).slice(0, 5)
    .map((z) => ({ ...z, reactionHistory: analyzeZoneReactionHistory(candles, z.top, z.bottom, reactionOpts) }));
  const nearestOBs = orderBlocks.map((o) => ({ direction: o.direction, top: +o.top.toFixed(5), bottom: +o.bottom.toFixed(5), formedAt: o.formedAt, causedEvent: o.causedEvent }))
    .sort(byProximity).slice(0, 5)
    .map((z) => ({ ...z, reactionHistory: analyzeZoneReactionHistory(candles, z.top, z.bottom, reactionOpts) }));

  return {
    lastCandleTime: candles[candles.length - 1].datetime,
    // Rango medio (high-low) de las ultimas 10 velas. Se calcula aqui porque
    // el prompt ya NO recibe velas crudas: pedirle al modelo que promedie "las
    // ultimas 10 velas" seria pedirle datos que no tiene, y terminaria
    // inventando el numero o cayendo siempre al minimo. El buffer del stop
    // depende de esto, asi que tiene que ser deterministico.
    avgRange10: +(candles.slice(-10).reduce((s, c) => s + (c.high - c.low), 0) /
                  Math.min(10, candles.length)).toFixed(5),
    currentPrice,
    trend: structure.trend,
    protectedSwingLow: structure.protectedSwingLow ? { price: structure.protectedSwingLow.price, time: structure.protectedSwingLow.time } : null,
    protectedSwingHigh: structure.protectedSwingHigh ? { price: structure.protectedSwingHigh.price, time: structure.protectedSwingHigh.time } : null,
    lastStructureEvent: structure.lastEvent ? { type: structure.lastEvent.type, direction: structure.lastEvent.direction, price: structure.lastEvent.price, time: structure.lastEvent.time } : null,
    dealingRange: range,
    unmitigatedFVGs: nearestFVGs,
    unmitigatedOrderBlocks: nearestOBs,
    buySideLiquidity: buyPools.map((p) => ({ price: +p.price.toFixed(5), touches: p.count, lastFormedAt: p.lastFormedAt })),
    sellSideLiquidity: sellPools.map((p) => ({ price: +p.price.toFixed(5), touches: p.count, lastFormedAt: p.lastFormedAt })),
  };
}



// ---------------------------------------------------------------------------
// ORQUESTACION (sustituye a la de n8n). Misma configuracion por timeframe.
// ---------------------------------------------------------------------------
const fs = require("fs");
const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

const currentPrice = parseFloat(input.quote.close);
const symbol = input.symbol;
const safeValues = (v) => (Array.isArray(v) ? v : []);

const marketMap = {
  D1: analyzeTimeframe(safeValues(input.D1), currentPrice, { swingLookback: 2, liquidityTolerancePct: 0.002 }),
  H4: analyzeTimeframe(safeValues(input.H4), currentPrice, { swingLookback: 2, liquidityTolerancePct: 0.0018 }),
  H1: analyzeTimeframe(safeValues(input.H1), currentPrice, { swingLookback: 2, liquidityTolerancePct: 0.0015 }),
  M5: analyzeTimeframe(safeValues(input.M5), currentPrice, { swingLookback: 2, liquidityTolerancePct: 0.0012 }),
};

const dataQuality = {
  usable: !!(marketMap.D1.lastCandleTime && marketMap.H4.lastCandleTime &&
             marketMap.H1.lastCandleTime && marketMap.M5.lastCandleTime),
};

const SL_FLOOR = /XAU/i.test(symbol || "") ? 3.0 : 0.0006;
const slBuffer = +Math.max(marketMap.M5.avgRange10 || 0, SL_FLOOR).toFixed(5);

function zoneEvidence(tf) {
  const zones = [].concat(tf.unmitigatedOrderBlocks || [], tf.unmitigatedFVGs || []);
  const withHist = zones.filter(z => z.reactionHistory && z.reactionHistory.totalTouches > 0);
  if (!withHist.length) return { zones: zones.length, tested: 0, avgReliability: null, summary: "sin toques historicos" };
  const rel = withHist.filter(z => z.reactionHistory.reliability !== null)
                      .map(z => z.reactionHistory.reliability);
  const avg = rel.length ? rel.reduce((a, b) => a + b, 0) / rel.length : null;
  const best = withHist.slice().sort((a, b) =>
    (b.reactionHistory.reliability || 0) - (a.reactionHistory.reliability || 0))[0];
  return {
    zones: zones.length,
    tested: withHist.length,
    avgReliability: avg === null ? null : +avg.toFixed(2),
    summary: withHist.length + "/" + zones.length + " zonas con historial" +
             (avg === null ? "" : ", fiabilidad media " + avg.toFixed(2)) +
             (best ? ", mejor " + best.direction + " " + best.bottom + "-" + best.top +
                     " (" + best.reactionHistory.totalTouches + " toques, " +
                     best.reactionHistory.dominantDirection + ")" : ""),
  };
}


process.stdout.write(JSON.stringify({
  symbol,
  currentPrice,
  quoteTimestamp: input.quote.datetime,
  dataQuality,
  marketMap,
  slBuffer,
  slBufferBasis: "max(1x rango medio 10 velas M5 = " + (marketMap.M5.avgRange10 || 0) +
                 ", piso " + SL_FLOOR + ")",
  zoneEvidence: zoneEvidence(marketMap.M5),
}, null, 2) + "\n");
