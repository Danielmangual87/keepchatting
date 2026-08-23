"""Local dashboard: a small Flask app showing live setup states and the
alert log. Alert/dashboard delivery only — nothing here talks to a broker.

Run with `python -m xauusd_sweep_fvg.cli replay data/sample_1m.csv --dashboard`
or see cli.py for live mode. Defaults to http://127.0.0.1:8765
"""
from __future__ import annotations

from typing import Optional

from flask import Flask, jsonify, render_template_string

from ..engine import Engine
from ..setup import Setup
from .base import Alert

PAGE = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>XAUUSD Sweep &rarr; 1m FVG Dashboard</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 2rem; background: #0b0e14; color: #d7dce1; }
  h1 { font-size: 1.1rem; color: #9fb3c8; text-transform: uppercase; letter-spacing: .05em; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { padding: .4rem .6rem; text-align: left; border-bottom: 1px solid #1e2530; font-size: .85rem; }
  th { color: #6b7a8f; font-weight: 600; }
  .long { color: #4fd18b; }
  .short { color: #ef6a6a; }
  .watching { color: #e0b84c; }
  .triggered { color: #4fa0f0; }
  .presumed_filled { color: #4fd18b; }
  .invalidated { color: #ef6a6a; }
  .expired { color: #6b7a8f; }
</style>
</head>
<body>
<h1>Active Setups</h1>
<table id="setups"><thead><tr>
  <th>#</th><th>Dir</th><th>State</th><th>Sweep Level</th><th>Entry</th><th>Stop</th><th>Target</th><th>Since</th>
</tr></thead><tbody></tbody></table>

<h1>Alert Log</h1>
<table id="alerts"><thead><tr>
  <th>Time</th><th>#</th><th>Dir</th><th>State</th><th>Message</th>
</tr></thead><tbody></tbody></table>

<script>
function fmt(n) { return (n === null || n === undefined) ? "-" : Number(n).toFixed(2); }
async function refresh() {
  const setups = await (await fetch("/api/setups")).json();
  const setupsBody = document.querySelector("#setups tbody");
  setupsBody.innerHTML = setups.map(s => `<tr>
    <td>${s.id}</td>
    <td class="${s.direction}">${s.direction}</td>
    <td class="${s.state}">${s.state}</td>
    <td>${s.sweep_source} ${fmt(s.sweep_price)}</td>
    <td>${fmt(s.entry)}</td>
    <td>${fmt(s.stop)}</td>
    <td>${fmt(s.target)}</td>
    <td>${s.sweep_time}</td>
  </tr>`).join("");

  const alerts = await (await fetch("/api/alerts")).json();
  const alertsBody = document.querySelector("#alerts tbody");
  alertsBody.innerHTML = alerts.map(a => `<tr>
    <td>${a.timestamp}</td>
    <td>${a.setup_id}</td>
    <td class="${a.direction}">${a.direction}</td>
    <td class="${a.state}">${a.state}</td>
    <td>${a.message}</td>
  </tr>`).join("");
}
refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>
"""


class DashboardAlertSink:
    def __init__(self, max_alerts: int = 500) -> None:
        self.alerts: list[Alert] = []
        self.max_alerts = max_alerts

    def emit(self, alert: Alert) -> None:
        self.alerts.append(alert)
        if len(self.alerts) > self.max_alerts:
            self.alerts.pop(0)


def _setup_json(setup: Setup) -> dict:
    return {
        "id": setup.id,
        "direction": setup.direction,
        "state": setup.state,
        "sweep_source": setup.sweep_level.source,
        "sweep_price": setup.sweep_level.price,
        "sweep_time": setup.sweep_time.isoformat(),
        "entry": setup.entry,
        "stop": setup.stop,
        "target": setup.target.price if setup.target else None,
    }


def _alert_json(alert: Alert) -> dict:
    return {
        "setup_id": alert.setup_id,
        "direction": alert.direction,
        "state": alert.state,
        "timestamp": alert.timestamp.isoformat() if alert.timestamp else None,
        "message": alert.message,
    }


def create_app(engine: Engine, sink: Optional[DashboardAlertSink] = None) -> Flask:
    sink = sink or DashboardAlertSink()
    if sink not in engine.sinks:
        engine.sinks.append(sink)

    app = Flask(__name__)

    @app.get("/")
    def index():
        return render_template_string(PAGE)

    @app.get("/api/setups")
    def api_setups():
        return jsonify([_setup_json(s) for s in reversed(engine.setups)])

    @app.get("/api/alerts")
    def api_alerts():
        return jsonify([_alert_json(a) for a in reversed(sink.alerts)])

    return app
