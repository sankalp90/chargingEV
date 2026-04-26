from rest_framework import serializers

from .models import EVStation


class StationSerializer(serializers.ModelSerializer):
    lat = serializers.DecimalField(source='latitude', max_digits=9, decimal_places=6, read_only=True)
    lng = serializers.DecimalField(source='longitude', max_digits=9, decimal_places=6, read_only=True)

    class Meta:
        model = EVStation
        fields = '__all__'