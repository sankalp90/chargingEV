from decimal import Decimal
import math
from collections import defaultdict
from datetime import datetime, time, timedelta

from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from bookings.models import Booking
from .models import EVStation
from .recommendation_engine import ChargingRecommendationEngine
from .serializers import RecommendChargingRequestSerializer, StationSerializer
from services.station_aggregator import get_all_stations, stable_numeric_id

EARTH_RADIUS_KM = 6371.0
SLOT_WINDOWS = [
    ("06:00 - 07:00", time(6, 0), time(7, 0)),
    ("07:00 - 08:00", time(7, 0), time(8, 0)),
    ("08:00 - 09:00", time(8, 0), time(9, 0)),
    ("09:00 - 10:00", time(9, 0), time(10, 0)),
    ("10:00 - 11:00", time(10, 0), time(11, 0)),
    ("11:00 - 12:00", time(11, 0), time(12, 0)),
    ("04:00 - 05:00 PM", time(16, 0), time(17, 0)),
    ("05:00 - 06:00 PM", time(17, 0), time(18, 0)),
    ("06:00 - 07:00 PM", time(18, 0), time(19, 0)),
    ("07:00 - 08:00 PM", time(19, 0), time(20, 0)),
]


def _parse_eta(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("estimated_arrival_time must be ISO datetime.") from exc
    raise ValueError("estimated_arrival_time must be a string or datetime.")


def _station_requests_from_payload(payload):
    station_ids = payload.get("station_ids")
    eta_values = payload.get("estimated_arrival_times")
    if station_ids is not None:
        if not isinstance(station_ids, list) or not station_ids:
            raise ValueError("station_ids must be a non-empty list.")
        if eta_values is None:
            eta_values = [None] * len(station_ids)
        if not isinstance(eta_values, list) or len(eta_values) != len(station_ids):
            raise ValueError("estimated_arrival_times must match station_ids length.")
        requests = []
        for station_id, eta in zip(station_ids, eta_values):
            requests.append({"station_id": int(station_id), "estimated_arrival_time": _parse_eta(eta)})
        return requests

    requests = payload.get("requests") or []
    if not isinstance(requests, list) or not requests:
        raise ValueError("Provide station_ids with estimated_arrival_times or requests list.")
    normalized = []
    for item in requests:
        if not isinstance(item, dict):
            raise ValueError("Each request must be an object.")
        normalized.append({
            "station_id": int(item.get("station_id")),
            "estimated_arrival_time": _parse_eta(item.get("estimated_arrival_time")),
        })
    return normalized


def _haversine_distance_km(lat1, lng1, lat2, lng2):
    lat1_rad, lng1_rad = math.radians(lat1), math.radians(lng1)
    lat2_rad, lng2_rad = math.radians(lat2), math.radians(lng2)
    d_lat = lat2_rad - lat1_rad
    d_lng = lng2_rad - lng1_rad

    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * (math.sin(d_lng / 2) ** 2)
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def _point_to_segment_distance_km(point_lat, point_lng, start_lat, start_lng, end_lat, end_lng):
    # Use local equirectangular projection for segment distance and clamp to segment endpoints.
    ref_lat = math.radians((start_lat + end_lat + point_lat) / 3.0)
    km_per_deg_lat = 111.32
    km_per_deg_lng = 111.32 * math.cos(ref_lat)

    px = point_lng * km_per_deg_lng
    py = point_lat * km_per_deg_lat
    x1 = start_lng * km_per_deg_lng
    y1 = start_lat * km_per_deg_lat
    x2 = end_lng * km_per_deg_lng
    y2 = end_lat * km_per_deg_lat

    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return _haversine_distance_km(point_lat, point_lng, start_lat, start_lng)

    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    nearest_x = x1 + t * dx
    nearest_y = y1 + t * dy

    return math.hypot(px - nearest_x, py - nearest_y)


def _normalize_route_coordinate(point):
    if not isinstance(point, (list, tuple)) or len(point) != 2:
        raise ValueError("Each route coordinate must be [lat, lng].")
    lat = float(point[0])
    lng = float(point[1])
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise ValueError("Route coordinate out of range.")
    return lat, lng


def _normalize_external_station(station):
    connectors = station.get("connectors") or ["Unknown"]
    total_slots = max(len(connectors), 1)
    available_slots = total_slots if station.get("available", True) else 0
    external_id = str(station.get("id") or "")
    int_id = stable_numeric_id(external_id)

    return {
        # IMPORTANT: expose numeric ids so existing frontend booking import flow works unchanged.
        "id": int_id,
        "external_id": external_id,
        "name": station.get("name") or "Unknown Station",
        "city": station.get("city") or "Unknown",
        "latitude": station.get("latitude"),
        "longitude": station.get("longitude"),
        "lat": station.get("latitude"),
        "lng": station.get("longitude"),
        "charger_types": connectors,
        "connectors": connectors,
        "total_slots": total_slots,
        "available_slots": available_slots,
        "price_per_unit": 20,
        "address": station.get("address") or "Unknown address",
        "source": station.get("source", "OCM"),
    }


class StationListView(APIView):
    DEFAULT_LAT = 28.6139
    DEFAULT_LNG = 77.2090
    DEFAULT_RADIUS = 200

    def get(self, request):
        search = request.query_params.get("search", "").strip().lower()
        city = request.query_params.get("city", "").strip().lower()
        availability = request.query_params.get("availability", "").strip().lower()
        try:
            lat = float(request.query_params.get("lat", self.DEFAULT_LAT))
            lng = float(request.query_params.get("lng", self.DEFAULT_LNG))
            radius = float(request.query_params.get("radius", self.DEFAULT_RADIUS))
        except (TypeError, ValueError):
            return Response({"detail": "Invalid lat/lng/radius."}, status=status.HTTP_400_BAD_REQUEST)

        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180) or radius <= 0:
            return Response({"detail": "Invalid lat/lng/radius."}, status=status.HTTP_400_BAD_REQUEST)

        external_stations = [_normalize_external_station(item) for item in get_all_stations(lat, lng, radius)]
        local_stations = list(StationSerializer(EVStation.objects.all(), many=True).data)
        for station in local_stations:
            station["source"] = station.get("source", "LOCAL")
            station["external_id"] = str(station["id"])
            station["connectors"] = station.get("charger_types") or []

        stations = local_stations + external_stations

        if search:
            stations = [
                station for station in stations
                if search in (station.get("name", "").lower()) or search in (station.get("city", "").lower())
            ]
        if city:
            stations = [station for station in stations if station.get("city", "").lower() == city]
        if availability == "available":
            stations = [station for station in stations if int(station.get("available_slots", 0)) > 0]
        elif availability == "busy":
            stations = [station for station in stations if int(station.get("available_slots", 0)) <= 0]

        return Response(stations)


class StationDetailView(generics.RetrieveAPIView):
    queryset = EVStation.objects.all()
    serializer_class = StationSerializer


class RecommendChargingView(APIView):
    """
    POST /api/stations/recommend-charging/
    """
    engine = ChargingRecommendationEngine()

    def post(self, request):
        serializer = RecommendChargingRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = self.engine.recommend(serializer.validated_data)
        return Response(result, status=status.HTTP_200_OK)


@api_view(['GET'])
def available_slots(request, station_id):
    get_object_or_404(EVStation, pk=station_id)
    slots = [{"id": label, "label": label, "available": True} for label, _, _ in SLOT_WINDOWS]
    return Response(slots)


@api_view(['POST'])
def import_station(request):

    payload = request.data or {}
    station_id = payload.get('id')

    if station_id in (None, ''):
        return Response({'detail': 'Station id is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        station_id = int(station_id)
    except (TypeError, ValueError):
        return Response({'detail': 'Station id must be numeric.'}, status=status.HTTP_400_BAD_REQUEST)

    name = (payload.get('name') or '').strip()
    if not name:
        return Response({'detail': 'Station name is required.'}, status=status.HTTP_400_BAD_REQUEST)

    city = (payload.get('city') or 'Unknown').strip() or 'Unknown'
    charger_types = payload.get('charger_types') or ['CCS2']

    try:
        latitude = payload.get('latitude')
        longitude = payload.get('longitude')
        total_slots = int(payload.get('total_slots') or 6)
        available_slots = int(payload.get('available_slots') or 3)
        price_per_unit = payload.get('price_per_unit') or 20
    except (TypeError, ValueError):
        return Response({'detail': 'Invalid station payload.'}, status=status.HTTP_400_BAD_REQUEST)

    station, _ = EVStation.objects.update_or_create(
        id=station_id,
        defaults={
            'name': name,
            'city': city,
            'latitude': latitude,
            'longitude': longitude,
            'total_slots': max(total_slots, 1),
            'available_slots': max(min(available_slots, total_slots or 1), 0),
            'charger_types': charger_types,
            'price_per_unit': price_per_unit,
        },
    )
    return Response({'id': station.id}, status=status.HTTP_200_OK)

    data = request.data
    name = (data.get('name') or '').strip()
    city = (data.get('city') or '').strip()
    latitude = data.get('latitude')
    longitude = data.get('longitude')

    if not name or not city or latitude is None or longitude is None:
        raise ValidationError("name, city, latitude, and longitude are required.")

    station, _ = EVStation.objects.get_or_create(
        name=name,
        city=city,
        latitude=latitude,
        longitude=longitude,
        defaults={
            'total_slots': int(data.get('total_slots') or 6),
            'available_slots': int(data.get('available_slots') or 3),
            'charger_types': data.get('charger_types') or ['CCS2'],
            'price_per_unit': Decimal(data.get('price_per_unit') or 20),
        },
    )
    return Response(StationSerializer(station).data)


@api_view(['POST'])
def stations_along_route(request):
    payload = request.data or {}
    route_coordinates = payload.get("route_coordinates") or payload.get("polyline") or []
    radius_km = payload.get("radius_km", payload.get("radius"))

    if radius_km is None:
        return Response({"detail": "radius is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        radius_km = float(radius_km)
    except (TypeError, ValueError):
        return Response({"detail": "radius must be numeric."}, status=status.HTTP_400_BAD_REQUEST)

    if radius_km <= 0:
        return Response({"detail": "radius must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        route_points = [_normalize_route_coordinate(point) for point in route_coordinates]
    except (TypeError, ValueError) as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    if len(route_points) < 2:
        return Response(
            {"detail": "route_coordinates must include at least 2 points."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    matched_by_station = {}

    # Build a corridor-wide fetch zone so external providers can contribute route stations too.
    route_lats = [point[0] for point in route_points]
    route_lngs = [point[1] for point in route_points]
    min_route_lat = min(route_lats)
    max_route_lat = max(route_lats)
    min_route_lng = min(route_lngs)
    max_route_lng = max(route_lngs)
    center_lat = (min_route_lat + max_route_lat) / 2.0
    center_lng = (min_route_lng + max_route_lng) / 2.0
    diagonal_km = _haversine_distance_km(min_route_lat, min_route_lng, max_route_lat, max_route_lng)
    corridor_radius_km = max(diagonal_km / 2.0 + radius_km, radius_km)

    external_candidates = []
    for item in get_all_stations(center_lat, center_lng, corridor_radius_km):
        normalized = _normalize_external_station(item)
        try:
            ext_lat = float(normalized.get("latitude"))
            ext_lng = float(normalized.get("longitude"))
        except (TypeError, ValueError):
            continue
        external_candidates.append(
            {
                "station_id": int(normalized["id"]),
                "name": normalized.get("name") or "Unknown Station",
                "lat": ext_lat,
                "lng": ext_lng,
            }
        )

    for start, end in zip(route_points, route_points[1:]):
        min_lat = min(start[0], end[0]) - (radius_km / 111.32)
        max_lat = max(start[0], end[0]) + (radius_km / 111.32)
        avg_lat = (start[0] + end[0]) / 2.0
        lng_delta = radius_km / max(111.32 * math.cos(math.radians(avg_lat)), 0.0001)
        min_lng = min(start[1], end[1]) - lng_delta
        max_lng = max(start[1], end[1]) + lng_delta

        local_candidates = EVStation.objects.filter(
            latitude__gte=min_lat,
            latitude__lte=max_lat,
            longitude__gte=min_lng,
            longitude__lte=max_lng,
        )

        for station in local_candidates:
            station_lat = float(station.latitude)
            station_lng = float(station.longitude)
            distance_km = _point_to_segment_distance_km(
                station_lat,
                station_lng,
                start[0],
                start[1],
                end[0],
                end[1],
            )
            if distance_km > radius_km:
                continue

            current = matched_by_station.get(station.id)
            if current is None or distance_km < current["distance_from_route"]:
                matched_by_station[station.id] = {
                    "station_id": station.id,
                    "name": station.name,
                    "location": {
                        "lat": station_lat,
                        "lng": station_lng,
                    },
                    "distance_from_route": round(distance_km, 3),
                }

        for station in external_candidates:
            station_lat = station["lat"]
            station_lng = station["lng"]
            if not (min_lat <= station_lat <= max_lat and min_lng <= station_lng <= max_lng):
                continue
            distance_km = _point_to_segment_distance_km(
                station_lat,
                station_lng,
                start[0],
                start[1],
                end[0],
                end[1],
            )
            if distance_km > radius_km:
                continue

            current = matched_by_station.get(station["station_id"])
            if current is None or distance_km < current["distance_from_route"]:
                matched_by_station[station["station_id"]] = {
                    "station_id": station["station_id"],
                    "name": station["name"],
                    "location": {
                        "lat": station_lat,
                        "lng": station_lng,
                    },
                    "distance_from_route": round(distance_km, 3),
                }

    results = sorted(matched_by_station.values(), key=lambda item: item["distance_from_route"])
    return Response(results, status=status.HTTP_200_OK)


@api_view(['POST'])
def bulk_station_availability(request):
    payload = request.data or {}
    window_minutes = payload.get("window_minutes", 60)

    try:
        window_minutes = int(window_minutes)
        if window_minutes <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        return Response({"detail": "window_minutes must be a positive integer."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        station_requests = _station_requests_from_payload(payload)
    except (TypeError, ValueError) as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    station_ids = sorted({item["station_id"] for item in station_requests})
    existing_station_ids = set(
        EVStation.objects.filter(id__in=station_ids).values_list("id", flat=True)
    )
    target_dates = sorted(
        {
            item["estimated_arrival_time"].date()
            for item in station_requests
            if item["estimated_arrival_time"] is not None
        }
    )

    booked_lookup = defaultdict(set)
    if station_ids and target_dates:
        booked_rows = (
            Booking.objects
            .filter(station_id__in=station_ids, date__in=target_dates)
            .exclude(status='Cancelled')
            .values_list("station_id", "date", "slot")
        )
        for station_id, booking_date, slot_label in booked_rows:
            booked_lookup[(station_id, booking_date)].add(slot_label)

    results = []
    for item in station_requests:
        station_id = item["station_id"]
        eta = item["estimated_arrival_time"]
        if station_id not in existing_station_ids:
            results.append({"station_id": station_id, "available_slots": []})
            continue

        if eta is None:
            available = [{"id": label, "label": label} for label, _, _ in SLOT_WINDOWS]
            results.append({"station_id": station_id, "available_slots": available})
            continue

        date_key = eta.date()
        window_start = eta - timedelta(minutes=window_minutes)
        window_end = eta + timedelta(minutes=window_minutes)
        booked_for_station = booked_lookup.get((station_id, date_key), set())

        available = []
        for label, slot_start_time, slot_end_time in SLOT_WINDOWS:
            slot_start = datetime.combine(date_key, slot_start_time, tzinfo=eta.tzinfo)
            slot_end = datetime.combine(date_key, slot_end_time, tzinfo=eta.tzinfo)
            in_window = slot_start < window_end and slot_end > window_start
            if not in_window or label in booked_for_station:
                continue
            available.append({"id": label, "label": label})

        results.append({"station_id": station_id, "available_slots": available})

    return Response(results, status=status.HTTP_200_OK)
