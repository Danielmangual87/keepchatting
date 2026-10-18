"""Importa una version del workflow n8n de XAUUSD a claude_trader/.

Copia TAL CUAL el codigo de los nodos deterministas y los dos prompts de
Gemini; solo se reescribe la orquestacion final de engine.js para leer velas de
Axi en vez de nodos de n8n.

Uso:
    python3 -I claude_trader/import_n8n.py <workflow.json>
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

CODE_NODES = {
    "Code: Filter News Risk": "filter_news_risk.js",
    "Code: Build Alert Message1": "build_alert_message.js",
    "Account Config": "account_config.js",
    "Code: Calculate Lot Size": "calculate_lot_size.js",
}
PROMPT_NODES = {
    "HTF Bias Node1": "prompt_htf_bias.md",
    "Message a model": "prompt_entry_decision.md",
}

ENGINE_CLI = '''
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

'''

ENGINE_TAIL = '''
process.stdout.write(JSON.stringify({
  symbol,
  currentPrice,
  quoteTimestamp: input.quote.datetime,
  dataQuality,
  marketMap,
  zoneEvidence: zoneEvidence(marketMap.M5),
}, null, 2) + "\\n");
'''


def main():
    workflow = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    nodes = {n["name"]: n for n in workflow["nodes"]}
    name = workflow.get("name", "?")

    ms = nodes["Code: Analyze Market Structure"]["parameters"]["jsCode"]
    core = ms[: ms.index("// ---------------------------------------------------------------------------\n// ORCHESTRATION")]
    ze_start = ms.index("function zoneEvidence(tf)")
    zone_evidence = ms[ze_start : ms.index("return [{", ze_start)]
    header = (
        f'// Motor de estructura SMC/ICT copiado TAL CUAL del nodo n8n\n'
        f'// "Code: Analyze Market Structure" ({name}).\n'
        "// Solo cambia la orquestacion final: en vez de leer nodos de n8n ($('...')),\n"
        "// lee un JSON con las velas de Axi MT5 y escribe el mismo objeto de salida.\n"
        "//\n"
        "// Uso: node engine.js input.json > structure.json\n"
        "//   input.json = { symbol, quote: {close, datetime}, D1: [...], H4: [...], H1: [...], M5: [...] }\n"
        "//   cada vela: {datetime, open, high, low, close}\n\n"
    )
    (HERE / "engine.js").write_text(header + core + ENGINE_CLI + zone_evidence + ENGINE_TAIL, encoding="utf-8")

    for node_name, filename in CODE_NODES.items():
        code = nodes[node_name]["parameters"]["jsCode"].rstrip()
        banner = f'// Copiado tal cual del nodo n8n "{node_name}" ({name}).\n// No editar aqui: lo ejecuta runN8nNode() en finalize.js.\n'
        (HERE / "n8n_nodes" / filename).write_text(banner + code + "\n", encoding="utf-8")

    for node_name, filename in PROMPT_NODES.items():
        text = nodes[node_name]["parameters"]["messages"]["values"][0]["content"]
        (HERE / filename).write_text(text.lstrip("="), encoding="utf-8")

    print(f"Importado: {name}")
    for filename in ["engine.js", *("n8n_nodes/" + f for f in CODE_NODES.values()), *PROMPT_NODES.values()]:
        print("  ", filename)


if __name__ == "__main__":
    main()
