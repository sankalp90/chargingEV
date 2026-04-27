import json
import logging
import os
from urllib import error, request

from django.core.cache import cache

from stations.utils.geo import haversine_km


logger = logging.getLogger(__name__)

ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
ROUTE_CACHE_TTL_SECONDS = 60


class RoutingService:
    def __init__(self) -> None:
        self.api_key = os.getenv("ORS_API_KEY", "").strip()

    def get_route(self, current_location: dict, destination: dict) -> dict:
        clat = float(current_location["lat"])
        clng = float(current_location["lng"])
        dlat = float(destination["lat"])
        dlng = float(destination["lng"])
        cache_key = f"route:{round(clat,5)}:{round(clng,5)}:{round(dlat,5)}:{round(dlng,5)}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        route = self._fetch_ors_route(clat, clng, dlat, dlng) if self.api_key else None
        if route is None:
            route = self._fallback_route(clat, clng, dlat, dlng)

        cache.set(cache_key, route, ROUTE_CACHE_TTL_SECONDS)
        return route

    def _fetch_ors_route(self, clat: float, clng: float, dlat: float, dlng: float) -> dict | None:
        payload = {
            "coordinates": [[clng, clat], [dlng, dlat]],
        }
        req = request.Request(
            ORS_DIRECTIONS_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": self.api_key,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=8) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (error.URLError, TimeoutError, ValueError) as exc:
            logger.warning("ORS route request failed, using fallback: %s", exc)
            return None

        features = body.get("features") or []
        if not features:
            return None

        feature = features[0]
        geometry = feature.get("geometry") or {}
        props = feature.get("properties") or {}
        summary = (props.get("summary") or {})
        coordinates = geometry.get("coordinates") or []
        route_points = [(float(lat), float(lng)) for lng, lat, *_ in coordinates]

        if not route_points:
            return None

        return {
            "polyline": coordinates,  # [lng, lat] from ORS
            "route_points": route_points,  # [(lat, lng)] for geo calculations
            "total_distance_km": round(float(summary.get("distance", 0.0)) / 1000.0, 3),
            "eta_minutes": round(float(summary.get("duration", 0.0)) / 60.0, 2),
            "source": "ORS",
        }

    def _fallback_route(self, clat: float, clng: float, dlat: float, dlng: float) -> dict:
        # Straight-line backup route so system still works when ORS key is missing/fails.
        distance_km = haversine_km(clat, clng, dlat, dlng)
        eta_minutes = (distance_km / 40.0) * 60.0  # 40 km/h avg city speed assumption
        return {
            "polyline": [[clng, clat], [dlng, dlat]],
            "route_points": [(clat, clng), (dlat, dlng)],
            "total_distance_km": round(distance_km, 3),
            "eta_minutes": round(eta_minutes, 2),
            "source": "FALLBACK",
        }
