from .base import Alert, AlertSink
from .console import ConsoleAlertSink

__all__ = ["Alert", "AlertSink", "ConsoleAlertSink"]

try:
    from .dashboard import DashboardAlertSink, create_app  # noqa: F401

    __all__ += ["DashboardAlertSink", "create_app"]
except ImportError:
    pass
