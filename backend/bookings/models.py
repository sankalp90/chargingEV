from django.db import models


class Booking(models.Model):
    STATUS_CHOICES = [
        ('Confirmed', 'Confirmed'),
        ('Upcoming', 'Upcoming'),
        ('Completed', 'Completed'),
        ('Cancelled', 'Cancelled'),
    ]

    SOURCE_CHOICES = [
        ("OCM", "OCM"),
        ("NITI", "NITI"),
        ("LOCAL", "LOCAL"),
    ]

    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE)
    station = models.ForeignKey('stations.EVStation', on_delete=models.CASCADE)
    station_external_id = models.CharField(max_length=100, blank=True, default="")
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="LOCAL")
    date = models.DateField()
    slot = models.CharField(max_length=50)
    charger_type = models.CharField(max_length=50)
    energy_needed = models.DecimalField(max_digits=5, decimal_places=2)
    vehicle_number = models.CharField(max_length=50)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Confirmed')
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
