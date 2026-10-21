// Compara, en una muestra de dias, la decision de Claude (decision.json hecho
// con los prompts de 3.8, sin ver el futuro) contra la version mecanica de
// strategy.js, simulando ambas con las mismas reglas de simulate.js.
//
// Uso: node compare_sample.js <data_dir> <snap_dir> <sample_dir>
//   sample_dir/<YYYY-MM-DD>/decision.json

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadData, run } = require("./simulate");
const { decide } = require("./strategy");

const [dataDir, snapDir, sampleDir] = process.argv.slice(2);
const data = loadData(dataDir, snapDir);
const finalize = path.join(__dirname, "..", "finalize.js");

const dayOf = (s) => new Date(s.analysisTime * 1000).toISOString().slice(0, 10);
const sampleDays = fs.readdirSync(sampleDir).filter((d) => fs.existsSync(path.join(sampleDir, d, "decision.json"))).sort();
const sample = { M5: data.M5, days: data.days.filter((s) => sampleDays.includes(dayOf(s))) };

// Igual que en vivo: Build Alert Message resuelve la entrada y el SL/TP.
const claudeOrders = {};
for (const day of sampleDays) {
  const dir = path.join(sampleDir, day);
  const out = JSON.parse(execFileSync("node", [finalize, "--structure", path.join(snapDir, `${day}.json`),
    "--decision", path.join(dir, "decision.json"), "--balance", "5000"], { encoding: "utf8" }));
  const fd = out.finalData;
  const type = fd.orderType;
  if (type !== "Buy Limit" && type !== "Sell Limit") { claudeOrders[day] = { none: `Claude: ${type}` }; continue; }
  const entry = parseFloat(fd.executionPlan.entryZone);
  const sl = parseFloat(fd.executionPlan.invalidation);
  const tp = parseFloat(fd.executionPlan.target);
  const dist = Math.abs(entry - sl);
  claudeOrders[day] = { dir: type === "Sell Limit" ? "sell" : "buy", entry, sl, tp, dist, rr: +(Math.abs(tp - entry) / dist).toFixed(2), lotRejected: out.lot.rejected };
}

const claude = run(sample, "Claude (prompts 3.8)", {}, {}, (s) => claudeOrders[dayOf(s)]);
const mech = run(sample, "Mecanica (strategy.js)", {}, {}, decide);

const fmt = (o) => (o.none ? `NONE (${o.none})` : `${o.dir} ${o.entry} SL ${o.sl} TP ${o.tp} RR ${o.rr}`);
const resultOf = (r, day) => {
  const t = r.tradesList.find((x) => x.day === day);
  return t ? `${t.exit} ${t.R > 0 ? "+" : ""}${t.R}R` : "sin llenar / sin orden";
};
console.log("dia         | Claude                                         | resultado       | Mecanica                                       | resultado");
for (const s of sample.days) {
  const day = dayOf(s);
  console.log(`${day}  | ${fmt(claudeOrders[day]).padEnd(46)} | ${resultOf(claude, day).padEnd(15)} | ${fmt(decide(s)).padEnd(46)} | ${resultOf(mech, day)}`);
}
for (const r of [claude, mech]) {
  console.log(`${r.name}: ordenes ${r.placed}, operaciones ${r.trades}, ganadas ${r.wins}, perdidas ${r.losses}, BE ${r.be}, R total ${r.totalR}`);
}
