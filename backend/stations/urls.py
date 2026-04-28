from django.urls import path

from .views import (
    StationListView,
    StationDetailView,
    available_slots,
    import_station,
    stations_along_route,
    bulk_station_availability,
)

app_name = 'stations'

urlpatterns = [
    path('', StationListView.as_view(), name='station-list'),
    path('along-route/', stations_along_route, name='stations-along-route'),
    path('bulk-availability/', bulk_station_availability, name='stations-bulk-availability'),
    path('<int:pk>/', StationDetailView.as_view(), name='station-detail'),
    path('<int:station_id>/available-slots/', available_slots, name='available-slots'),
    path('import/', import_station, name='station-import'),
]