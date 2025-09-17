from django.urls import path
from . import views

app_name = "packages_api"

urlpatterns = [
    path("categories/", views.categories, name="categories"),
    path("get_subcategories/<int:category_id>/", views.get_subcategories, name="get_subcategories"),
    path("get_details/<int:category_id>/<int:subcategory_id>/", views.get_details, name="get_details"),
    path("package/<int:package_id>/", views.get_package_details, name="get_package_details"),
]
