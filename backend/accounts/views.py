from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen
import json

from .serializers import SignupSerializer, UserSerializer, CustomTokenObtainPairSerializer

User = get_user_model()


def _fetch_google_userinfo(access_token):
    params = urlencode({'access_token': access_token})
    endpoint = f'https://www.googleapis.com/oauth2/v3/userinfo?{params}'
    with urlopen(endpoint, timeout=10) as response:
        payload = response.read()
    return json.loads(payload.decode('utf-8'))


class SignupView(APIView):
    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'token': str(refresh.access_token),
                'user': UserSerializer(user).data
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


@api_view(['POST'])
def google_auth_view(request):
    access_token = request.data.get('access_token')
    if not access_token:
        return Response({'detail': 'Google access token is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        google_user = _fetch_google_userinfo(access_token)
    except (HTTPError, URLError, TimeoutError, ValueError):
        return Response({'detail': 'Unable to validate Google login.'}, status=status.HTTP_400_BAD_REQUEST)

    email = (google_user.get('email') or '').strip().lower()
    if not email:
        return Response({'detail': 'Google account email is unavailable.'}, status=status.HTTP_400_BAD_REQUEST)
    if google_user.get('email_verified') is not True:
        return Response({'detail': 'Google email must be verified.'}, status=status.HTTP_400_BAD_REQUEST)

    user, _ = User.objects.get_or_create(
        email=email,
        defaults={
            'name': (google_user.get('name') or email.split('@')[0]).strip() or 'Google User',
        },
    )

    refresh = RefreshToken.for_user(user)
    return Response(
        {
            'token': str(refresh.access_token),
            'user': UserSerializer(user).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def me_view(request):
    if request.method == 'GET':
        serializer = UserSerializer(request.user)
        return Response(serializer.data)
    elif request.method == 'PATCH':
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
