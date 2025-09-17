from django.urls import path
from . import views

app_name = "landing"

urlpatterns = [
    path("", views.index, name="index"),
    path("pakete/", views.pakete, name="pakete"),
]
