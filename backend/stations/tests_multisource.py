from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class MultiSourceStationsAPITestCase(APITestCase):
    @patch(
        "stations.views.get_all_stations",
        return_value=[
            {
                "id": "niti-1",
                "name": "NITI Station",
                "latitude": 28.6139,
                "longitude": 77.2090,
                "address": "Delhi",
                "connectors": ["CCS2"],
                "available": True,
                "source": "NITI",
                "city": "Delhi",
            },
            {
                "id": "ocm-1",
                "name": "OCM Station",
                "latitude": 28.6145,
                "longitude": 77.2095,
                "address": "Delhi",
                "connectors": ["Type 2"],
                "available": True,
                "source": "OCM",
                "city": "Delhi",
            },
        ],
    )
    def test_station_list_includes_source_and_connectors(self, _mock_agg):
        url = reverse("stations:station-list")
        response = self.client.get(url, {"lat": "28.6139", "lng": "77.2090", "radius": "25"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 2)

        # Ensure each external station has required unified fields.
        for station in response.data:
            if station.get("external_id"):
                self.assertIn("source", station)
                self.assertIn(station["source"], ["OCM", "NITI", "LOCAL"])
                self.assertIn("connectors", station)
                self.assertTrue(isinstance(station["connectors"], list))

    def test_invalid_lat_lng_returns_400(self):
        url = reverse("stations:station-list")
        response = self.client.get(url, {"lat": "abc", "lng": "77.2", "radius": "25"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

