def compute_reachable_distance_km(battery_percentage: float, battery_capacity_kwh: float, efficiency_kwh_per_km: float) -> float:
    """
    Range estimate using available energy / consumption.
    """
    if efficiency_kwh_per_km <= 0:
        return 0.0
    available_energy = (battery_percentage / 100.0) * battery_capacity_kwh
    return max(available_energy / efficiency_kwh_per_km, 0.0)


def battery_after_distance_pct(
    distance_km: float,
    battery_percentage: float,
    battery_capacity_kwh: float,
    efficiency_kwh_per_km: float,
) -> float:
    if battery_capacity_kwh <= 0:
        return 0.0
    consumed_kwh = max(distance_km, 0.0) * max(efficiency_kwh_per_km, 0.0)
    consumed_pct = (consumed_kwh / battery_capacity_kwh) * 100.0
    return max(battery_percentage - consumed_pct, 0.0)


def satisfies_battery_safety(
    travel_distance_km: float,
    battery_percentage: float,
    battery_capacity_kwh: float,
    efficiency_kwh_per_km: float,
    reserve_pct: float = 10.0,
) -> bool:
    return battery_after_distance_pct(
        distance_km=travel_distance_km,
        battery_percentage=battery_percentage,
        battery_capacity_kwh=battery_capacity_kwh,
        efficiency_kwh_per_km=efficiency_kwh_per_km,
    ) >= reserve_pct
