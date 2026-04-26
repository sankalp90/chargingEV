import hashlib
import math
from typing import Any

from django.core.cache import cache

from .niti_service import fetch_niti_stations
from .ocm_service import fetch_ocm_stations


EARTH_RADIUS_METERS = 6371000
DEDUP_THRESHOLD_METERS = 100
CACHE_TIMEOUT_SECONDS = 5 * 60


def stable_numeric_id(external_id: str) -> int:
    """
    Return a stable positive int for any external station id string.
    Used so the existing frontend booking import flow (expects numeric ids) works unchanged.
    """
    digest = hashlib.md5(external_id.encode("utf-8")).hexdigest()[:8]
    return int(digest, 16)


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_METERS * c


def _merge(primary: dict[str, Any], secondary: dict[str, Any]) -> dict[str, Any]:
    merged = dict(secondary)
    merged.update(primary)
    connectors = list(dict.fromkeys((primary.get("connectors") or []) + (secondary.get("connectors") or [])))
    merged["connectors"] = connectors or ["Unknown"]
    return merged


def deduplicate_stations(stations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    for s in stations:
        lat = _to_float(s.get("latitude"))
        lng = _to_float(s.get("longitude"))
        s["latitude"] = lat
        s["longitude"] = lng

        match_idx = None
        for idx, e in enumerate(deduped):
            if _haversine_m(lat, lng, e["latitude"], e["longitude"]) < DEDUP_THRESHOLD_METERS:
                match_idx = idx
                break

        if match_idx is None:
            deduped.append(s)
            continue

        existing = deduped[match_idx]
        # Priority: prefer NITI over OCM when close duplicates are found.
        if s.get("source") == "NITI" and existing.get("source") != "NITI":
            deduped[match_idx] = _merge(s, existing)
        elif existing.get("source") == "NITI" and s.get("source") != "NITI":
            deduped[match_idx] = _merge(existing, s)
        else:
            deduped[match_idx] = _merge(existing, s)

    return deduped


def get_all_stations(lat: float, lng: float, radius: float) -> list[dict[str, Any]]:
    cache_key = f"stations:agg:{round(lat,4)}:{round(lng,4)}:{round(radius,2)}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    ocm = fetch_ocm_stations(lat=lat, lng=lng, radius=radius)
    niti = fetch_niti_stations(lat=lat, lng=lng, radius=radius)
    merged = deduplicate_stations(niti + ocm)

    cache.set(cache_key, merged, CACHE_TIMEOUT_SECONDS)
    return merged

