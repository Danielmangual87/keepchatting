"""Alert model and sink protocol.

An Alert is emitted on every setup state transition. Sinks decide how to
surface it (console log, in-memory dashboard feed, etc). This is an
alert/dashboard system only — no sink here ever places a broker order.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Protocol

from ..setup import Setup


@dataclass
class Alert:
    setup_id: int
    state: str  # the state the setup just transitioned into
    direction: str
    timestamp: datetime
    message: str
    entry: Optional[float] = None
    stop: Optional[float] = None
    target: Optional[float] = None

    @classmethod
    def from_setup(cls, setup: Setup, message: str) -> "Alert":
        ts = {
            "watching": setup.sweep_time,
            "triggered": setup.triggered_time,
            "presumed_filled": setup.presumed_filled_time,
            "invalidated": setup.invalidated_time,
            "expired": setup.expired_time,
        }[setup.state]
        return cls(
            setup_id=setup.id,
            state=setup.state,
            direction=setup.direction,
            timestamp=ts,
            message=message,
            entry=setup.entry,
            stop=setup.stop,
            target=setup.target.price if setup.target else None,
        )


class AlertSink(Protocol):
    def emit(self, alert: Alert) -> None:
        ...
