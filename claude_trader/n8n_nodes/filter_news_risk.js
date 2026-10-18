// Copiado tal cual del nodo n8n "Code: Filter News Risk" (XAUUSD 3.8 - restaurado (00:01, sin noticias)).
// No editar aqui: lo ejecuta runN8nNode() en finalize.js.
// ---------------------------------------------------------------------------
// Filters the ForexFactory economic calendar feed (fetched by the preceding
// HTTP Request node) down to USD / all-country events near "now", so the
// execution-planning prompt gets a real answer instead of always falling
// back to "NO_NEWS_DATA_PROVIDED". Free, no API key -- this is the same
// public JSON their own calendar widget uses.
// ---------------------------------------------------------------------------
const WINDOW_MINUTES = 120; // how far out to even mention an event
const HIGH_IMPACT_BLOCK_MINUTES = 60; // matches the prompt's existing "reduce confidence heavily" rule
const LOOKAHEAD_HOURS = 24; // how far ahead to flag a same-day High-impact event for manual close-by
const CLOSE_BUFFER_MINUTES = 30; // suggested gap to close out before that event hits

// El fetch del calendario puede fallar y ESO NO DEBE MATAR EL ANALISIS.
// ForexFactory limita por tasa ("You've exceeded the limit for Calendar
// Export requests... The Calendar export file is only updated once per
// hour"), y con el nodo HTTP en continueOnFail lo que llega aqui no es la
// lista de eventos sino un objeto de error (o HTML de rate-limit). En ese
// caso seguimos sin datos de noticias en vez de tumbar la corrida entera:
// una señal sin contexto de noticias es mucho mejor que ninguna señal.
let events = [];
let newsDataAvailable = true;
let newsError = "";

const raw = $input.all();
if (raw.length === 1 && Array.isArray(raw[0].json)) {
  events = raw[0].json;
} else if (raw.length === 1 && raw[0].json && Array.isArray(raw[0].json.data)) {
  events = raw[0].json.data;
} else {
  events = raw.map((r) => r.json);
}

// ¿lo que llego se parece de verdad a eventos de calendario?
const looksLikeEvents = Array.isArray(events) && events.every(
  (e) => e && typeof e === "object" && ("date" in e || "title" in e)
);
if (!Array.isArray(events) || (events.length > 0 && !looksLikeEvents)) {
  const first = Array.isArray(events) ? events[0] : events;
  newsDataAvailable = false;
  newsError = (first && (first.error || first.message))
    ? String(first.error || first.message).slice(0, 200)
    : "respuesta del calendario no reconocida (posible rate limit de ForexFactory)";
  events = [];
}

// ---------------------------------------------------------------------------
// NOTICIAS DESACTIVADAS (3.8-restore, 2026-10-17, decisión del usuario):
// no se toma ninguna noticia en consideración. Se descartan todos los eventos
// del calendario, así que newsEvents sale vacío, highImpactWithin60Min=false
// y closeByNote="". El prompt lo lee como "sin riesgo de noticias".
// ---------------------------------------------------------------------------
events = [];

const now = new Date();

const relevant = events.filter((e) => {
  if (!e || !e.date) return false;
  if (!(e.country === "USD" || e.country === "All")) return false;
  if (!(e.impact === "High" || e.impact === "Medium")) return false;
  const evTime = new Date(e.date);
  if (isNaN(evTime.getTime())) return false;
  return Math.abs(evTime - now) / 60000 <= WINDOW_MINUTES;
});

const highImpactWithin60Min = relevant.some(
  (e) => e.impact === "High" && Math.abs(new Date(e.date) - now) / 60000 <= HIGH_IMPACT_BLOCK_MINUTES
);

// Same-day lookout, separate from the tight `relevant` window above: this is
// for manual position management (close before it hits), not for the
// execution-planning prompt -- a High-impact event hours away shouldn't
// block a new order the way an imminent one does, but it's worth writing to
// the sheet so it's visible without checking a calendar separately.
const upcomingHigh = events
  .filter((e) => e && e.date && (e.country === "USD" || e.country === "All") && e.impact === "High")
  .map((e) => ({ ...e, evTime: new Date(e.date) }))
  .filter((e) => !isNaN(e.evTime.getTime()) && e.evTime > now && (e.evTime - now) / 3600000 <= LOOKAHEAD_HOURS)
  .sort((a, b) => a.evTime - b.evTime);

const nextHighImpactEvent = upcomingHigh[0] || null;
let closeByNote = "";
if (!newsDataAvailable) {
  // Se escribe al Sheet para que quede EXPLICITO que no hubo datos, en vez
  // de una celda vacia que se lee igual que "no hay noticias".
  closeByNote = "Sin datos de calendario en esta corrida";
} else if (nextHighImpactEvent) {
  const closeBy = new Date(nextHighImpactEvent.evTime.getTime() - CLOSE_BUFFER_MINUTES * 60000);
  const closeByStr = closeBy.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  closeByNote = `Close by ${closeByStr} (${CLOSE_BUFFER_MINUTES}min before: ${nextHighImpactEvent.title})`;
}

return [{
  json: {
    newsEvents: relevant.map((e) => ({
      title: e.title,
      country: e.country,
      impact: e.impact,
      date: e.date,
      forecast: e.forecast,
      previous: e.previous,
    })),
    highImpactWithin60Min,
    closeByNote,
    newsDataAvailable,
    newsError,
    checkedAt: now.toISOString(),
    source: "forexfactory_calendar_feed",
  },
}];
