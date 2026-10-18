// Copiado tal cual del nodo n8n "Code: Build Alert Message1" (XAUUSD 3.8 - restaurado (00:01, sin noticias)).
// No editar aqui: lo ejecuta runN8nNode() en finalize.js.
const input = $input.first();
let rawText = "";

if (input.json.candidates && input.json.candidates.length > 0 && input.json.candidates[0].content && input.json.candidates[0].content.parts && input.json.candidates[0].content.parts.length > 0) {
  rawText = input.json.candidates[0].content.parts[0].text;
} else {
  return [{ json: { text: "Alert: NO_DATA", finalData: { pair: "UNKNOWN", bias: "Neutral", confidence: "Low", orderType: "NONE", confluenceSummary: "No data", executionPlan: { entryZone: "N/A", premiumEntryZone: "N/A", entryReason: "N/A", invalidation: "N/A", invalidationReason: "N/A", target: "N/A", riskReward: "N/A" } } } }];
}

let d;
try {
  const cleanText = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  d = JSON.parse(cleanText);
} catch (e) {
  console.error("Parse error:", e.message);
  console.error("Raw text:", rawText);
  d = { pair: "PARSE_ERROR", bias: "Neutral", confidence: "Low", orderType: "NONE", confluenceSummary: "Parse error: " + e.message, executionPlan: { entryZone: "N/A", premiumEntryZone: "N/A", entryReason: "N/A", invalidation: "N/A", invalidationReason: "N/A", target: "N/A", riskReward: "N/A" } };
}

function __resolveEntryZone(zoneStr, orderType) {
  if (!zoneStr || zoneStr === 'N/A') return zoneStr;
  const nums = String(zoneStr).split('-').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  if (nums.length < 2) return zoneStr;
  if (/BUY/i.test(orderType || '')) return String(Math.max(...nums));
  if (/SELL/i.test(orderType || '')) return String(Math.min(...nums));
  return zoneStr;
}
if (d.executionPlan && d.executionPlan.entryZone) {
  d.executionPlan.entryZone = __resolveEntryZone(d.executionPlan.entryZone, d.orderType);
}

const alertText = "Alert: " + (d.pair || "UNKNOWN") + " " + (d.orderType || "NONE") + " Entry: " + (d.executionPlan?.entryZone || "N/A") + " P.Entry: " + (d.executionPlan?.premiumEntryZone || "N/A") + " SL: " + (d.executionPlan?.invalidation || "N/A") + " TP: " + (d.executionPlan?.target || "N/A") + " RR: " + (d.executionPlan?.riskReward || "N/A");

return [{ json: { text: alertText, finalData: d } }];
