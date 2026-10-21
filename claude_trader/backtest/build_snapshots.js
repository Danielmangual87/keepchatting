// Genera, para cada dia habil a las 00:01 AST (04:01 UTC), el mismo
// structure.json que produce el analisis en vivo: ejecuta engine.js con las
// ultimas 225 velas CERRADAS de D1/H4/H1/M5 en ese instante (sin datos futuros).
//
// Uso: node build_snapshots.js <data_dir> <out_dir> <desde YYYY-MM-DD> <hasta YYYY-MM-DD>
//   data_dir: XAUUSD_{D1,H4,H1,M5}.json de collect_axi.py

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const [dataDir, outDir, fromDay, toDay] = process.argv.slice(2);
const PERIOD_SEC = { D1: 86400, H4: 14400, H1: 3600, M5: 300 };
const LIMIT = 225;
const ANALYSIS_UTC = "04:01:00"; // 00:01 AST (UTC-4, sin horario de verano)

const series = {};
for (const p of Object.keys(PERIOD_SEC)) {
  series[p] = JSON.parse(fs.readFileSync(path.join(dataDir, `XAUUSD_${p}.json`), "utf8"));
}

const fmt = (t) => new Date(t * 1000).toISOString().replace("T", " ").slice(0, 19);

function closedBefore(bars, periodSec, t) {
  // Velas cuyo cierre (inicio + periodo) es <= t; las ultimas LIMIT.
  let hi = bars.length;
  while (hi > 0 && bars[hi - 1].t + periodSec > t) hi--;
  return bars.slice(Math.max(0, hi - LIMIT), hi);
}

fs.mkdirSync(outDir, { recursive: true });
const engine = path.join(__dirname, "..", "engine.js");
const tmpInput = path.join(outDir, "_input.json");

for (let d = new Date(fromDay + "T00:00:00Z"); d <= new Date(toDay + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) continue;
  const day = d.toISOString().slice(0, 10);
  const t = Date.parse(`${day}T${ANALYSIS_UTC}Z`) / 1000;

  const input = { symbol: "XAU/USD", mt5Symbol: "XAUUSD" };
  for (const p of Object.keys(PERIOD_SEC)) {
    input[p] = closedBefore(series[p], PERIOD_SEC[p], t).map((b) => ({
      datetime: fmt(b.t), open: b.o, high: b.h, low: b.l, close: b.c,
    }));
  }
  const lastM5 = input.M5[input.M5.length - 1];
  if (!lastM5 || input.M5.length < LIMIT) {
    console.log(`${day}: sin velas M5 suficientes (${input.M5.length}), se omite`);
    continue;
  }
  // Precio de referencia: cierre de la ultima M5 cerrada (en vivo: bid de get_mt5_quote).
  input.quote = { close: lastM5.close, bid: lastM5.close, datetime: new Date(t * 1000).toISOString() };
  fs.writeFileSync(tmpInput, JSON.stringify(input));
  const structure = JSON.parse(execFileSync("node", [engine, tmpInput], { encoding: "utf8", maxBuffer: 64 << 20 }));
  structure.analysisTime = t;
  fs.writeFileSync(path.join(outDir, `${day}.json`), JSON.stringify(structure, null, 1));
  const counts = Object.keys(PERIOD_SEC).map((p) => `${p}=${input[p].length}`).join(" ");
  console.log(`${day}: precio ${lastM5.close} | ${counts} | usable=${structure.dataQuality.usable}`);
}
fs.rmSync(tmpInput, { force: true });
