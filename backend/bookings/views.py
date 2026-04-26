from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Booking
from .serializers import BookingSerializer, BookingCreateSerializer

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
        station = serializer.validated_data['station']
        if station.available_slots <= 0:
            raise ValidationError("No slots available at this station.")
        is_slot_already_booked = Booking.objects.filter(
            station=station,
            date=serializer.validated_data['date'],
            slot=serializer.validated_data['slot'],
        ).exclude(status='Cancelled').exists()
        if is_slot_already_booked:
            raise ValidationError("This slot is already booked for the selected station and date.")
        booking = serializer.save(user=self.request.user)
        station.available_slots -= 1
        station.save()
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
