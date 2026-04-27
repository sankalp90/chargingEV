import json
import logging
import os
from typing import Any
from urllib import error, parse, request

from django.core.cache import cache


logger = logging.getLogger(__name__)

OCM_BASE_URL = "https://api.openchargemap.io/v3/poi/"
OCM_CACHE_TTL_SECONDS = 300


class OpenChargeMapService:
    def __init__(self) -> None:
        self.api_key = os.getenv("OCM_API_KEY", "").strip()

    def fetch_stations(self, lat: float, lng: float, radius_km: float = 40.0, max_results: int = 100) -> list[dict[str, Any]]:
        cache_key = f"ocm:{round(lat,4)}:{round(lng,4)}:{round(radius_km,1)}:{max_results}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        query_params = {
            "output": "json",
            "maxresults": max_results,
            "compact": "true",
            "verbose": "false",
            "countrycode": os.getenv("OCM_COUNTRY_CODE", "IN"),
            "latitude": lat,
            "longitude": lng,
            "distance": radius_km,
            "distanceunit": "KM",
        }
        if self.api_key:
            query_params["key"] = self.api_key

        url = f"{OCM_BASE_URL}?{parse.urlencode(query_params)}"
        req = request.Request(url, method="GET")
        req.add_header("User-Agent", "chargingEV-college-project/1.0")
        req.add_header("Accept", "application/json")
        if self.api_key:
            req.add_header("X-API-Key", self.api_key)
        try:
            with request.urlopen(req, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (error.URLError, TimeoutError, ValueError) as exc:
            logger.warning("OpenChargeMap request failed: %s", exc)
            return []

        if not isinstance(payload, list):
            return []

        normalized: list[dict[str, Any]] = []
        for item in payload:
            station = self._normalize_station(item)
            if station:
                normalized.append(station)

        cache.set(cache_key, normalized, OCM_CACHE_TTL_SECONDS)
        return normalized

    def _normalize_station(self, station: dict[str, Any]) -> dict[str, Any] | None:
        address = station.get("AddressInfo") or {}
        lat = address.get("Latitude")
        lng = address.get("Longitude")
        if lat is None or lng is None:
            return None

        connections = station.get("Connections") or []
        charger_types: list[str] = []
        powers_kw: list[float] = []
        for connection in connections:
            if not isinstance(connection, dict):
                continue
            ctype = (connection.get("ConnectionType") or {}).get("Title")
            if ctype:
                charger_types.append(ctype)
            power_kw = connection.get("PowerKW")
            try:
                if power_kw is not None:
                    powers_kw.append(float(power_kw))
            except (TypeError, ValueError):
                pass

        usage_cost = station.get("UsageCost")
        return {
            "id": str(station.get("ID") or ""),
            "name": address.get("Title") or "Unknown Station",
            "latitude": float(lat),
            "longitude": float(lng),
            "charger_type": charger_types[0] if charger_types else "Unknown",
            "power_kw": max(powers_kw) if powers_kw else 30.0,
            "cost": usage_cost,
            "address": address.get("AddressLine1"),
            "raw_connections_count": len(connections),
        }
