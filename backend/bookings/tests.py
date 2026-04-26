from datetime import date, timedelta

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from stations.models import EVStation

from .models import Booking


class BookingAPITestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='testuser@example.com',
            password='testpass123',
            name='Test User',
        )
        self.other_user = User.objects.create_user(
            email='other@example.com',
            password='testpass123',
            name='Other User',
        )
        self.station = EVStation.objects.create(
            name='Noida FastCharge Hub',
            city='Noida',
            latitude='28.535500',
            longitude='77.391000',
            total_slots=4,
            available_slots=2,
            charger_types=['CCS2', 'Type 2'],
            price_per_unit='18.50',
        )
        self.tomorrow = date.today() + timedelta(days=1)
        self.client.force_authenticate(user=self.user)
        self.list_create_url = reverse('bookings:booking-list-create')

    def booking_payload(self, **overrides):
        payload = {
            'station': self.station.id,
            'date': self.tomorrow.isoformat(),
            'slot': '10:00 - 11:00',
            'charger_type': 'CCS2',
            'energy_needed': '12.00',
            'vehicle_number': 'UP16EV2026',
            'notes': 'Please keep bay 1 ready.',
        }
        payload.update(overrides)
        return payload

    def assert_booking_response_shape(self, data):
        self.assertIn('id', data)
        self.assertIn('stationName', data)
        self.assertIn('status', data)
        self.assertIn('amount', data)

    def test_create_booking_valid(self):
        response = self.client.post(self.list_create_url, self.booking_payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assert_booking_response_shape(response.data)
        self.assertEqual(response.data['stationName'], self.station.name)
        self.assertEqual(response.data['status'], 'Confirmed')
        self.assertEqual(response.data['amount'], '222.00')

        self.station.refresh_from_db()
        self.assertEqual(self.station.available_slots, 1)

    def test_create_booking_when_slots_zero(self):
        self.station.available_slots = 0
        self.station.save(update_fields=['available_slots'])

        response = self.client.post(self.list_create_url, self.booking_payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.station.refresh_from_db()
        self.assertEqual(self.station.available_slots, 0)
        self.assertEqual(Booking.objects.count(), 0)

    def test_create_booking_with_invalid_station(self):
        response = self.client.post(
            self.list_create_url,
            self.booking_payload(station=999999),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Booking.objects.count(), 0)

    def test_get_user_bookings(self):
        booking = Booking.objects.create(
            user=self.user,
            station=self.station,
            date=self.tomorrow,
            slot='10:00 - 11:00',
            charger_type='CCS2',
            energy_needed='5.00',
            vehicle_number='UP16EV2026',
            notes='',
            status='Confirmed',
            amount='92.50',
        )
        Booking.objects.create(
            user=self.other_user,
            station=self.station,
            date=self.tomorrow,
            slot='11:00 - 12:00',
            charger_type='Type 2',
            energy_needed='3.00',
            vehicle_number='DL01EV0001',
            notes='',
            status='Confirmed',
            amount='55.50',
        )

        response = self.client.get(self.list_create_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], booking.id)
        self.assert_booking_response_shape(response.data[0])

    def test_cancel_booking(self):
        booking = Booking.objects.create(
            user=self.user,
            station=self.station,
            date=self.tomorrow,
            slot='10:00 - 11:00',
            charger_type='CCS2',
            energy_needed='5.00',
            vehicle_number='UP16EV2026',
            notes='',
            status='Confirmed',
            amount='92.50',
        )
        self.station.available_slots = 1
        self.station.save(update_fields=['available_slots'])
        cancel_url = reverse('bookings:booking-cancel', kwargs={'pk': booking.id})

        response = self.client.patch(cancel_url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assert_booking_response_shape(response.data)
        self.assertEqual(response.data['status'], 'Cancelled')

        booking.refresh_from_db()
        self.assertEqual(booking.status, 'Cancelled')
        self.station.refresh_from_db()
        self.assertEqual(self.station.available_slots, 2)

    def test_double_booking_same_slot(self):
        first_response = self.client.post(self.list_create_url, self.booking_payload(), format='json')
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)

        second_response = self.client.post(self.list_create_url, self.booking_payload(), format='json')

        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Booking.objects.count(), 1)
        self.station.refresh_from_db()
        self.assertEqual(self.station.available_slots, 1)
