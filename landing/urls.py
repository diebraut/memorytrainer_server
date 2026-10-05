from django.urls import path
from . import views

app_name = "landing"

urlpatterns = [
    path("", views.index, name="index"),
    path("pakete/", views.pakete, name="pakete"),
    path("uploaded-packages/", views.uploaded_packages, name="uploaded_packages"),
    path("uploaded-packages/upload/", views.upload_package, name="upload_package"),
    path("uploaded-packages/delete/", views.delete_uploaded_package, name="delete_uploaded_package"),
]
