from django.db import models


class EVStation(models.Model):
    name = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    total_slots = models.IntegerField()
    available_slots = models.IntegerField()
    charger_types = models.JSONField()
    price_per_unit = models.DecimalField(max_digits=6, decimal_places=2)
