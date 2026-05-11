from typing import Any


DEFAULT_WEIGHTS = {
    "distance_score": 0.22,
    "charging_speed_score": 0.18,
    "availability_score": 0.20,
    "cost_score": 0.10,
    "detour_time_score": 0.15,
    "battery_safety_score": 0.15,
}


def min_max_normalize(values: list[float], reverse: bool = False) -> list[float]:
    if not values:
        return []
    min_v = min(values)
    max_v = max(values)
    if max_v == min_v:
        return [1.0 for _ in values]
    scores = [(v - min_v) / (max_v - min_v) for v in values]
    return [1.0 - s for s in scores] if reverse else scores


def apply_weighted_score(features: dict[str, float], weights: dict[str, float] | None = None) -> float:
    use_weights = weights or DEFAULT_WEIGHTS
    total = 0.0
    weight_sum = 0.0
    for key, weight in use_weights.items():
        total += max(min(features.get(key, 0.0), 1.0), 0.0) * max(weight, 0.0)
        weight_sum += max(weight, 0.0)
    if weight_sum == 0:
        return 0.0
    return round(total / weight_sum, 4)


def parse_cost_number(raw_cost: Any) -> float | None:
    if raw_cost is None:
        return None
    if isinstance(raw_cost, (int, float)):
        return float(raw_cost)
    text = str(raw_cost).strip()
    digits = "".join(ch for ch in text if ch.isdigit() or ch == ".")
    try:
        return float(digits) if digits else None
    except ValueError:
        return None
