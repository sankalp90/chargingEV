from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import SignupView, CustomTokenObtainPairView, google_auth_view, me_view

app_name = 'accounts'

urlpatterns = [
    path('signup/', SignupView.as_view(), name='signup'),
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),
    path('refresh/', TokenRefreshView.as_view(), name='refresh'),
    path('google/', google_auth_view, name='google-auth'),
    path('me/', me_view, name='me'),
]