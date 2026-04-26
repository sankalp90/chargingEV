import logging
from typing import Any

import requests


logger = logging.getLogger(__name__)

NITI_BASE_URL = "https://e-amrit.niti.gov.in/getChargingStation"
REQUEST_TIMEOUT_SECONDS = 8


def _to_float(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _pick(payload: dict[str, Any], keys: list[str], default: Any = None) -> Any:
    for key in keys:
        value = payload.get(key)
        if value not in (None, ""):
            return value
    return default


def normalize_niti_station(raw_station: dict[str, Any]) -> dict[str, Any] | None:
    lat = _to_float(_pick(raw_station, ["latitude", "lat", "Latitude", "LAT", "lattitude"]))
    lng = _to_float(_pick(raw_station, ["longitude", "lng", "lon", "Longitude", "LONG", "LONGITUDE"]))
    if lat is None or lng is None:
        return None

    station_id = str(_pick(raw_station, ["id", "station_id", "stationId", "ID"], "")).strip()
    if not station_id:
        station_id = str(abs(hash((lat, lng, _pick(raw_station, ["name", "station_name", "title"], "station")))))

    connectors_raw = _pick(raw_station, ["connectors", "connector_types", "charger_types", "connectorType"], [])
    if isinstance(connectors_raw, str):
        connectors = [connectors_raw]
    elif isinstance(connectors_raw, list):
        connectors = [str(x) for x in connectors_raw if x not in (None, "")]
    else:
        connectors = []

    city = str(_pick(raw_station, ["city", "City", "district"], "Unknown"))
    address_parts = [
        _pick(raw_station, ["address", "Address", "station_address"], ""),
        city,
        _pick(raw_station, ["state", "State"], ""),
    ]
    address = ", ".join([p for p in address_parts if p])

    return {
        "id": f"niti-{station_id}",
        "name": str(_pick(raw_station, ["name", "station_name", "title", "Station Name"], "Unknown NITI Station")),
        "latitude": lat,
        "longitude": lng,
        "address": address or "Unknown address",
        "connectors": connectors or ["Unknown"],
        "available": True,
        "source": "NITI",
        "city": city,
    }


def fetch_niti_stations(lat: float, lng: float, radius: float) -> list[dict[str, Any]]:
    params = {"lat": lat, "lng": lng, "radius": radius}
    logger.info("Fetching NITI stations params=%s", params)

    try:
        resp = requests.get(NITI_BASE_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        resp.raise_for_status()
        payload = resp.json()
    except requests.RequestException as exc:
        logger.warning("NITI station API request failed: %s", exc)
        return []
    except ValueError as exc:
        logger.warning("NITI station API invalid JSON: %s", exc)
        return []

    if isinstance(payload, list):
        raw = payload
    elif isinstance(payload, dict):
        raw = payload.get("data") or payload.get("stations") or payload.get("results") or []
    else:
        raw = []

    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        normalized = normalize_niti_station(item)
        if normalized:
            out.append(normalized)

    logger.info("NITI normalized stations=%s", len(out))
    return out

