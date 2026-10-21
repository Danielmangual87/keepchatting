// Backtest de una lista de senales ya emitidas (por ejemplo, las del Google
// Sheet de n8n) con las velas M5 de Axi, usando la misma simulacion que
// simulate.js: cada senal se coloca a su hora; una senal distinta del mismo
// simbolo reemplaza la pendiente; si hay posicion abierta, la senal se ignora.
//
// Uso: node backtest_signals.js <data_dir> <signals.json>
//   signals.json: [{ "source", "symbol": "XAUUSD", "time": "2026-09-24T04:01:08Z",
//                    "type": "Sell Limit", "entry", "sl", "tp" }, ...]
//   data_dir/<SYMBOL>_M5.json de collect_axi.py

const fs = require("fs");
const path = require("path");
const { run } = require("./simulate");

const SYMBOLS = {
  XAUUSD: { spread: 0.16, contract: 100, beOffset: 0.2 },
  EURUSD: { spread: 0.00007, contract: 100000, beOffset: 0.00002 },
};

const [dataDir, signalsPath] = process.argv.slice(2);
const signals = JSON.parse(fs.readFileSync(signalsPath, "utf8"));

const groups = {};
for (const s of signals) (groups[`${s.source} ${s.symbol}`] = groups[`${s.source} ${s.symbol}`] || []).push(s);

const MGMT = [
  ["sin BE, vence 48 h", { beAt: null }],
  ["BE 50%, vence 48 h", {}],
  ["sin BE, hasta ser reemplazada", { beAt: null, expiryH: 24 * 60 }],
];

for (const [key, list] of Object.entries(groups)) {
  const symbol = list[0].symbol;
  const M5 = JSON.parse(fs.readFileSync(path.join(dataDir, `${symbol}_M5.json`), "utf8"));
  const days = list.map((s) => ({ analysisTime: Date.parse(s.time) / 1000, signal: s }))
    .sort((a, b) => a.analysisTime - b.analysisTime);
  const lastClose = (t) => {
    let i = M5.length - 1;
    while (i > 0 && M5[i].t + 300 > t) i--;
    return M5[i].c;
  };
  const toOrder = (d) => {
    const s = d.signal;
    if (s.type !== "Buy Limit" && s.type !== "Sell Limit") return { none: s.type };
    // MT5 rechaza un limit del lado equivocado del precio (retcode 10015 "invalid price").
    const bid = lastClose(d.analysisTime);
    const ask = bid + SYMBOLS[symbol].spread;
    if (s.type === "Sell Limit" ? s.entry <= bid : s.entry >= ask) {
      return { none: `rechazada: precio invalido (entrada ${s.entry}, precio ${bid})` };
    }
    const dist = Math.abs(s.entry - s.sl);
    return { dir: s.type === "Sell Limit" ? "sell" : "buy", entry: s.entry, sl: s.sl, tp: s.tp, dist, rr: +(Math.abs(s.tp - s.entry) / dist).toFixed(2) };
  };
  console.log(`\n=== ${key} (${list.length} senales) ===`);
  for (const [name, mg] of MGMT) {
    const r = run({ M5, days }, name, {}, { ...SYMBOLS[symbol], ...mg }, toOrder);
    console.log(`-- ${name}: operaciones ${r.trades}, ganadas ${r.wins}, perdidas ${r.losses}, BE ${r.be}, R total ${r.totalR}, balance ${r.finalBalance}${r.openAtEnd ? " (una sigue abierta)" : ""}`);
    if (name === MGMT[0][0]) {
      for (const sg of r.signals) console.log(`   ${sg.day}  ${sg.action}${sg.why ? " " + sg.why : ""}`);
      for (const t of r.tradesList) console.log(`   > ${t.dir} ${t.entry} SL ${t.sl0} TP ${t.tp} | lleno ${t.filled} | cierre ${t.closed} ${t.exit} ${t.R}R | ${t.lots} lotes`);
    }
  }
}
