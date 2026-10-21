// Simula la estrategia 3.8 dia por dia con velas M5 de Axi (bid) y compara
// variantes de gestion (SL, break even, cierre parcial, horario).
//
// Uso: node simulate.js <data_dir> <snap_dir> <out_dir>
//   (o como modulo: loadData() + run() con otra funcion de decision)
//
// Supuestos (conservadores):
// - Velas bid; ask = bid + SPREAD. Sell Limit se llena con bid >= entrada;
//   Buy Limit con ask <= entrada. SL/TP de venta se disparan con el ask.
// - Si una vela toca SL y TP, cuenta el SL. En la vela del llenado no se
//   acredita el TP. Huecos: se sale al precio de apertura si es peor.
// - Cada dia a las 04:01 UTC: si hay posicion abierta no se analiza (gate 3.8);
//   si la senal nueva es distinta a la pendiente, se reemplaza; si es NONE,
//   la pendiente sigue. Las ordenes vencen a las 48 h.
// - Riesgo 1 % del balance con lote redondeado hacia abajo a 0.01 (min 0.01).

const fs = require("fs");
const path = require("path");
const { decide } = require("./strategy");

// XAUUSD por defecto; para otro simbolo se pasan spread y contrato en mgmt.
const SPREAD = 0.16;
const CONTRACT = 100;

function loadData(dataDir, snapDir) {
  const M5 = JSON.parse(fs.readFileSync(path.join(dataDir, "XAUUSD_M5.json"), "utf8"));
  const days = fs.readdirSync(snapDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(snapDir, f), "utf8")));
  return { M5, days };
}

const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ");

// decideFn(snapshot, stratParams) -> orden {dir, entry, sl, tp, dist, rr} o {none}
function run({ M5, days }, name, stratParams, mgmt, decideFn = decide) {
  const m = {
    beAt: 0.5, beOffset: 0.2, partialAtR: null, partialFrac: 0.5,
    expiryH: 48, cancelUtcHour: null, risk: 0.01, startBalance: 5000,
    spread: SPREAD, contract: CONTRACT, ...mgmt,
  };
  let balance = m.startBalance;
  let pending = null;
  let pos = null;
  const trades = [];
  const signals = [];
  let bi = 0;

  function closeLeg(price, frac, why, t) {
    const sgn = pos.dir === "sell" ? -1 : 1;
    const r = (sgn * (price - pos.entry)) / pos.dist;
    pos.legs.push({ price, frac, r, why, t });
    balance += pos.lots * frac * m.contract * sgn * (price - pos.entry);
    pos.remaining -= frac;
    if (pos.remaining <= 1e-9) {
      const R = pos.legs.reduce((a, l) => a + l.r * l.frac, 0);
      trades.push({
        day: pos.day, dir: pos.dir, entry: pos.entry, sl0: pos.sl0, tp: pos.tp, dist: pos.dist, lots: pos.lots,
        filled: iso(pos.fillT), closed: iso(t), R: +R.toFixed(3), exit: why, mfeR: +pos.mfeR.toFixed(2),
        balance: +balance.toFixed(2),
      });
      pos = null;
    }
  }

  function step(bar) {
    if (pending && bar.t >= pending.expiry) pending = null;
    if (pending && m.cancelUtcHour !== null && bar.t >= pending.cancelAt) pending = null;
    let fillBar = false;
    if (pending) {
      const sell = pending.dir === "sell";
      if (sell ? bar.h >= pending.entry : bar.l + m.spread <= pending.entry) {
        const lots = Math.max(0.01, Math.floor((balance * m.risk) / (pending.dist * m.contract) * 100) / 100);
        pos = { ...pending, sl0: pending.sl, lots, fillT: bar.t, remaining: 1, legs: [], beDone: false, partialDone: false, mfeR: 0 };
        pending = null;
        fillBar = true;
      }
    }
    if (!pos) return;
    const sell = pos.dir === "sell";
    const sgn = sell ? -1 : 1;
    // Lado que cierra: venta cierra con ask, compra con bid.
    const hi = sell ? bar.h + m.spread : bar.h;
    const lo = sell ? bar.l + m.spread : bar.l;
    const op = sell ? bar.o + m.spread : bar.o;
    const slHit = sell ? hi >= pos.sl : lo <= pos.sl;
    if (slHit) {
      const gap = !fillBar && (sell ? op > pos.sl : op < pos.sl);
      closeLeg(gap ? op : pos.sl, pos.remaining, pos.beDone ? "BE" : "SL", bar.t);
      return;
    }
    if (!fillBar) {
      const tpHit = sell ? lo <= pos.tp : hi >= pos.tp;
      if (tpHit) { closeLeg(pos.tp, pos.remaining, "TP", bar.t); return; }
    }
    // Excursion favorable (precio que cierra) para BE / parcial; aplica desde la vela siguiente.
    const fav = sell ? lo : hi;
    const favR = (sgn * (fav - pos.entry)) / pos.dist;
    pos.mfeR = Math.max(pos.mfeR, favR);
    const progress = (sgn * ((sell ? bar.l : bar.h) - pos.entry)) / Math.abs(pos.tp - pos.entry);
    if (m.partialAtR !== null && !pos.partialDone && favR >= m.partialAtR) {
      pos.partialDone = true;
      closeLeg(pos.entry + sgn * m.partialAtR * pos.dist, m.partialFrac, "parcial", bar.t);
      if (!pos) return;
      pos.sl = pos.entry - sgn * m.beOffset; // tras el parcial, resto a BE
      pos.beDone = true;
    }
    if (m.beAt !== null && !pos.beDone && progress >= m.beAt) {
      const be = pos.entry - sgn * m.beOffset;
      const closeSide = sell ? bar.c + m.spread : bar.c;
      if (sell ? closeSide < be : closeSide > be) { pos.sl = be; pos.beDone = true; }
    }
  }

  function advanceTo(t) {
    while (bi < M5.length && M5[bi].t + 300 <= t) step(M5[bi++]);
  }

  for (const s of days) {
    const T = s.analysisTime;
    advanceTo(T);
    if (pos) { signals.push({ day: iso(T).slice(0, 10), action: "posicion abierta (gate)" }); continue; }
    const d = decideFn(s, stratParams);
    const day = iso(T).slice(0, 10);
    if (d.none) { signals.push({ day, action: "NONE", why: d.none }); continue; }
    if (pending && pending.entry === d.entry && pending.sl === d.sl && pending.tp === d.tp) {
      signals.push({ day, action: "mantiene pendiente" });
      continue;
    }
    if (pending) signals.push({ day, action: "reemplaza pendiente" });
    const cancelAt = m.cancelUtcHour === null ? null : Date.parse(`${day}T${String(m.cancelUtcHour).padStart(2, "0")}:00:00Z`) / 1000;
    pending = { ...d, day, placedT: T, expiry: T + m.expiryH * 3600, cancelAt };
    signals.push({ day, action: `${d.dir === "sell" ? "Sell" : "Buy"} Limit ${d.entry} SL ${d.sl} TP ${d.tp} RR ${d.rr}` });
  }
  advanceTo(Infinity);

  const n = trades.length;
  const wins = trades.filter((t) => t.R > 0.05).length;
  const losses = trades.filter((t) => t.R < -0.05).length;
  let peak = m.startBalance, maxDD = 0, cumR = 0, peakR = 0, maxDDR = 0;
  for (const t of trades) {
    peak = Math.max(peak, t.balance); maxDD = Math.max(maxDD, (peak - t.balance) / peak);
    cumR += t.R; peakR = Math.max(peakR, cumR); maxDDR = Math.max(maxDDR, peakR - cumR);
  }
  const monthly = {};
  for (const t of trades) {
    const k = t.closed.slice(0, 7);
    monthly[k] = monthly[k] || { n: 0, R: 0 };
    monthly[k].n++; monthly[k].R = +(monthly[k].R + t.R).toFixed(2);
  }
  const placed = signals.filter((x) => /Limit/.test(x.action)).length;
  return {
    name, placed, trades: n, wins, losses, be: n - wins - losses,
    winRate: n ? +(wins / n * 100).toFixed(1) : 0,
    totalR: +trades.reduce((a, t) => a + t.R, 0).toFixed(2),
    avgR: n ? +(trades.reduce((a, t) => a + t.R, 0) / n).toFixed(3) : 0,
    maxDDR: +maxDDR.toFixed(2), maxDDpct: +(maxDD * 100).toFixed(1),
    finalBalance: +balance.toFixed(2), openAtEnd: !!pos, monthly, tradesList: trades, signals,
  };
}

const VARIANTS = [
  ["Base: reglas actuales + BE 50%", {}, {}],
  ["Sin break even", {}, { beAt: null }],
  ["BE al 30%", {}, { beAt: 0.3 }],
  ["BE al 70%", {}, { beAt: 0.7 }],
  ["Parcial 50% en 1R + BE", {}, { beAt: null, partialAtR: 1 }],
  ["SL minimo 0.5x H1 (mas cerrado)", { slMinMult: 0.5 }, {}],
  ["SL solo zona M5 + buffer (pegado)", { slMinMult: 0.3, useBigZone: false, liqWindow: 0 }, {}],
  ["SL minimo 1.0x H1", { slMinMult: 1.0 }, {}],
  ["SL minimo 1.5x H1 (mas amplio)", { slMinMult: 1.5 }, {}],
  ["TP fijo 1:2", { fixedRR: 2 }, {}],
  ["Solo zona premium/discount H1", { premiumOnly: true }, {}],
  ["Sesgo estricto (2 de 3 sin contra)", { minScore: 2 }, {}],
  ["Cancelar pendiente a las 12:00 UTC (antes de NY)", {}, { cancelUtcHour: 12 }],
  ["Vencimiento 24 h", {}, { expiryH: 24 }],
];

module.exports = { loadData, run, VARIANTS };

if (require.main === module) {
  const [dataDir, snapDir, outDir] = process.argv.slice(2);
  const data = loadData(dataDir, snapDir);
  fs.mkdirSync(outDir, { recursive: true });
  const results = VARIANTS.map(([n, s, mg]) => run(data, n, s, mg));
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 1));
  const pad = (x, w) => String(x).padEnd(w);
  console.log(pad("variante", 50), "ord  ops  gan per be  %gan   R tot  R/op  DD(R) DD%   balance");
  for (const r of results) {
    console.log(pad(r.name, 50), pad(r.placed, 4), pad(r.trades, 4), pad(r.wins, 3), pad(r.losses, 3), pad(r.be, 3),
      pad(r.winRate, 5), pad(r.totalR, 6), pad(r.avgR, 6), pad(r.maxDDR, 5), pad(r.maxDDpct, 5), r.finalBalance, r.openAtEnd ? "(abierta)" : "");
  }
}
