import logging
from typing import Any

import requests


logger = logging.getLogger(__name__)

OCM_BASE_URL = "https://api.openchargemap.io/v3/poi/"
REQUEST_TIMEOUT_SECONDS = 8


def _to_float(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize_ocm_station(raw_station: dict[str, Any]) -> dict[str, Any] | None:
    address = raw_station.get("AddressInfo") or {}
    lat = _to_float(address.get("Latitude"))
    lng = _to_float(address.get("Longitude"))
    if lat is None or lng is None:
        return None

    station_id = raw_station.get("ID")
    title = address.get("Title") or "Unnamed OCM Station"
    town = address.get("Town") or address.get("StateOrProvince") or "Unknown"
    address_text = ", ".join(
        [p for p in [address.get("AddressLine1"), address.get("AddressLine2"), town] if p]
    ) or town

    connections = raw_station.get("Connections") or []
    connectors: list[str] = []
    for c in connections:
        if not isinstance(c, dict):
            continue
        label = (c.get("ConnectionType") or {}).get("Title")
        if label:
            connectors.append(label)

    operational = (raw_station.get("StatusType") or {}).get("IsOperational", True)

    return {
        "id": f"ocm-{station_id}",
        "name": title,
        "latitude": lat,
        "longitude": lng,
        "address": address_text,
        "connectors": connectors or ["Unknown"],
        "available": bool(operational),
        "source": "OCM",
        "city": town,
    }


def fetch_ocm_stations(lat: float, lng: float, radius: float) -> list[dict[str, Any]]:
    params = {
        "output": "json",
        "countrycode": "IN",
        "maxresults": 200,
        "compact": "true",
        "verbose": "false",
        "latitude": lat,
        "longitude": lng,
        "distance": radius,
        "distanceunit": "KM",
    }
    logger.info("Fetching OCM stations params=%s", params)

    try:
        resp = requests.get(OCM_BASE_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        resp.raise_for_status()
        payload = resp.json()
    except requests.RequestException as exc:
        logger.warning("OCM station API request failed: %s", exc)
        return []
    except ValueError as exc:
        logger.warning("OCM station API invalid JSON: %s", exc)
        return []

    if not isinstance(payload, list):
        return []

    out: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        normalized = normalize_ocm_station(item)
        if normalized:
            out.append(normalized)

    logger.info("OCM normalized stations=%s", len(out))
    return out

