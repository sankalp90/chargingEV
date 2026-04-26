from django.urls import path

from .views import SignupView, CustomTokenObtainPairView, google_auth_view, me_view

app_name = 'accounts'

urlpatterns = [
    path('signup/', SignupView.as_view(), name='signup'),
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),
    path('google/', google_auth_view, name='google-auth'),
    path('me/', me_view, name='me'),
]