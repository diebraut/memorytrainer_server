from django.contrib import admin

# Register your models here.
# packages/admin.py
from django.contrib import admin
from .models import ExercisePackage

@admin.register(ExercisePackage)
class ExercisePackageAdmin(admin.ModelAdmin):
    list_display = ('packageName', 'treeNode', 'changeDate', 'packageAssignment')
    fieldsets = (
        (None, {
            'fields': ('packageName', 'treeNode', 'packageDescription', 'packageAssignment')
        }),
    )
