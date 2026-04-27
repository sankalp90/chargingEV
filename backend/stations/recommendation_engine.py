import hashlib
import json
import logging
import os
import random
from typing import Any

from stations.models import EVStation
from stations.services.routing_service import RoutingService
from stations.utils.battery import battery_after_distance_pct, satisfies_battery_safety
from stations.utils.geo import distance_to_route_km, haversine_km, is_within_route_buffer
from stations.utils.scoring import DEFAULT_WEIGHTS, apply_weighted_score, min_max_normalize, parse_cost_number
from services.station_aggregator import get_all_stations


logger = logging.getLogger(__name__)


class ChargingRecommendationEngine:
    def __init__(self) -> None:
        self.routing_service = RoutingService()
        self.route_buffer_km = float(os.getenv("ROUTE_BUFFER_KM", "5"))
        self.reserve_battery_pct = float(os.getenv("RESERVE_BATTERY_PCT", "10"))

    def recommend(self, request_data: dict[str, Any]) -> dict[str, Any]:
        current = request_data["current_location"]
        destination = request_data["destination"]
        battery_pct = float(request_data["battery_percentage"])
        battery_capacity = float(request_data["battery_capacity"])
        efficiency = float(request_data["efficiency"])

        route = self.routing_service.get_route(current, destination)
        route_points = route["route_points"]
        request_seed = self._build_request_seed(request_data, route["total_distance_km"])

        search_radius = max(min(route["total_distance_km"] * 0.6 + 10.0, 120.0), 15.0)
        stations, station_sources = self._fetch_station_candidates(
            lat=float(current["lat"]),
            lng=float(current["lng"]),
            radius_km=search_radius
        )

        if not stations:
            return {
                "route": route,
                "recommended_stations": [],
                "reason": "No station data available from external providers or local DB.",
                "emergency_mode": False,
                "data_sources": {
                    "route": route.get("source", "UNKNOWN"),
                    "stations": station_sources,
                },
            }

        enriched = [
            self._enrich_station(
                station=s,
                current=current,
                route_points=route_points,
                battery_pct=battery_pct,
                battery_capacity=battery_capacity,
                efficiency=efficiency,
                request_seed=request_seed,
            )
            for s in stations
        ]

        filtered = [
            s for s in enriched
            if s["is_on_route_buffer"] and s["is_reachable_with_reserve"]
        ]

        emergency_mode = False
        if not filtered:
            emergency_mode = True
            logger.info("No station satisfied route+safety filters; fallback to nearest reachable.")
            filtered = [s for s in enriched if s["battery_after_reach_pct"] > 0]
            filtered = sorted(filtered, key=lambda x: x["distance_from_current_km"])[:8]

        if not filtered:
            return {
                "route": route,
                "recommended_stations": [],
                "reason": "No reachable stations found with current battery.",
                "emergency_mode": emergency_mode,
                "data_sources": {
                    "route": route.get("source", "UNKNOWN"),
                    "stations": station_sources,
                },
            }

        scored = self._score_stations(filtered, emergency_mode=emergency_mode)
        top3 = sorted(scored, key=lambda x: x["score"], reverse=True)[:3]

        return {
            "route": route,
            "recommended_stations": top3,
            "emergency_mode": emergency_mode,
            "reason": None,
            "data_sources": {
                "route": route.get("source", "UNKNOWN"),
                "stations": station_sources,
            },
        }

    def _fallback_local_stations(self) -> list[dict[str, Any]]:
        local = list(EVStation.objects.all()[:100])
        stations: list[dict[str, Any]] = []
        for row in local:
            stations.append(
                {
                    "id": str(row.id),
                    "name": row.name,
                    "latitude": float(row.latitude),
                    "longitude": float(row.longitude),
                    "charger_type": (row.charger_types or ["Unknown"])[0],
                    "power_kw": 30.0,  # conservative assumption for local imported data
                    "cost": float(row.price_per_unit),
                    "source": "LOCAL_DB",
                }
            )
        return stations

    def _fetch_station_candidates(self, lat: float, lng: float, radius_km: float) -> tuple[list[dict[str, Any]], list[str]]:
        external = get_all_stations(lat=lat, lng=lng, radius=radius_km)
        normalized_external = [self._normalize_external_station(row) for row in external]
        normalized_external = [row for row in normalized_external if row is not None]

        source_set = {str(row.get("source", "UNKNOWN")) for row in normalized_external}
        if normalized_external:
            return normalized_external, sorted(source_set)

        local = self._fallback_local_stations()
        return local, ["LOCAL_DB"]

    def _normalize_external_station(self, station: dict[str, Any]) -> dict[str, Any] | None:
        lat = station.get("latitude")
        lng = station.get("longitude")
        if lat is None or lng is None:
            return None

        connectors = station.get("connectors") or []
        charger_type = connectors[0] if connectors else "Unknown"
        power_kw = self._infer_power_kw(charger_type, connectors)
        return {
            "id": str(station.get("id") or ""),
            "name": station.get("name") or "Unknown Station",
            "latitude": float(lat),
            "longitude": float(lng),
            "charger_type": charger_type,
            "power_kw": power_kw,
            "cost": station.get("cost"),
            "source": station.get("source", "EXTERNAL"),
        }

    def _infer_power_kw(self, charger_type: str, connectors: list[Any]) -> float:
        text = f"{charger_type} {' '.join(str(c) for c in connectors)}".lower()
        if any(token in text for token in ["dc", "ccs", "super", "rapid", "chademo"]):
            return 60.0
        if any(token in text for token in ["ac", "type 2", "slow"]):
            return 22.0
        return 30.0

    def _build_request_seed(self, payload: dict[str, Any], route_distance: float) -> int:
        text = json.dumps(
            {
                "current_location": payload["current_location"],
                "destination": payload["destination"],
                "battery_percentage": payload["battery_percentage"],
                "route_distance": route_distance,
            },
            sort_keys=True,
        )
        return int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:12], 16)

    def _enrich_station(
        self,
        station: dict[str, Any],
        current: dict[str, float],
        route_points: list[tuple[float, float]],
        battery_pct: float,
        battery_capacity: float,
        efficiency: float,
        request_seed: int,
    ) -> dict[str, Any]:
        lat = float(station["latitude"])
        lng = float(station["longitude"])
        distance_from_current = haversine_km(float(current["lat"]), float(current["lng"]), lat, lng)
        route_distance = distance_to_route_km(lat, lng, route_points)
        detour_km = route_distance * 2.0
        detour_time_min = (detour_km / 35.0) * 60.0

        battery_after_reach = battery_after_distance_pct(
            distance_km=distance_from_current,
            battery_percentage=battery_pct,
            battery_capacity_kwh=battery_capacity,
            efficiency_kwh_per_km=efficiency,
        )

        simulation = self._simulate_realtime(station_id=station["id"], request_seed=request_seed)

        return {
            "id": station["id"],
            "name": station["name"],
            "latitude": lat,
            "longitude": lng,
            "distance_from_current_km": round(distance_from_current, 3),
            "distance_to_route_km": round(route_distance, 3),
            "detour_time": round(detour_time_min, 2),
            "charging_speed": float(station.get("power_kw") or 30.0),
            "cost": station.get("cost"),
            "charger_type": station.get("charger_type"),
            "availability": simulation["availability_status"],
            "wait_time": simulation["wait_time"],
            "availability_score_raw": simulation["availability_score_raw"],
            "battery_after_reach_pct": round(battery_after_reach, 2),
            "is_on_route_buffer": is_within_route_buffer(lat, lng, route_points, buffer_km=self.route_buffer_km),
            "is_reachable_with_reserve": satisfies_battery_safety(
                travel_distance_km=distance_from_current,
                battery_percentage=battery_pct,
                battery_capacity_kwh=battery_capacity,
                efficiency_kwh_per_km=efficiency,
                reserve_pct=self.reserve_battery_pct,
            ),
        }

    def _simulate_realtime(self, station_id: str, request_seed: int) -> dict[str, Any]:
        station_seed = int(hashlib.md5(str(station_id).encode("utf-8")).hexdigest()[:8], 16)  # nosec B324
        rng = random.Random(request_seed ^ station_seed)
        load_factor = rng.uniform(0.0, 1.0)
        availability_status = "available" if load_factor < 0.62 else "busy"
        wait_time = round(load_factor * 20.0, 1)
        availability_score_raw = round(1.0 - load_factor, 4)
        return {
            "availability_status": availability_status,
            "wait_time": wait_time,
            "availability_score_raw": availability_score_raw,
        }

    def _score_stations(self, stations: list[dict[str, Any]], emergency_mode: bool = False) -> list[dict[str, Any]]:
        distances = [s["distance_from_current_km"] for s in stations]
        speeds = [s["charging_speed"] for s in stations]
        waits = [s["wait_time"] for s in stations]
        detours = [s["detour_time"] for s in stations]
        battery_margins = [max(s["battery_after_reach_pct"] - self.reserve_battery_pct, 0.0) for s in stations]

        parsed_costs = [parse_cost_number(s.get("cost")) for s in stations]
        available_costs = [c for c in parsed_costs if c is not None]
        default_cost = sum(available_costs) / len(available_costs) if available_costs else 0.0
        costs = [c if c is not None else default_cost for c in parsed_costs]

        distance_scores = min_max_normalize(distances, reverse=True)
        speed_scores = min_max_normalize(speeds, reverse=False)
        wait_scores = min_max_normalize(waits, reverse=True)
        detour_scores = min_max_normalize(detours, reverse=True)
        battery_scores = min_max_normalize(battery_margins, reverse=False)
        cost_scores = min_max_normalize(costs, reverse=True)

        use_weights = dict(DEFAULT_WEIGHTS)
        if emergency_mode:
            # In emergency mode we prioritize closeness and battery safety.
            use_weights.update({"distance_score": 0.32, "battery_safety_score": 0.28, "availability_score": 0.16})

        scored: list[dict[str, Any]] = []
        for idx, station in enumerate(stations):
            features = {
                "distance_score": distance_scores[idx],
                "charging_speed_score": speed_scores[idx],
                "availability_score": (wait_scores[idx] + station["availability_score_raw"]) / 2.0,
                "cost_score": cost_scores[idx],
                "detour_time_score": detour_scores[idx],
                "battery_safety_score": battery_scores[idx],
            }
            station_score = apply_weighted_score(features, weights=use_weights)
            scored.append(
                {
                    "id": station["id"],
                    "name": station["name"],
                    "latitude": station["latitude"],
                    "longitude": station["longitude"],
                    "score": station_score,
                    "distance": station["distance_from_current_km"],
                    "charging_speed": station["charging_speed"],
                    "availability": station["availability"],
                    "wait_time": station["wait_time"],
                    "detour_time": station["detour_time"],
                    "battery_after_reach_pct": station["battery_after_reach_pct"],
                    "cost": station["cost"],
                    "features": features,
                }
            )
        return scored
