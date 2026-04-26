from django.test import TestCase
from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
from datetime import date, timedelta

from accounts.models import User
from stations.models import EVStation


class AuthAPITestCase(APITestCase):
    def setUp(self):
        # Create test user
        self.user_data = {
            'name': 'Test User',
            'email': 'test@example.com',
            'phone': '+91 98765 43210',
            'city': 'Bhopal',
            'vehicleModel': 'Tata Nexon EV',
            'vehicleNumber': 'MP04EV2026',
            'password': 'testpass123'
        }
        self.user = User.objects.create_user(**self.user_data)

        # URLs
        self.signup_url = reverse('accounts:signup')
        self.login_url = reverse('accounts:login')
        self.me_url = reverse('accounts:me')

    def test_signup_valid_data(self):
        """Test successful user registration"""
        data = {
            'name': 'New User',
            'email': 'newuser@example.com',
            'phone': '+91 98765 43211',
            'city': 'Indore',
            'vehicleModel': 'Mahindra e2o',
            'vehicleNumber': 'MP01EV1234',
            'password': 'newpass123'
        }

        response = self.client.post(self.signup_url, data, format='json')

        # Expected Response
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', response.data)
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['name'], 'New User')
        self.assertEqual(response.data['user']['email'], 'newuser@example.com')
        self.assertEqual(response.data['user']['city'], 'Indore')
        self.assertEqual(response.data['user']['vehicleModel'], 'Mahindra e2o')
        self.assertEqual(response.data['user']['vehicleNumber'], 'MP01EV1234')

        # Verify user created
        self.assertTrue(User.objects.filter(email='newuser@example.com').exists())

    def test_signup_existing_email(self):
        """Test signup with email that already exists"""
        data = {
            'name': 'Another User',
            'email': 'test@example.com',  # Existing email
            'phone': '+91 98765 43212',
            'city': 'Ujjain',
            'vehicleModel': 'Tata Tigor EV',
            'vehicleNumber': 'MP02EV5678',
            'password': 'anotherpass123'
        }

        response = self.client.post(self.signup_url, data, format='json')

        # Expected Response
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)
        self.assertEqual(str(response.data['email'][0]), 'An account with this email already exists.')

        # Verify no duplicate user created
        self.assertEqual(User.objects.filter(email='test@example.com').count(), 1)

    def test_login_correct_credentials(self):
        """Test successful login with correct email and password"""
        data = {
            'email': 'test@example.com',
            'password': 'testpass123'
        }

        response = self.client.post(self.login_url, data, format='json')

        # Expected Response
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['name'], 'Test User')
        self.assertEqual(response.data['user']['email'], 'test@example.com')
        self.assertEqual(response.data['user']['city'], 'Bhopal')
        self.assertEqual(response.data['user']['vehicleModel'], 'Tata Nexon EV')
        self.assertEqual(response.data['user']['vehicleNumber'], 'MP04EV2026')

        # Verify token is valid
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['token']}")
        me_response = self.client.get(self.me_url)
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)

    def test_login_wrong_password(self):
        """Test login with incorrect password"""
        data = {
            'email': 'test@example.com',
            'password': 'wrongpassword'
        }

        response = self.client.post(self.login_url, data, format='json')

        # Expected Response
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('detail', response.data)
        self.assertEqual(response.data['detail'], 'No active account found with the given credentials')

        # Verify no token returned
        self.assertNotIn('token', response.data)
        self.assertNotIn('user', response.data)

    def test_access_me_without_token(self):
        """Test accessing profile endpoint without authentication"""
        response = self.client.get(self.me_url)

        # Expected Response
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('detail', response.data)
        self.assertEqual(response.data['detail'], 'Authentication credentials were not provided.')

        # Verify no user data returned
        self.assertNotIn('id', response.data)
        self.assertNotIn('name', response.data)
        self.assertNotIn('email', response.data)

    def test_access_me_with_valid_token(self):
        """Test accessing profile endpoint with valid JWT token"""
        # First login to get token
        login_data = {
            'email': 'test@example.com',
            'password': 'testpass123'
        }
        login_response = self.client.post(self.login_url, login_data, format='json')
        token = login_response.data['token']

        # Now access /me with token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get(self.me_url)

        # Expected Response
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.user.id)
        self.assertEqual(response.data['name'], 'Test User')
        self.assertEqual(response.data['email'], 'test@example.com')
        self.assertEqual(response.data['phone'], '+91 98765 43210')
        self.assertEqual(response.data['city'], 'Bhopal')
        self.assertEqual(response.data['vehicleModel'], 'Tata Nexon EV')
        self.assertEqual(response.data['vehicleNumber'], 'MP04EV2026')

    def test_update_profile(self):
        """Test updating user profile with valid token"""
        # First login to get token
        login_data = {
            'email': 'test@example.com',
            'password': 'testpass123'
        }
        login_response = self.client.post(self.login_url, login_data, format='json')
        token = login_response.data['token']

        # Update profile data
        update_data = {
            'name': 'Updated Test User',
            'city': 'Indore',
            'vehicleModel': 'Updated Model'
        }

        # Access /me with PATCH
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.patch(self.me_url, update_data, format='json')

        # Expected Response
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.user.id)
        self.assertEqual(response.data['name'], 'Updated Test User')
        self.assertEqual(response.data['email'], 'test@example.com')  # Unchanged
        self.assertEqual(response.data['city'], 'Indore')
        self.assertEqual(response.data['vehicleModel'], 'Updated Model')
        self.assertEqual(response.data['vehicleNumber'], 'MP04EV2026')  # Unchanged

        # Verify database updated
        self.user.refresh_from_db()
        self.assertEqual(self.user.name, 'Updated Test User')
        self.assertEqual(self.user.city, 'Indore')
        self.assertEqual(self.user.vehicleModel, 'Updated Model')


class UserLifecycleAPITestCase(APITestCase):
    def setUp(self):
        self.station = EVStation.objects.create(
            name='Lifecycle Charge Hub',
            city='Noida',
            latitude='28.535500',
            longitude='77.391000',
            total_slots=6,
            available_slots=3,
            charger_types=['CCS2', 'Type 2'],
            price_per_unit='18.50',
        )
        self.signup_url = reverse('accounts:signup')
        self.login_url = reverse('accounts:login')
        self.stations_url = reverse('stations:station-list')
        self.booking_url = reverse('bookings:booking-list-create')
        self.dashboard_url = reverse('dashboard:dashboard')
        self.recommendations_url = '/api/recommendations/'

    def test_complete_user_lifecycle(self):
        # Step 1: User signup
        signup_payload = {
            'name': 'Lifecycle User',
            'email': 'lifecycle@example.com',
            'phone': '+91 99887 77665',
            'city': 'Noida',
            'vehicleModel': 'Tata Nexon EV',
            'vehicleNumber': 'UP16EV9090',
            'password': 'lifecycle123',
        }
        signup_response = self.client.post(self.signup_url, signup_payload, format='json')
        self.assertEqual(signup_response.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', signup_response.data)
        self.assertIn('user', signup_response.data)
        self.assertEqual(signup_response.data['user']['email'], signup_payload['email'])

        # Step 2: User login (get token)
        login_payload = {'email': signup_payload['email'], 'password': signup_payload['password']}
        login_response = self.client.post(self.login_url, login_payload, format='json')
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        self.assertIn('token', login_response.data)
        token = login_response.data['token']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        # Step 3: Fetch stations
        stations_response = self.client.get(self.stations_url)
        self.assertEqual(stations_response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(stations_response.data), 1)
        station_id = self.station.id

        # Step 4: View station details
        station_detail_url = reverse('stations:station-detail', kwargs={'pk': station_id})
        station_detail_response = self.client.get(station_detail_url)
        self.assertEqual(station_detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(station_detail_response.data['id'], station_id)
        initial_available_slots = station_detail_response.data['available_slots']

        # Step 5: Check available slots
        available_slots_url = reverse('stations:available-slots', kwargs={'station_id': station_id})
        available_slots_response = self.client.get(available_slots_url)
        self.assertEqual(available_slots_response.status_code, status.HTTP_200_OK)
        self.assertTrue(isinstance(available_slots_response.data, list))
        self.assertGreater(len(available_slots_response.data), 0)

        # Step 6: Create booking
        booking_payload = {
            'station': station_id,
            'date': (date.today() + timedelta(days=1)).isoformat(),
            'slot': '10:00 - 11:00',
            'charger_type': 'CCS2',
            'energy_needed': '10.00',
            'vehicle_number': signup_payload['vehicleNumber'],
            'notes': 'Lifecycle test booking',
        }
        booking_create_response = self.client.post(self.booking_url, booking_payload, format='json')
        self.assertEqual(booking_create_response.status_code, status.HTTP_201_CREATED)
        self.assertIn('id', booking_create_response.data)
        self.assertIn('stationName', booking_create_response.data)
        self.assertIn('status', booking_create_response.data)
        self.assertIn('amount', booking_create_response.data)
        booking_id = booking_create_response.data['id']

        # Step 7: Verify booking appears in user bookings
        bookings_response = self.client.get(self.booking_url)
        self.assertEqual(bookings_response.status_code, status.HTTP_200_OK)
        booking_ids = [item['id'] for item in bookings_response.data]
        self.assertIn(booking_id, booking_ids)

        # Step 8: Check slot count reduced
        reduced_station_detail_response = self.client.get(station_detail_url)
        self.assertEqual(reduced_station_detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(reduced_station_detail_response.data['available_slots'], initial_available_slots - 1)

        # Step 9: Cancel booking
        cancel_url = reverse('bookings:booking-cancel', kwargs={'pk': booking_id})
        cancel_response = self.client.patch(cancel_url, {}, format='json')
        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_response.data['status'], 'Cancelled')

        # Step 10: Verify slot count restored
        restored_station_detail_response = self.client.get(station_detail_url)
        self.assertEqual(restored_station_detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(restored_station_detail_response.data['available_slots'], initial_available_slots)

        # Step 11: Fetch dashboard
        dashboard_response = self.client.get(self.dashboard_url)
        self.assertEqual(dashboard_response.status_code, status.HTTP_200_OK)
        self.assertIn('stats', dashboard_response.data)
        self.assertIn('recentActivity', dashboard_response.data)
        self.assertIn('cityBands', dashboard_response.data)
        self.assertIn('recommendations', dashboard_response.data)

        # Step 12: Get recommendations
        recommendations_response = self.client.get(
            self.recommendations_url,
            {'lat': '28.53', 'lng': '77.39', 'energyNeeded': '10'},
        )
        self.assertEqual(recommendations_response.status_code, status.HTTP_200_OK)
        self.assertTrue(isinstance(recommendations_response.data, list))
        if recommendations_response.data:
            first = recommendations_response.data[0]
            self.assertIn('id', first)
            self.assertIn('name', first)
            self.assertIn('lat', first)
            self.assertIn('lng', first)
