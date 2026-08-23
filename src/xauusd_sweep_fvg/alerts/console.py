from __future__ import annotations

from .base import Alert


class ConsoleAlertSink:
    def emit(self, alert: Alert) -> None:
        parts = [
            f"[{alert.timestamp.isoformat()}]",
            f"setup #{alert.setup_id}",
            alert.direction.upper(),
            alert.state,
            "-",
            alert.message,
        ]
        if alert.state == "triggered":
            parts.append(
                f"(entry={alert.entry:.2f} stop={alert.stop:.2f} "
                f"target={alert.target if alert.target is None else round(alert.target, 2)})"
            )
        print(" ".join(str(p) for p in parts))
