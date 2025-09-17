from django.http import JsonResponse
from django.db.models import Count
from .models import TreeNode, ExercisePackage, KnowledgeTree

def categories(request):
    """Root-Kategorien (TreeNode ohne parent) + grobe Counts."""
    try:
        KnowledgeTree()  # seed einmalig, falls DB leer ist
    except Exception:
        pass

    roots = (
        TreeNode.objects
        .filter(parent__isnull=True)
        .annotate(
            children_count=Count('children', distinct=True),
            pkg_count=Count('exercise_packages', distinct=True),
        )
        .order_by('text')
    )
    data = [
        {
            "id": n.id,
            "name": n.text,
            "children_count": n.children_count,
            "pkg_count": n.pkg_count,
        }
        for n in roots
    ]
    return JsonResponse(data, safe=False)


def get_subcategories(request, category_id: int):
    subs = (
        TreeNode.objects
        .filter(parent_id=category_id)
        .annotate(
            children_count=Count('children', distinct=True),
            pkg_count=Count('exercise_packages', distinct=True),
        )
        .order_by('text')
    )
    data = [
        {
            "id": n.id,
            "name": n.text,
            "children_count": n.children_count,
            "pkg_count": n.pkg_count,
        }
        for n in subs
    ]
    return JsonResponse(data, safe=False)


def get_details(request, category_id: int, subcategory_id: int):
    # category_id ist nur für die URL – genutzt wird subcategory_id
    pkgs = (
        ExercisePackage.objects
        .filter(treeNode_id=subcategory_id)
        .order_by('packageName')
        .values('id', 'packageName', 'packageDescription', 'createDate', 'changeDate')
    )
    items = [
        {
            "id": p["id"],
            "title": p["packageName"],
            "desc": p["packageDescription"],
            "created": str(p["createDate"]),
            "changed": str(p["changeDate"]),
        }
        for p in pkgs
    ]
    return JsonResponse({"items": items})


def get_package_details(request, package_id: int):
    try:
        pkg = ExercisePackage.objects.select_related('treeNode').get(id=package_id)
    except ExercisePackage.DoesNotExist:
        return JsonResponse({"error": "not found"}, status=404)

    data = {
        "id": pkg.id,
        "title": pkg.packageName,
        "desc": pkg.packageDescription,
        "node": {"id": pkg.treeNode_id, "name": pkg.treeNode.text if pkg.treeNode_id else None},
        "created": pkg.createDate.isoformat(),
        "changed": pkg.changeDate.isoformat(),
    }
    return JsonResponse(data)
