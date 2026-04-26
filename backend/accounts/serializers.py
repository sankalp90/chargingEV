from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'phone', 'city', 'vehicleModel', 'vehicleNumber']
        read_only_fields = ['id']


class SignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(
        error_messages={"unique": "An account with this email already exists."}
    )

    class Meta:
        model = User
        fields = ['name', 'email', 'phone', 'city', 'vehicleModel', 'vehicleNumber', 'password']

    def validate_email(self, value):
        email = (value or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['token'] = data.pop('access')
        data.pop('refresh', None)  # Remove refresh if present
        data['user'] = UserSerializer(self.user).data
        return data