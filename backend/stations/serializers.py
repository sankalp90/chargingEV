from rest_framework import serializers

from .models import EVStation


class StationSerializer(serializers.ModelSerializer):
    lat = serializers.DecimalField(source='latitude', max_digits=9, decimal_places=6, read_only=True)
    lng = serializers.DecimalField(source='longitude', max_digits=9, decimal_places=6, read_only=True)

    class Meta:
        model = EVStation
        fields = '__all__'


class LatLngSerializer(serializers.Serializer):
    lat = serializers.FloatField()
    lng = serializers.FloatField()


class RecommendChargingRequestSerializer(serializers.Serializer):
    current_location = LatLngSerializer()
    destination = LatLngSerializer()
    battery_percentage = serializers.FloatField(min_value=0, max_value=100)
    battery_capacity = serializers.FloatField(min_value=1)
    efficiency = serializers.FloatField(min_value=0.01)


class RecommendedStationSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    score = serializers.FloatField()
    distance = serializers.FloatField()
    charging_speed = serializers.FloatField()
    availability = serializers.CharField()
    wait_time = serializers.FloatField()
    detour_time = serializers.FloatField()
    battery_after_reach_pct = serializers.FloatField(required=False)
    cost = serializers.JSONField(required=False, allow_null=True)


class RecommendChargingResponseSerializer(serializers.Serializer):
    recommended_stations = RecommendedStationSerializer(many=True)
    emergency_mode = serializers.BooleanField(default=False)
    reason = serializers.CharField(allow_null=True, required=False)
    route = serializers.JSONField(required=False)
    data_sources = serializers.JSONField(required=False)