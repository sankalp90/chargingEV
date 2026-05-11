from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from accounts.models import User
from bookings.models import Booking
from .models import EVStation


class StationAPITestCase(APITestCase):
    def setUp(self):
        self.aggregator_patcher = patch("stations.views.get_all_stations", return_value=[])
        self.aggregator_patcher.start()
        self.station1 = EVStation.objects.create(
            name='Noida FastCharge Hub',
            city='Noida',
            latitude='28.535500',
            longitude='77.391000',
            total_slots=8,
            available_slots=5,
            charger_types=['CCS2', 'Type 2'],
            price_per_unit='18.50',
        )
        self.station2 = EVStation.objects.create(
            name='Delhi Central Charge',
            city='Delhi',
            latitude='28.613900',
            longitude='77.209000',
            total_slots=10,
            available_slots=0,
            charger_types=['CCS2'],
            price_per_unit='20.00',
        )
        self.station3 = EVStation.objects.create(
            name='Noida Mall Charging Point',
            city='Noida',
            latitude='28.570000',
            longitude='77.320000',
            total_slots=6,
            available_slots=2,
            charger_types=['Type 2'],
            price_per_unit='16.00',
        )
        self.user = User.objects.create_user(
            email="bulk@example.com",
            password="testpass123",
            name="Bulk User",
        )

    def tearDown(self):
        self.aggregator_patcher.stop()

    def test_get_all_stations(self):
        url = reverse('stations:station-list')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)
        self.assertIn('lat', response.data[0])
        self.assertIn('lng', response.data[0])
        self.assertIn('latitude', response.data[0])
        self.assertIn('longitude', response.data[0])

    def test_filter_stations_by_city(self):
        url = reverse('stations:station-list')
        response = self.client.get(url, {'city': 'Noida'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        for station in response.data:
            self.assertEqual(station['city'], 'Noida')

    def test_filter_stations_by_availability(self):
        url = reverse('stations:station-list')

        available_response = self.client.get(url, {'availability': 'Available'})
        self.assertEqual(available_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(available_response.data), 2)
        for station in available_response.data:
            self.assertGreater(station['available_slots'], 0)

        busy_response = self.client.get(url, {'availability': 'Busy'})
        self.assertEqual(busy_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(busy_response.data), 1)
        self.assertEqual(busy_response.data[0]['id'], self.station2.id)
        self.assertEqual(busy_response.data[0]['available_slots'], 0)

    def test_search_stations(self):
        url = reverse('stations:station-list')

        search_by_name = self.client.get(url, {'search': 'fastcharge'})
        self.assertEqual(search_by_name.status_code, status.HTTP_200_OK)
        self.assertEqual(len(search_by_name.data), 1)
        self.assertEqual(search_by_name.data[0]['id'], self.station1.id)

        search_by_city = self.client.get(url, {'search': 'delhi'})
        self.assertEqual(search_by_city.status_code, status.HTTP_200_OK)
        self.assertEqual(len(search_by_city.data), 1)
        self.assertEqual(search_by_city.data[0]['id'], self.station2.id)

    def test_get_station_details(self):
        url = reverse('stations:station-detail', kwargs={'pk': self.station1.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.station1.id)
        self.assertEqual(response.data['name'], self.station1.name)
        self.assertIn('lat', response.data)
        self.assertIn('lng', response.data)

    def test_get_available_slots(self):
        url = reverse('stations:available-slots', kwargs={'station_id': self.station1.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(isinstance(response.data, list))
        self.assertGreater(len(response.data), 0)
        first_slot = response.data[0]
        self.assertIn('id', first_slot)
        self.assertIn('label', first_slot)
        self.assertIn('available', first_slot)

    def test_no_stations_returns_empty_list(self):
        EVStation.objects.all().delete()
        url = reverse('stations:station-list')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_invalid_station_id_returns_404_for_details(self):
        url = reverse('stations:station-detail', kwargs={'pk': 999999})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_station_id_returns_404_for_available_slots(self):
        url = reverse('stations:available-slots', kwargs={'station_id': 999999})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_stations_along_route_returns_deduplicated_matches(self):
        url = reverse('stations:stations-along-route')
        payload = {
            "route_coordinates": [
                [28.530000, 77.390000],
                [28.620000, 77.200000],
                [28.540000, 77.390000],
            ],
            "radius": 8,
        }

        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 2)

        station_ids = [item["station_id"] for item in response.data]
        self.assertEqual(len(station_ids), len(set(station_ids)))
        self.assertIn(self.station1.id, station_ids)
        self.assertIn(self.station2.id, station_ids)

        first_item = response.data[0]
        self.assertIn("name", first_item)
        self.assertIn("location", first_item)
        self.assertIn("distance_from_route", first_item)

    def test_stations_along_route_rejects_invalid_payload(self):
        url = reverse('stations:stations-along-route')
        payload = {
            "route_coordinates": [[28.53, 77.39]],
            "radius": 5,
        }

        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stations_along_route_includes_external_provider_candidates(self):
        self.aggregator_patcher.stop()
        with patch(
            "stations.views.get_all_stations",
            return_value=[
                {
                    "id": "ext-1",
                    "name": "External Route Station",
                    "city": "Noida",
                    "latitude": 28.56,
                    "longitude": 77.30,
                    "connectors": ["CCS2"],
                    "available": True,
                }
            ],
        ):
            url = reverse('stations:stations-along-route')
            payload = {
                "route_coordinates": [
                    [28.530000, 77.390000],
                    [28.620000, 77.200000],
                ],
                "radius": 8,
            }
            response = self.client.post(url, payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            names = {item["name"] for item in response.data}
            self.assertIn("External Route Station", names)
        self.aggregator_patcher.start()

    def test_bulk_availability_returns_slots_for_each_station(self):
        Booking.objects.create(
            user=self.user,
            station=self.station1,
            station_external_id=str(self.station1.id),
            source="LOCAL",
            date="2026-04-29",
            slot="09:00 - 10:00",
            charger_type="CCS2",
            energy_needed="12.00",
            vehicle_number="MP09AB1234",
            notes="",
            amount="250.00",
            status="Confirmed",
        )

        url = reverse('stations:stations-bulk-availability')
        payload = {
            "station_ids": [self.station1.id, self.station2.id, 999999],
            "estimated_arrival_times": [
                "2026-04-29T09:15:00",
                "2026-04-29T09:15:00",
                "2026-04-29T09:15:00",
            ],
            "window_minutes": 60,
        }
        response = self.client.post(url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)

        station1_data = next(item for item in response.data if item["station_id"] == self.station1.id)
        station1_slot_labels = {slot["label"] for slot in station1_data["available_slots"]}
        self.assertNotIn("09:00 - 10:00", station1_slot_labels)

        station2_data = next(item for item in response.data if item["station_id"] == self.station2.id)
        self.assertGreater(len(station2_data["available_slots"]), 0)

        missing_station = next(item for item in response.data if item["station_id"] == 999999)
        self.assertEqual(missing_station["available_slots"], [])

    def test_bulk_availability_rejects_bad_payload(self):
        url = reverse('stations:stations-bulk-availability')
        response = self.client.post(
            url,
            {"station_ids": [self.station1.id], "estimated_arrival_times": []},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
