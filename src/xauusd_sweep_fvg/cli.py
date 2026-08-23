"""CLI entrypoint.

    python -m xauusd_sweep_fvg replay data/sample_1m.csv
    python -m xauusd_sweep_fvg replay data/sample_1m.csv --dashboard
    python -m xauusd_sweep_fvg live --dashboard
"""
from __future__ import annotations

import argparse
import sys

from .alerts.console import ConsoleAlertSink
from .engine import Engine, EngineConfig
from .feeds.replay import ReplayFeed
from .runner import run


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="xauusd-sweep-fvg")
    sub = parser.add_subparsers(dest="mode", required=True)

    replay_p = sub.add_parser("replay", help="Replay a historical 1m CSV through the engine")
    replay_p.add_argument("csv_path")
    replay_p.add_argument("--dashboard", action="store_true", help="Serve a live dashboard while replaying")
    replay_p.add_argument("--port", type=int, default=8765)

    live_p = sub.add_parser("live", help="Run against a live 1m feed (Twelve Data)")
    live_p.add_argument("--symbol", default="XAU/USD")
    live_p.add_argument("--poll-seconds", type=int, default=20)
    live_p.add_argument("--dashboard", action="store_true")
    live_p.add_argument("--port", type=int, default=8765)

    args = parser.parse_args(argv)

    engine = Engine(config=EngineConfig(), sinks=[ConsoleAlertSink()])

    if args.mode == "replay":
        feed = ReplayFeed(args.csv_path)
        app = _register_dashboard(engine, args.port) if args.dashboard else None
        run(engine, feed)
        if app is not None:
            print("Replay complete.")
            _serve_and_block(app, args.port)
        return 0

    if args.mode == "live":
        from .feeds.twelvedata import TwelveDataFeed

        feed = TwelveDataFeed(symbol=args.symbol, poll_seconds=args.poll_seconds)
        if args.dashboard:
            app = _register_dashboard(engine, args.port)
            _serve_in_background(app, args.port)
        run(engine, feed)  # polls forever
        return 0

    parser.print_help()
    return 1


def _register_dashboard(engine: Engine, port: int):
    """Create the dashboard app and attach its alert sink to the engine
    *before* any candles are processed, so the alert log is populated as
    events happen rather than only reflecting state after the fact."""
    from .alerts.dashboard import create_app

    return create_app(engine)


def _serve_in_background(app, port: int) -> None:
    import threading

    def _serve() -> None:
        app.run(host="127.0.0.1", port=port, use_reloader=False)

    thread = threading.Thread(target=_serve, daemon=True)
    thread.start()
    print(f"Dashboard: http://127.0.0.1:{port}")


def _serve_and_block(app, port: int) -> None:
    """Serve the dashboard in the foreground until interrupted, so a
    finished replay's results stay viewable instead of exiting instantly."""
    print(f"Dashboard: http://127.0.0.1:{port} (Ctrl+C to exit)")
    app.run(host="127.0.0.1", port=port, use_reloader=False)


if __name__ == "__main__":
    sys.exit(main())
