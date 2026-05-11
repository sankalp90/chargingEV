import math
from typing import Iterable


EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def distance_to_route_km(point_lat: float, point_lng: float, route_points: Iterable[tuple[float, float]]) -> float:
    """
    Approximates shortest distance by nearest route polyline vertex.
    Works well for route-buffer filtering without heavy geospatial deps.
    """
    points = list(route_points)
    if not points:
        return float("inf")
    return min(haversine_km(point_lat, point_lng, lat, lng) for lat, lng in points)


def is_within_route_buffer(point_lat: float, point_lng: float, route_points: Iterable[tuple[float, float]], buffer_km: float = 5.0) -> bool:
    return distance_to_route_km(point_lat, point_lng, route_points) <= buffer_km
