from datetime import date, timedelta

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from bookings.models import Booking
from stations.models import EVStation


class DashboardRecommendationsAPITestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='dash@example.com',
            password='testpass123',
            name='Dashboard User',
        )
        self.station1 = EVStation.objects.create(
            name='Bhopal SuperCharge',
            city='Bhopal',
            latitude='23.259900',
            longitude='77.412600',
            total_slots=8,
            available_slots=3,
            charger_types=['CCS2', 'Type 2'],
            price_per_unit='19.00',
        )
        self.station2 = EVStation.objects.create(
            name='Indore Central EV',
            city='Indore',
            latitude='22.719600',
            longitude='75.857700',
            total_slots=6,
            available_slots=0,
            charger_types=['CCS2'],
            price_per_unit='21.00',
        )
        self.station3 = EVStation.objects.create(
            name='Ujjain Green Hub',
            city='Ujjain',
            latitude='23.176500',
            longitude='75.788500',
            total_slots=4,
            available_slots=2,
            charger_types=['Type 2'],
            price_per_unit='17.00',
        )
        self.dashboard_url = reverse('dashboard:dashboard')
        self.recommendations_url = '/api/recommendations/'
        self.tomorrow = date.today() + timedelta(days=1)

    def test_dashboard_structure_with_empty_bookings(self):
        response = self.client.get(self.dashboard_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('stats', response.data)
        self.assertIn('recentActivity', response.data)
        self.assertIn('cityBands', response.data)
        self.assertIn('recommendations', response.data)
        self.assertEqual(len(response.data['stats']), 4)
        self.assertEqual(response.data['stats'][1]['value'], 0)
        self.assertEqual(response.data['stats'][3]['value'], '₹0')

    def test_dashboard_with_multiple_bookings_updates_stats(self):
        Booking.objects.create(
            user=self.user,
            station=self.station1,
            date=self.tomorrow,
            slot='10:00 - 11:00',
            charger_type='CCS2',
            energy_needed='10.00',
            vehicle_number='MP04EV1111',
            notes='',
            status='Confirmed',
            amount='190.00',
        )
        Booking.objects.create(
            user=self.user,
            station=self.station2,
            date=self.tomorrow,
            slot='11:00 - 12:00',
            charger_type='CCS2',
            energy_needed='8.00',
            vehicle_number='MP04EV1111',
            notes='',
            status='Upcoming',
            amount='168.00',
        )
        Booking.objects.create(
            user=self.user,
            station=self.station3,
            date=self.tomorrow,
            slot='12:00 - 01:00',
            charger_type='Type 2',
            energy_needed='6.00',
            vehicle_number='MP04EV1111',
            notes='',
            status='Completed',
            amount='102.00',
        )

        response = self.client.get(self.dashboard_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['stats'][1]['value'], 2)
        self.assertEqual(response.data['stats'][3]['value'], '₹153')

    def test_recommendations_structure_with_empty_data(self):
        EVStation.objects.all().delete()
        response = self.client.get(self.recommendations_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_recommendations_with_multiple_stations(self):
        response = self.client.get(self.recommendations_url, {'lat': '23.20', 'lng': '77.40', 'energyNeeded': '20'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
        self.assertLessEqual(len(response.data), 4)

        station = response.data[0]
        self.assertIn('id', station)
        self.assertIn('name', station)
        self.assertIn('city', station)
        self.assertIn('lat', station)
        self.assertIn('lng', station)
