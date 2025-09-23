from django.contrib import admin
from packages.models import TreeNode, ExercisePackage

@admin.register(TreeNode)
class TreeNodeAdmin(admin.ModelAdmin):
    list_display = ("id", "text", "parent")
    search_fields = ("text",)

@admin.register(ExercisePackage)
class ExercisePackageAdmin(admin.ModelAdmin):
    list_display = ("id", "packageName", "createDate", "changeDate", "treeNode")
    search_fields = ("packageName",)
