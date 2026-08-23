from datetime import datetime, timedelta, timezone

BASE = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)


def at(minutes: int) -> datetime:
    return BASE + timedelta(minutes=minutes)
