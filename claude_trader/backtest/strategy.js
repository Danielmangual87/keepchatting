// Version mecanica de la decision de las 00:01 (lo que en vivo hace Claude con
// prompt_htf_bias.md + prompt_entry_decision.md + reglas de CLAUDE.md).
// Entrada: el structure.json del motor. Salida: una orden Buy/Sell Limit o NONE.

const DEFAULTS = {
  minScore: 1,        // sesgo = mayoria de tendencias D1/H4/H1 (1 = mayoria simple, 2 = estricto)
  premiumOnly: false, // venta solo por encima del equilibrio de H1 (compra por debajo)
  maxZones: 3,        // zonas M5 a probar, de la mas cercana a la mas lejana
  slMinMult: 0.75,    // distancia minima del SL = slMinMult x H1.avgRange10
  useBigZone: true,   // SL respeta la zona mayor de H1/H4 que contiene la zona M5
  liqWindow: 1.0,     // liquidez opuesta a menos de liqWindow x H1.avgRange10 de la entrada: el SL va detras
  minRR: 2,
  maxRR: 5,
  clipRR: true,       // si el objetivo de liquidez da RR > maxRR, el TP se acerca a maxRR
  fixedRR: null,      // numero: TP fijo a ese RR en vez de liquidez
  tpFront: 0.5,       // el TP se queda $0.50 antes del nivel de liquidez
};

const zonesOf = (tf) => [].concat(tf.unmitigatedFVGs || [], tf.unmitigatedOrderBlocks || []);
const vote = (t) => (t === "bullish" ? 1 : t === "bearish" ? -1 : 0);

function decide(s, params = {}) {
  const p = { ...DEFAULTS, ...params };
  const mm = s.marketMap;
  const P = s.currentPrice;
  if (!s.dataQuality.usable) return { none: "datos no usables" };

  const score = vote(mm.D1.trend) + vote(mm.H4.trend) + vote(mm.H1.trend);
  const dir = score >= p.minScore ? "buy" : score <= -p.minScore ? "sell" : null;
  if (!dir) return { none: `sesgo mixto (score ${score})`, score };
  const sell = dir === "sell";
  const zdir = sell ? "bearish" : "bullish";
  const sgn = sell ? -1 : 1; // sentido del beneficio

  const h1avg = mm.H1.avgRange10;
  const buffer = Math.max(mm.M5.avgRange10, 3);
  const eq = mm.H1.dealingRange ? mm.H1.dealingRange.equilibrium : null;

  let zones = zonesOf(mm.M5).filter((z) => z.direction === zdir && (sell ? z.bottom > P : z.top < P));
  if (p.premiumOnly && eq !== null) zones = zones.filter((z) => (sell ? z.bottom >= eq : z.top <= eq));
  zones.sort((a, b) => (sell ? a.bottom - b.bottom : b.top - a.top));
  if (!zones.length) return { none: "sin zona M5 a favor del sesgo", score, dir };

  // Objetivos: liquidez del lado contrario y minimos/maximos de rango, mas cercanos primero.
  const targetLevels = [];
  for (const tf of ["M5", "H1", "H4"]) {
    for (const pool of (sell ? mm[tf].sellSideLiquidity : mm[tf].buySideLiquidity) || []) targetLevels.push(pool.price);
    const r = mm[tf].dealingRange;
    if (r) targetLevels.push(sell ? r.low : r.high);
  }
  const targets = targetLevels.filter((x) => (sell ? x < P : x > P)).sort((a, b) => (sell ? b - a : a - b));
  const stopPools = [];
  for (const tf of ["M5", "H1"]) for (const pool of (sell ? mm[tf].buySideLiquidity : mm[tf].sellSideLiquidity) || []) stopPools.push(pool.price);

  let lastReason = "RR fuera de rango";
  for (const z of zones.slice(0, p.maxZones)) {
    const entry = sell ? z.bottom : z.top;
    const edge = sell ? z.top : z.bottom;
    // Liquidez cercana del lado del stop: el SL va detras de ella.
    const nearPools = stopPools.filter((x) => (sell ? x > entry && x <= entry + p.liqWindow * h1avg : x < entry && x >= entry - p.liqWindow * h1avg));
    const structural = sell ? Math.max(edge, ...nearPools) : Math.min(edge, ...nearPools);
    const slOptions = [];
    const big = p.useBigZone
      ? zonesOf(mm.H1).concat(zonesOf(mm.H4)).filter((b) => b.direction === zdir && b.bottom <= z.top && b.top >= z.bottom)
      : [];
    if (big.length) {
      const bz = big.sort((a, b) => (b.top - b.bottom) - (a.top - a.bottom))[0];
      const mid = (bz.top + bz.bottom) / 2;
      slOptions.push({ sl: sell ? Math.max(bz.top, structural) + buffer : Math.min(bz.bottom, structural) - buffer, how: "zona mayor completa" });
      slOptions.push({ sl: sell ? Math.max(mid, structural) + buffer : Math.min(mid, structural) - buffer, how: "mitad zona mayor" });
    } else {
      slOptions.push({ sl: sell ? structural + buffer : structural - buffer, how: "zona M5 + liquidez" });
    }

    for (const opt of slOptions) {
      const dist = Math.max(Math.abs(opt.sl - entry), p.slMinMult * h1avg);
      const sl = entry - sgn * dist;
      let tp = null;
      if (p.fixedRR) {
        tp = entry + sgn * p.fixedRR * dist;
      } else {
        for (const lvl of targets) {
          const cand = lvl - sgn * p.tpFront;
          const rr = (sgn * (cand - entry)) / dist;
          if (rr < p.minRR) continue;
          tp = rr > p.maxRR ? (p.clipRR ? entry + sgn * p.maxRR * dist : null) : cand;
          break;
        }
      }
      if (tp === null) continue;
      const rr = (sgn * (tp - entry)) / dist;
      if (rr < p.minRR - 1e-9 || rr > p.maxRR + 1e-9) { lastReason = `RR ${rr.toFixed(2)}`; continue; }
      return {
        dir, score, entry: +entry.toFixed(2), sl: +sl.toFixed(2), tp: +tp.toFixed(2),
        dist: +dist.toFixed(2), rr: +rr.toFixed(2), slHow: opt.how,
        zone: { tf: "M5", bottom: z.bottom, top: z.top, formedAt: z.formedAt },
      };
    }
  }
  return { none: lastReason, score, dir };
}

module.exports = { decide, DEFAULTS };
