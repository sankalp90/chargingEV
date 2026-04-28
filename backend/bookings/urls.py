from django.urls import path

from .views import BookingListCreateView, BookingCancelView, bulk_booking_create

app_name = 'bookings'

urlpatterns = [
    path('', BookingListCreateView.as_view(), name='booking-list-create'),
    path('bulk/', bulk_booking_create, name='booking-bulk-create'),
    path('<int:pk>/cancel/', BookingCancelView.as_view(), name='booking-cancel'),
]