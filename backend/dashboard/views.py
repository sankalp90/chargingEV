from django.db.models import Avg
from rest_framework.decorators import api_view
from rest_framework.response import Response

from bookings.models import Booking
from stations.models import EVStation
from stations.serializers import StationSerializer


@api_view(['GET'])
def dashboard_view(request):
    stats = [
        {
            "label": "Stations Across MP",
            "value": EVStation.objects.count(),
            "change": "Bhopal • Indore • Ujjain"
        },
        {
            "label": "Active Bookings",
            "value": Booking.objects.filter(status__in=['Confirmed', 'Upcoming']).count(),
            "change": "Live plan"
        },
        {
            "label": "Fast Chargers Ready",
            "value": EVStation.objects.filter(available_slots__gt=0).count(),
            "change": "Route-first"
        },
        {
            "label": "Average Session Cost",
            "value": f"₹{Booking.objects.aggregate(avg=Avg('amount'))['avg'] or 0:.0f}",
            "change": "Smart spend"
        }
    ]

    recentActivity = [
        {
            "id": "ac-1",
            "title": "Booking confirmed at Station",
            "description": "Fast slot locked for charging.",
            "time": "2 hours ago",
            "type": "booking"
        },
        {
            "id": "ac-2",
            "title": "Route recommendation refreshed",
            "description": "Better station ranked higher for your trip.",
            "time": "4 hours ago",
            "type": "recommendation"
        }
    ]

    cityBands = list(EVStation.objects.values_list('city', flat=True).distinct())

    recommendations = StationSerializer(EVStation.objects.all()[:3], many=True).data

    return Response({
        'stats': stats,
        'recentActivity': recentActivity,
        'cityBands': cityBands,
        'recommendations': recommendations
    })


@api_view(['GET'])
def recommendations_view(request):
    lat = float(request.query_params.get('lat', 0))
    lng = float(request.query_params.get('lng', 0))
    energy_needed = float(request.query_params.get('energyNeeded', 24))

    stations = list(EVStation.objects.all())
    # Simple distance sort (euclidean approximation)
    stations.sort(key=lambda s: (float(s.latitude) - lat)**2 + (float(s.longitude) - lng)**2)

    serializer = StationSerializer(stations[:4], many=True)
    return Response(serializer.data)
