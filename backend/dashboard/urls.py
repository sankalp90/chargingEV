from django.urls import path

from .views import dashboard_view, recommendations_view

app_name = 'dashboard'

urlpatterns = [
    path('', dashboard_view, name='dashboard'),
    path('recommendations/', recommendations_view, name='recommendations'),
]