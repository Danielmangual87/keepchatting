// Ejecuta, en el mismo orden que n8n, los nodos de codigo que van DESPUES del
// modelo: Filter News Risk -> (decision de Claude) -> Build Alert Message ->
// Account Config -> Calculate Lot Size. El codigo de cada nodo se carga tal
// cual desde n8n_nodes/; aqui solo se simulan $input / $json / $('Nodo').
//
// Uso:
//   node finalize.js --structure structure.json --decision decision.json \
//                    --balance 5000 [--calendar ff_calendar.json]
//
// decision.json es el JSON que antes devolvia Gemini ("Message a model").
// Sin --calendar se reproduce el caso de n8n en que el fetch de ForexFactory
// falla (continueOnFail): el analisis sigue, marcado "sin datos de calendario".

const fs = require("fs");
const path = require("path");

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i === -1 ? fallback : process.argv[i + 1];
}

const nodes = {}; // salida de cada nodo ya ejecutado, por nombre de n8n

function runN8nNode(file, inputItems) {
  const code = fs.readFileSync(path.join(__dirname, "n8n_nodes", file), "utf8");
  const $ = (name) => {
    if (!(name in nodes)) throw new Error(`Referenced node doesn't exist: ${name}`);
    return { item: { json: nodes[name] } };
  };
  const $input = { first: () => inputItems[0], all: () => inputItems };
  const fn = new Function("$", "$input", "$json", code);
  return fn($, $input, inputItems[0] ? inputItems[0].json : {})[0].json;
}

const structure = JSON.parse(fs.readFileSync(arg("structure"), "utf8"));
const decision = JSON.parse(fs.readFileSync(arg("decision"), "utf8"));
const balance = Number(arg("balance"));
const calendarPath = arg("calendar");

nodes["Code: Analyze Market Structure"] = structure;

const calendarItems = calendarPath
  ? [{ json: JSON.parse(fs.readFileSync(calendarPath, "utf8")) }]
  : [{ json: { error: "calendario no disponible desde Claude (red bloqueada a ForexFactory)" } }];
nodes["Code: Filter News Risk"] = runN8nNode("filter_news_risk.js", calendarItems);

// Mismo sobre que devolvia el nodo de Gemini, para que Build Alert lo lea igual.
const modelEnvelope = { candidates: [{ content: { parts: [{ text: JSON.stringify(decision) }] } }] };
nodes["Code: Build Alert Message1"] = runN8nNode("build_alert_message.js", [{ json: modelEnvelope }]);

// Account Config lee el CSV de la pestana Balance; se le da el balance de Axi en ese formato.
nodes["Account Config"] = runN8nNode("account_config.js", [{ json: { data: `"Balance"\n"$${balance.toFixed(2)}"` } }]);
nodes["Code: Calculate Lot Size"] = runN8nNode("calculate_lot_size.js", [{ json: {} }]);

process.stdout.write(JSON.stringify({
  alert: nodes["Code: Build Alert Message1"].text,
  finalData: nodes["Code: Build Alert Message1"].finalData,
  news: nodes["Code: Filter News Risk"],
  lot: nodes["Code: Calculate Lot Size"],
}, null, 2) + "\n");
