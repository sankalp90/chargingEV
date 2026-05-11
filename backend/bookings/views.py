from rest_framework import generics, status
from django.db import transaction
from datetime import datetime
from collections import Counter
from decimal import Decimal
from rest_framework.exceptions import ValidationError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Booking
from .serializers import BookingSerializer, BookingCreateSerializer
from stations.models import EVStation


def _nearest_station_alternatives(station, slot, booking_date, limit=3):
    alternatives = []
    if not station:
        return alternatives

    candidates = EVStation.objects.filter(
        city=station.city,
        available_slots__gt=0,
    ).exclude(id=station.id)

    for candidate in candidates:
        conflict = Booking.objects.filter(
            station=candidate,
            date=booking_date,
            slot=slot,
        ).exclude(status='Cancelled').exists()
        if conflict:
            continue
        alternatives.append(
            {
                "station_id": candidate.id,
                "name": candidate.name,
                "city": candidate.city,
            }
        )
        if len(alternatives) >= limit:
            break
    return alternatives


# 600000000m
class BookingListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Booking.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return BookingCreateSerializer
        return BookingSerializer

    def perform_create(self, serializer):
        with transaction.atomic():
            station = EVStation.objects.select_for_update().get(pk=serializer.validated_data['station'].id)
            if station.available_slots <= 0:
                raise ValidationError("No slots available at this station.")
            is_slot_already_booked = Booking.objects.filter(
                station=station,
                date=serializer.validated_data['date'],
                slot=serializer.validated_data['slot'],
            ).exclude(status='Cancelled').exists()
            if is_slot_already_booked:
                raise ValidationError("This slot is already booked for the selected station and date.")
            booking = serializer.save(user=self.request.user, station=station)
            station.available_slots -= 1
            station.save(update_fields=["available_slots"])
            return booking

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = self.perform_create(serializer)
        output_serializer = BookingSerializer(booking)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class BookingCancelView(generics.UpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = BookingSerializer

    def get_queryset(self):
        return Booking.objects.filter(user=self.request.user)

    def patch(self, request, *args, **kwargs):
        booking = self.get_object()
        if booking.status == 'Cancelled':
            serializer = self.get_serializer(booking)
            return Response(serializer.data)

        booking.status = 'Cancelled'
        booking.save(update_fields=['status'])

        station = booking.station
        station.available_slots += 1
        station.save(update_fields=['available_slots'])

        serializer = self.get_serializer(booking)
        return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bulk_booking_create(request):
    payload = request.data or {}
    items = payload if isinstance(payload, list) else payload.get("bookings", [])
    allow_partial = bool(payload.get("allow_partial", False)) if isinstance(payload, dict) else False

    if not isinstance(items, list) or not items:
        return Response(
            {"success": False, "detail": "Provide a non-empty bookings list."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    normalized = []
    try:
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                raise ValidationError(f"Booking item at index {index} must be an object.")

            station_id = int(item.get("station_id"))
            slot_id = (item.get("slot_id") or "").strip()
            start_time_raw = item.get("start_time")
            end_time_raw = item.get("end_time")

            if not slot_id:
                raise ValidationError(f"slot_id is required at index {index}.")
            if not start_time_raw or not end_time_raw:
                raise ValidationError(f"start_time and end_time are required at index {index}.")

            start_dt = datetime.fromisoformat(str(start_time_raw).replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(str(end_time_raw).replace("Z", "+00:00"))
            if end_dt <= start_dt:
                raise ValidationError(f"end_time must be after start_time at index {index}.")

            normalized.append(
                {
                    "station_id": station_id,
                    "slot": slot_id,
                    "date": start_dt.date(),
                    "start_dt": start_dt,
                    "end_dt": end_dt,
                    "charger_type": item.get("charger_type") or "CCS2",
                    "energy_needed": Decimal(str(item.get("energy_needed") or "10.00")),
                    "vehicle_number": item.get("vehicle_number") or "UNKNOWN",
                    "notes": item.get("notes") or "",
                }
            )
    except (TypeError, ValueError, ValidationError, ArithmeticError) as exc:
        return Response({"success": False, "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    # Prevent duplicate requests in the same payload for identical station/date/slot.
    request_keys = [(item["station_id"], item["date"], item["slot"]) for item in normalized]
    if len(request_keys) != len(set(request_keys)):
        return Response(
            {"success": False, "detail": "Duplicate station/date/slot found in request payload."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    station_ids = sorted({item["station_id"] for item in normalized})

    with transaction.atomic():
        stations = {
            station.id: station
            for station in EVStation.objects.select_for_update().filter(id__in=station_ids)
        }
        if len(stations) != len(station_ids):
            missing = sorted(set(station_ids) - set(stations.keys()))
            return Response(
                {"success": False, "detail": f"Invalid station_id(s): {missing}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Existing conflicts in one batch query.
        existing = (
            Booking.objects.filter(
                station_id__in=station_ids,
                date__in={item["date"] for item in normalized},
                slot__in={item["slot"] for item in normalized},
            )
            .exclude(status='Cancelled')
            .values("station_id", "date", "slot")
        )
        existing_keys = {(row["station_id"], row["date"], row["slot"]) for row in existing}

        failures = []
        for index, item in enumerate(normalized):
            key = (item["station_id"], item["date"], item["slot"])
            station = stations.get(item["station_id"])
            conflict = key in existing_keys
            capacity_issue = station and station.available_slots <= 0
            if not conflict and not capacity_issue:
                continue
            failures.append(
                {
                    "index": index,
                    "station_id": item["station_id"],
                    "slot_id": item["slot"],
                    "date": str(item["date"]),
                    "reason": "slot_conflict" if conflict else "station_unavailable",
                    "alternatives": _nearest_station_alternatives(station, item["slot"], item["date"]),
                }
            )

        required_counts = Counter(item["station_id"] for item in normalized)
        for station_id, count in required_counts.items():
            if stations[station_id].available_slots < count:
                failures.append(
                    {
                        "station_id": station_id,
                        "reason": "insufficient_capacity",
                        "detail": f"Insufficient available slots at station {station_id}.",
                    }
                )
        if failures and not allow_partial:
            return Response(
                {
                    "success": False,
                    "detail": "One or more bookings failed validation.",
                    "failed_bookings": failures,
                    "retryable": True,
                },
                status=status.HTTP_409_CONFLICT,
            )

        created = []
        for index, item in enumerate(normalized):
            if any(f.get("index") == index for f in failures):
                continue
            station = stations[item["station_id"]]
            if station.available_slots <= 0:
                if allow_partial:
                    failures.append(
                        {
                            "index": index,
                            "station_id": item["station_id"],
                            "slot_id": item["slot"],
                            "date": str(item["date"]),
                            "reason": "station_unavailable",
                            "alternatives": _nearest_station_alternatives(station, item["slot"], item["date"]),
                        }
                    )
                    continue
                transaction.set_rollback(True)
                return Response(
                    {
                        "success": False,
                        "detail": f"Station {item['station_id']} became unavailable during booking.",
                        "retryable": True,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            slot_conflict = Booking.objects.filter(
                station=station,
                date=item["date"],
                slot=item["slot"],
            ).exclude(status='Cancelled').exists()
            if slot_conflict:
                if allow_partial:
                    failures.append(
                        {
                            "index": index,
                            "station_id": item["station_id"],
                            "slot_id": item["slot"],
                            "date": str(item["date"]),
                            "reason": "slot_conflict",
                            "alternatives": _nearest_station_alternatives(station, item["slot"], item["date"]),
                        }
                    )
                    continue
                transaction.set_rollback(True)
                return Response(
                    {
                        "success": False,
                        "detail": f"Slot conflict detected during booking for station {item['station_id']}.",
                        "retryable": True,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            amount = item["energy_needed"] * station.price_per_unit
            booking = Booking.objects.create(
                user=request.user,
                station=station,
                station_external_id=str(station.id),
                source="LOCAL",
                date=item["date"],
                slot=item["slot"],
                charger_type=item["charger_type"],
                energy_needed=item["energy_needed"],
                vehicle_number=item["vehicle_number"],
                notes=item["notes"],
                amount=amount,
                status="Confirmed",
            )
            created.append(booking)
            station.available_slots -= 1

        for station in stations.values():
            station.save(update_fields=["available_slots"])

    if failures and created:
        return Response(
            {
                "success": True,
                "partial": True,
                "booking_ids": [booking.id for booking in created],
                "failed_bookings": failures,
                "retryable": True,
            },
            status=status.HTTP_207_MULTI_STATUS,
        )

    if failures and not created:
        return Response(
            {
                "success": False,
                "partial": False,
                "booking_ids": [],
                "failed_bookings": failures,
                "retryable": True,
            },
            status=status.HTTP_409_CONFLICT,
        )

    return Response(
        {
            "success": True,
            "partial": False,
            "booking_ids": [booking.id for booking in created],
        },
        status=status.HTTP_201_CREATED,
    )
