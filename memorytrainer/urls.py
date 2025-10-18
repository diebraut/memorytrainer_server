from django.contrib import admin
from django.urls import path, include
from accounts.views import login_register, activate

urlpatterns = [
    path("admin/", admin.site.urls),
    path("login/", login_register, name="login_register"),          # dein eigener Login/Reg
    path("activate/<uidb64>/<token>/", activate, name="activate"),
    path("", include(("landing.urls", "landing"), namespace="landing")),
    path("api/", include(("packages.urls", "packages_api"), namespace="packages_api")),
    path("accounts/", include("django.contrib.auth.urls")),  # WICHTIG: drin lassen
]