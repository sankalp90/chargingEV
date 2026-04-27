from django.urls import path

from .views import RecommendChargingView, StationListView, StationDetailView, available_slots, import_station

app_name = 'stations'

urlpatterns = [
    path('', StationListView.as_view(), name='station-list'),
    path('recommend-charging/', RecommendChargingView.as_view(), name='recommend-charging'),
    path('<int:pk>/', StationDetailView.as_view(), name='station-detail'),
    path('<int:station_id>/available-slots/', available_slots, name='available-slots'),
    path('import/', import_station, name='station-import'),
]