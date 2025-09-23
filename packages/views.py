import json
from django.http import JsonResponse
from django.db.models import Count
from .models import TreeNode, ExercisePackage, KnowledgeTree
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils.dateparse import parse_date

@csrf_exempt  # oder CSRF-Header nutzen und diese Zeile entfernen
@require_http_methods(["POST"])
def create_category(request):
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    name = (payload.get("name") or "").strip() or "Neue Kategorie"
    parent_id = payload.get("parent_id")
    created = parse_date(payload.get("created") or "")
    changed = parse_date(payload.get("changed") or "")

    node = TreeNode(text=name)
    if parent_id:
        node.parent_id = int(parent_id)
    if created:
        node.createDate = created
    if changed:
        node.changeDate = changed
    node.save()

    # optionale Counts
    node = (TreeNode.objects
            .filter(pk=node.pk)
            .annotate(children_count=Count('children', distinct=True),
                      pkg_count=Count('exercise_packages', distinct=True))
            ).first()

    return JsonResponse({
        "id": node.id,
        "name": node.text,
        "created": node.createDate.isoformat(),
        "changed": node.changeDate.isoformat(),
        "children_count": node.children_count,
        "pkg_count": node.pkg_count,
    }, status=201)

@csrf_exempt  # wenn du lieber CSRF-Header nutzt, entferne diese Zeile
@require_http_methods(["PATCH", "POST"])
def update_category(request, category_id: int):
    try:
        node = TreeNode.objects.get(pk=category_id)
    except TreeNode.DoesNotExist:
        return JsonResponse({"error": "not found"}, status=404)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    name = payload.get("name")
    if isinstance(name, str) and name.strip():
        node.text = name.strip()

    changed = payload.get("changed")
    if isinstance(changed, str):
        d = parse_date(changed)
        if d:
            node.changeDate = d

    # (optional) created
    created = payload.get("created")
    if isinstance(created, str):
        d = parse_date(created)
        if d:
            node.createDate = d

    node.save()

    # optionale Counts für UI
    node = (TreeNode.objects
            .filter(pk=node.pk)
            .annotate(children_count=Count('children', distinct=True),
                      pkg_count=Count('exercise_packages', distinct=True))
            ).first()

    return JsonResponse({
        "id": node.id,
        "name": node.text,
        "created": node.createDate.isoformat(),
        "changed": node.changeDate.isoformat(),
        "children_count": node.children_count,
        "pkg_count": node.pkg_count,
    })

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
    data = [{
           "id": n.id,
           "name": n.text,
           "children_count": n.children_count,
           "pkg_count": n.pkg_count,
           "created": n.createDate.isoformat(),
           "changed": n.changeDate.isoformat(),
     } for n in roots]
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
    data = [{
            "name": n.text,
            "children_count": n.children_count,
            "id": n.id,
            "pkg_count": n.pkg_count,
            "created": n.createDate.isoformat(),
            "changed": n.changeDate.isoformat(),
    } for n in subs]
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
