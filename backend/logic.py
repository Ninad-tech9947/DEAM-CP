"""The load-shedding controller, built from basic digital electronics blocks.

It runs once every second on the demand PREDICTED for 30 minutes from now, so places are
switched off before the overload happens, not after.

  1. Clock            the real time (Pune time, IST)
  2. Comparator       compares PREDICTED LOAD (A) with SUPPLY (B)
                        OVER  = 1 when A > B                  -> too much load coming
                        SPARE = 1 when A + next place <= B    -> room to switch one back on
  3. Up/down counter  6-bit register L (0..57): how many places are switched off
                        OVER = 1 -> count UP, SPARE = 1 -> count DOWN
  4. Decoder          a sheddable place with order number k is ON when k >= L
  5. Essential lock   essential places are tied to logic 1: ON = 1 OR (anything) = 1
"""

from .data import FAULT_LOSS, L_BITS, LOADS, N_SHED
from .meter import readings
from .ml.forecast import predict_demand

BY_RANK = {l["rank"]: l["id"] for l in LOADS if not l["essential"]}


def to_bits(value: int, width: int) -> str:
    return format(value, f"0{width}b")


def comparator(a: float, b: float) -> bool:
    """1 when A > B."""
    return a > b


def relay(load: dict, level: int) -> bool:
    """Essential places: tied to 1. Sheddable places: decoder output (order >= L)."""
    return True if load["essential"] else load["rank"] >= level


def control(demand: list[float], supply: float, level: int) -> dict:
    """Let the up/down counter tick until the comparator is happy."""
    def load_at(lv):
        return sum(d for l, d in zip(LOADS, demand) if relay(l, lv))

    ticks = []
    while True:
        load = load_at(level)
        over = comparator(load, supply)
        spare = level > 0 and not comparator(load + demand[BY_RANK[level - 1]], supply)
        if over and level < N_SHED:
            action, place = "up", BY_RANK[level]
        elif not over and spare:
            action, place = "down", BY_RANK[level - 1]
        else:
            action, place = "hold", None
        ticks.append({"level": level, "load": round(load, 1), "over": over, "spare": spare, "action": action, "place": place})
        if action == "up":
            level += 1
        elif action == "down":
            level -= 1
        else:
            break
    return {"level": level, "level_bits": to_bits(level, L_BITS), "relays": [relay(l, level) for l in LOADS],
            "load": round(load_at(level), 1), "over": comparator(load_at(level), supply), "ticks": ticks}


class Controller:
    """Keeps the counter L between seconds, like a real register."""

    def __init__(self, model: dict):
        self.model, self.level = model, 0

    def step(self, ts: float, supply: float, fault: bool) -> dict:
        effective = supply - (FAULT_LOSS if fault else 0)
        now = readings(ts)
        pred = [predict_demand(l, ts, self.model) for l in LOADS]
        out = control(pred, effective, self.level)
        self.level = out["level"]
        return {"ts": ts, "supply": effective, "now": [round(v, 2) for v in now], "pred": [round(v, 2) for v in pred],
                "total_now": round(sum(now), 1), "total_pred": round(sum(pred), 1), **out}
