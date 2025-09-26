from django.urls import path
from . import views

app_name = "packages_api"

# packages/urls.py
urlpatterns = [
    path('categories/', views.categories, name='categories'),
    path('get_subcategories/<int:category_id>/', views.get_subcategories, name='get_subcategories'),
    path('get_details/<int:category_id>/<int:subcategory_id>/', views.get_details, name='get_details'),
    path('package/<int:package_id>/', views.package_detail, name='package_detail'),  # GET|PATCH|DELETE # GET/PATCH
    path('package/', views.create_package, name='create_package'),  # POST               # POST (neu)
    path('category/', views.create_category, name='create_category'),
    path('category/<int:category_id>/', views.update_category, name='update_category'),
]
