from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from .models import Booking


class BookingSerializer(serializers.ModelSerializer):
    stationName = serializers.CharField(source='station.name', read_only=True)

    class Meta:
        model = Booking
        fields = ['id', 'stationName', 'station_external_id', 'source', 'date', 'slot', 'charger_type', 'energy_needed', 'vehicle_number', 'notes', 'status', 'amount']
        read_only_fields = ['id', 'status', 'amount']


class BookingCreateSerializer(serializers.ModelSerializer):
    station_external_id = serializers.CharField(required=False, allow_blank=True)
    source = serializers.ChoiceField(choices=Booking.SOURCE_CHOICES, required=False, default="LOCAL")

    class Meta:
        model = Booking
        fields = ['station', 'station_external_id', 'source', 'date', 'slot', 'charger_type', 'energy_needed', 'vehicle_number', 'notes']

    def create(self, validated_data):
        station = validated_data['station']
        amount = validated_data['energy_needed'] * station.price_per_unit
        if not validated_data.get("station_external_id"):
            validated_data["station_external_id"] = str(station.id)
        if not validated_data.get("source"):
            validated_data["source"] = "LOCAL"
        return Booking.objects.create(amount=amount, **validated_data)

    def validate(self, attrs):
        station = attrs.get("station")
        station_id = (attrs.get("station_external_id") or "").strip()
        source = attrs.get("source") or "LOCAL"

        # Backward-compatible: frontend sends `station` always; station_id/source can be filled in.
        if not station and not station_id:
            raise ValidationError("Either station or station_id is required.")

        if station and not station_id:
            attrs["station_external_id"] = str(station.id)
        if station and source == "LOCAL":
            attrs["source"] = "LOCAL"
        return attrs