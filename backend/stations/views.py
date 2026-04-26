from decimal import Decimal

from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import EVStation
from .serializers import StationSerializer
from services.station_aggregator import get_all_stations, stable_numeric_id


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


@api_view(['GET'])
def available_slots(request, station_id):
    get_object_or_404(EVStation, pk=station_id)
    # Predefined slots, all available for now
    slots = [
        {"id": slot, "label": slot, "available": True}
        for slot in [
            "06:00 - 07:00", "07:00 - 08:00", "08:00 - 09:00", "09:00 - 10:00",
            "10:00 - 11:00", "11:00 - 12:00", "04:00 - 05:00 PM", "05:00 - 06:00 PM",
            "06:00 - 07:00 PM", "07:00 - 08:00 PM"
        ]
    ]
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
