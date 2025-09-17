from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("landing.urls", namespace="landing")),
    path("api/", include("packages.urls", namespace="packages_api")),
    path("accounts/", include("django.contrib.auth.urls")),  # Login/Logout/Passwort
]
