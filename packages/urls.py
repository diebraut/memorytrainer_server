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
    path('uploads/', views.list_uploads, name='uploads'),  # NEU
    path('package/<int:package_id>/assign/', views.package_assign, name='assign_package_file'),
    path('package/<int:package_id>/unassign/', views.package_unassign, name='unassign_package_file'),
    path('package/<int:package_id>/uploads/', views.package_uploads_for_pkg, name='package_uploads_for_pkg'),

]
