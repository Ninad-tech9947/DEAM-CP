"""Simulated meter readings for every place, driven by the real clock.

There is no public live, per-place load feed for Pune, so each place gets a realistic
simulated reading: typical daily shape x weekday effect x slow day-to-day (weather-like)
swing x small fluctuations. It depends only on the time, so it is repeatable.
"""

import math

from .data import LOADS, PROFILES, WEEKDAY

IST_OFFSET = 19800  # Pune time = UTC + 5:30


def ist_parts(ts: float):
    """(day number, weekday Mon=0, seconds since midnight) in Pune time."""
    t = ts + IST_OFFSET
    day = math.floor(t / 86400)
    return day, (day + 3) % 7, t - day * 86400  # 1 Jan 1970 was a Thursday


def shape(profile: str, sec: float) -> float:
    """Hourly profile, smoothly interpolated to the second."""
    h = sec / 3600
    i = math.floor(h) % 24
    f = h - math.floor(h)
    p = PROFILES[profile]
    return p[i] * (1 - f) + p[(i + 1) % 24] * f


def reading(load: dict, ts: float) -> float:
    """Simulated demand in MW for one place at a moment in time."""
    day, dow, sec = ist_parts(ts)
    weather = 1 + 0.05 * math.sin(day * 0.9) + 0.03 * math.sin(day * 2.3)
    wiggle = 0.03 * math.sin(ts / 97 + load["id"] * 1.7) + 0.02 * math.sin(ts / 31 + load["id"] * 3.1)
    return load["peak"] * shape(load["profile"], sec) * WEEKDAY[load["profile"]][dow] * weather * (1 + wiggle)


def readings(ts: float) -> list[float]:
    return [reading(l, ts) for l in LOADS]
