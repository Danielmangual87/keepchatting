// Copiado tal cual del nodo n8n "Code: Build Alert Message1". No editar aqui: lo ejecuta run_n8n_node() en finalize.js.
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

// ---------------------------------------------------------------------------
// FILTRO PREMIUM / DISCOUNT (parche 18-sep-2026): regla dura después del modelo.
// Buy Limit solo con el precio en DISCOUNT del dealing range M5; Sell Limit solo en
// PREMIUM. Medido en 16 operaciones reales: del lado equivocado 2W/6L, del correcto 5W/3L.
// Sin dealing range no se filtra. El veredicto bloqueado queda como PD_BLOCK / Neutral:
// el executor y el backtest ya excluyen todo lo que no sea Bullish/Bearish.
// ---------------------------------------------------------------------------
try {
  const __ms = $('Code: Analyze Market Structure').item.json || {};
  const __dr = __ms.marketMap && __ms.marketMap.M5 ? __ms.marketMap.M5.dealingRange : null;
  const __ot = String(d.orderType || "").toUpperCase();
  if (__dr && __dr.priceLocation && (__ot.includes("BUY") || __ot.includes("SELL"))) {
    const __loc = String(__dr.priceLocation).toLowerCase();
    const __ok = __ot.includes("BUY") ? __loc === "discount" : __loc === "premium";
    d.__pdLocation = __loc;
    d.__pdEquilibrium = __dr.equilibrium;
    if (!__ok) {
      const __why = "PD_BLOCK: " + (__ot.includes("BUY") ? "Buy Limit con el precio en PREMIUM" : "Sell Limit con el precio en DISCOUNT") +
                    " del dealing range M5 (eq " + Number(__dr.equilibrium).toFixed(2) + ", precio " + Number(__ms.currentPrice).toFixed(2) + ")";
      const __tech = d.confluenceSummary ? " | Lectura técnica previa: " + d.confluenceSummary : "";
      d.__pdBlockedOrderType = d.orderType;
      d.bias = "Neutral";
      d.orderType = "PD_BLOCK";
      d.confidence = "Low";
      d.confluenceSummary = __why + __tech;
      d.executionPlan = d.executionPlan || {};
      d.executionPlan.entryReason = __why + (d.executionPlan.entryReason ? " | zona propuesta: " + d.executionPlan.entryReason : "");
      d.executionPlan.invalidationReason = "Bloqueo premium/discount; sin orden. Zonas conservadas como planificación.";
    }
  }
} catch (__e) {
  // sin mapa accesible: no se filtra, no se rompe
}

// ---------------------------------------------------------------------------
// TOPE DE RR (parche 18-sep-2026). Medido en las mismas 16 operaciones: RR > 5 = 1W/4L.
// Se recalcula con los NÚMEROS de entrada / invalidación / target, no con el texto del modelo.
// Modo "block": la señal no se opera (RR_BLOCK / Neutral). Modo "cap": target recortado a RR_MAX.
// ---------------------------------------------------------------------------
try {
  const __RR_MAX = 5.0, __RR_MODE = "block";
  const __ot2 = String(d.orderType || "").toUpperCase();
  if (__ot2.includes("BUY") || __ot2.includes("SELL")) {
    const __num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };
    const __e = __num(d.executionPlan && d.executionPlan.entryZone), __sl = __num(d.executionPlan && d.executionPlan.invalidation), __tp = __num(d.executionPlan && d.executionPlan.target);
    if (__e !== null && __sl !== null && __tp !== null && Math.abs(__e - __sl) > 0) {
      const __risk = Math.abs(__e - __sl), __rr = Math.abs(__tp - __e) / __risk;
      d.__rrComputed = Math.round(__rr * 100) / 100;
      if (__rr > __RR_MAX) {
        if (__RR_MODE === "cap") {
          const __isBuy = __ot2.includes("BUY");
          const __newTp = __isBuy ? __e + __RR_MAX * __risk : __e - __RR_MAX * __risk;
          d.__rawTarget = d.executionPlan.target;
          d.executionPlan.target = __newTp.toFixed(2);
          d.executionPlan.riskReward = "1:" + __RR_MAX.toFixed(1);
          d.confluenceSummary = "RR_CAP: target " + __num(d.__rawTarget).toFixed(2) + " (" + __rr.toFixed(1) + "R) recortado a " + __newTp.toFixed(2) + " (" + __RR_MAX + "R) | " + (d.confluenceSummary || "");
        } else {
          const __why = "RR_BLOCK: RR calculado " + __rr.toFixed(1) + " > " + __RR_MAX + " (entrada " + __e.toFixed(2) + ", SL " + __sl.toFixed(2) + ", target " + __tp.toFixed(2) + ")";
          const __tech = d.confluenceSummary ? " | Lectura técnica previa: " + d.confluenceSummary : "";
          d.__rrBlockedOrderType = d.orderType;
          d.bias = "Neutral";
          d.orderType = "RR_BLOCK";
          d.confidence = "Low";
          d.confluenceSummary = __why + __tech;
          d.executionPlan.entryReason = __why + (d.executionPlan.entryReason ? " | zona propuesta: " + d.executionPlan.entryReason : "");
          d.executionPlan.invalidationReason = "Bloqueo por RR > " + __RR_MAX + "; sin orden. Zonas conservadas como planificación.";
        }
      }
    }
  }
} catch (__e2) {
  // sin números: no se filtra, no se rompe
}
// ---------------------------------------------------------------------------
// BLOQUEO POR NOTICIA (parche 11-sep-2026): si el filtro marcó un evento High
// en la ventana, el veredicto se fuerza aquí, pase lo que pase con el LLM.
// bias queda "Neutral" a propósito (el backtest y el EA ya excluyen todo lo
// que no sea Bullish/Bearish); orderType "NEWS_BLOCK" lo distingue de un
// Neutral estructural, y la razón lleva el NOMBRE de la noticia.
// ---------------------------------------------------------------------------
const __news = $('Code: Filter News Risk').item.json || {};
if (__news.blockedByNews) {
  const __why = __news.blockedByNewsReason || "NO OPERAR: noticia de alto impacto";
  const __tech = d.confluenceSummary ? " | Lectura técnica previa: " + d.confluenceSummary : "";
  d.bias = "Neutral";
  d.orderType = "NEWS_BLOCK";
  d.confidence = "Low";
  d.confluenceSummary = __why + __tech;
  d.executionPlan = d.executionPlan || {};
  d.executionPlan.entryZone = "N/A";
  d.executionPlan.premiumEntryZone = "N/A";
  d.executionPlan.invalidation = "N/A";
  d.executionPlan.target = "N/A";
  d.executionPlan.riskReward = "N/A";
  d.executionPlan.entryReason = __why;
  d.executionPlan.invalidationReason = "Bloqueo por noticia; sin orden.";
}

const alertText = "Alert: " + (d.pair || "UNKNOWN") + " " + (d.orderType || "NONE") + " Entry: " + (d.executionPlan?.entryZone || "N/A") + " P.Entry: " + (d.executionPlan?.premiumEntryZone || "N/A") + " SL: " + (d.executionPlan?.invalidation || "N/A") + " TP: " + (d.executionPlan?.target || "N/A") + " RR: " + (d.executionPlan?.riskReward || "N/A");

return [{ json: { text: alertText, finalData: d } }];
