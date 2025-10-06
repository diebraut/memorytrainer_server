# packages/views.py
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Count, F, Max
from django.http import (
    JsonResponse,
    HttpResponseBadRequest,
    HttpResponseNotAllowed,
)
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_GET, require_POST

from .models import TreeNode, ExercisePackage
from .services import PackageFileManager


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
# statt der alten Variante
def _get_pkg_assignment(pkg):
    return pkg.packageAssignment or None


def _normalize_parent_id(value):
    """
    Konvertiert '', None, 'null' -> None; sonst int(value).
    """
    if value in (None, "", "null"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _date_from_payload(value, fallback=None):
    """
    Erwartet ISO-String 'YYYY-MM-DD'. Gibt datetime.date zurück.
    """
    if isinstance(value, str) and value.strip():
        d = parse_date(value.strip())
        if d:
            return d
    return fallback


def _serialize_node(node: TreeNode, with_counts: bool = True):
    data = {
        "id": node.id,
        "name": node.text,
        "created": node.createDate.isoformat() if node.createDate else None,
        "changed": node.changeDate.isoformat() if node.changeDate else None,
        "sort_order": node.sort_order,
    }
    if with_counts:
        data["children_count"] = getattr(node, "children_count", 0) or 0
        data["pkg_count"] = getattr(node, "pkg_count", 0) or 0
    return data


def _duplicate_exists(name: str, parent_id, exclude_id=None) -> bool:
    qs = TreeNode.objects.filter(text__iexact=name)
    if parent_id is None:
        qs = qs.filter(parent__isnull=True)
    else:
        qs = qs.filter(parent_id=parent_id)
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs.exists()


def _list_upload_files():
    """
    Fallback-Helper (nur intern); bevorzugt den Service benutzen.
    """
    d = Path(settings.UPLOADS_DIR)
    d.mkdir(parents=True, exist_ok=True)
    return sorted(p.name for p in d.iterdir() if p.is_file())


# ------------------------------------------------------------
# File-Service (Uploads / Zuordnung)
# ------------------------------------------------------------

_filemgr = PackageFileManager()


@require_GET
def uploads_listing(request):
    """
    GET /api/uploads/
    → Liste der Dateien aus UPLOADS_DIR (Plain-Dateinamen).
    """
    return JsonResponse({"files": _filemgr.list_uploads()})

@require_GET
def list_uploads(request):
    """Liste der Dateien im Upload-Ordner (für /api/uploads/)."""
    return JsonResponse({"files": _filemgr.list_uploads()})

@require_GET
def package_uploads_for_pkg(request, package_id: int):
    """
    GET /api/package/<id>/uploads/
    Aktuell identisch mit /uploads/ (keine Filter pro Paket vorgesehen).
    """
    return JsonResponse({"files": _filemgr.list_uploads()})


@require_POST
def package_assign(request, package_id: int):
    try:
        data = json.loads(request.body or "{}")
        filename = (data.get("filename") or "").strip()
        if not filename:
            return HttpResponseBadRequest("filename required")
        res = _filemgr.assign_to_package(package_id, filename)
        return JsonResponse(res, status=200)
    except ExercisePackage.DoesNotExist:
        return JsonResponse({"error": "package not found"}, status=404)
    except FileNotFoundError:
        return HttpResponseBadRequest("file not found")
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@require_POST
def package_unassign(request, package_id: int):
    try:
        res = _filemgr.unassign_from_package(package_id)
        return JsonResponse(res, status=200)
    except ExercisePackage.DoesNotExist:
        return JsonResponse({"error": "package not found"}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


# ------------------------------------------------------------
# Landing / Template
# ------------------------------------------------------------

def packages_page(request):
    """
    /pakete/ – rendert die Tree-Ansicht; uploads optional im Context.
    """
    ctx = {
        "upload_files": _list_upload_files(),  # optionaler Context
    }
    return render(request, "packages/pakete.html", ctx)


# ------------------------------------------------------------
# Read-Endpunkte für den Baum
# ------------------------------------------------------------

@require_GET
def categories(request):
    """
    Root-Kategorien (parent is null), stabil sortiert nach sort_order.
    """
    roots = (
        TreeNode.objects
        .filter(parent__isnull=True)
        .annotate(
            children_count=Count("children", distinct=True),
            pkg_count=Count("exercise_packages", distinct=True),
        )
        .order_by("sort_order", "id")
    )
    data = [_serialize_node(n, with_counts=True) for n in roots]
    return JsonResponse(data, safe=False)


@require_GET
def get_subcategories(request, category_id: int):
    """
    Unterkategorien einer Kategorie, stabil sortiert nach sort_order.
    """
    subs = (
        TreeNode.objects
        .filter(parent_id=category_id)
        .annotate(
            children_count=Count("children", distinct=True),
            pkg_count=Count("exercise_packages", distinct=True),
        )
        .order_by("sort_order", "id")
    )
    data = [_serialize_node(n, with_counts=True) for n in subs]
    return JsonResponse(data, safe=False)


@require_GET
def get_details(request, category_id: int, subcategory_id: int):
    """
    Pakete unterhalb einer Unterkategorie (TreeNode=subcategory_id),
    sortiert nach sort_order, id.
    """
    node = get_object_or_404(TreeNode, pk=subcategory_id)
    qs = (
        ExercisePackage.objects
        .filter(treeNode=node)
        .order_by("sort_order", "id")
        .values("id", "packageName", "packageDescription",
                "createDate", "changeDate", "sort_order")
    )
    items = [{
        "id": r["id"],
        "title": r["packageName"],
        "desc": r["packageDescription"],
        "created": r["createDate"],
        "changed": r["changeDate"],
        "sort_order": r["sort_order"],
    } for r in qs]
    return JsonResponse({"items": items})


# ------------------------------------------------------------
# Paket-Detail: GET / PATCH / DELETE
# ------------------------------------------------------------

@csrf_exempt
@require_http_methods(["GET", "PATCH", "DELETE"])
def package_detail(request, package_id: int):
    try:
        pkg = ExercisePackage.objects.select_related('treeNode').get(pk=package_id)
    except ExercisePackage.DoesNotExist:
        return JsonResponse({"error": "not found"}, status=404)

    if request.method == "GET":
        return JsonResponse({
            "id": pkg.id,
            "title": pkg.packageName,
            "desc": pkg.packageDescription,
            "created": pkg.createDate.isoformat() if pkg.createDate else None,
            "changed": pkg.changeDate.isoformat() if pkg.changeDate else None,
            "sort_order": pkg.sort_order,
            "assignment": _get_pkg_assignment(pkg),  # <-- NEU
            "node": {"id": pkg.treeNode_id, "name": pkg.treeNode.text if pkg.treeNode_id else None},
        })
    if request.method == "DELETE":
        node_id = pkg.treeNode_id
        hole = pkg.sort_order
        pkg.delete()
        # Sortierlücke schließen
        ExercisePackage.objects.filter(
            treeNode_id=node_id, sort_order__gt=hole
        ).update(sort_order=F("sort_order") - 1)
        return JsonResponse({"ok": True})

    # --- PATCH ---
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    title      = (payload.get("title") or "").strip()
    desc       = payload.get("desc")
    created    = payload.get("created")
    changed    = payload.get("changed")
    node_id    = payload.get("node_id")
    new_order  = payload.get("sort_order", None)
    direction  = payload.get("direction")
    ref_id     = payload.get("ref_pkg_id")

    assignment = payload.get("assignment", None)  # <-- NEU

    with transaction.atomic():
        old_node_id = pkg.treeNode_id
        old_order   = pkg.sort_order

        # Zielknoten bestimmen
        target_node_id = old_node_id
        if node_id is not None:
            try:
                target_node_id = int(node_id)
            except (TypeError, ValueError):
                return JsonResponse({"error": "invalid node_id"}, status=400)
        elif ref_id:
            ref = ExercisePackage.objects.filter(pk=ref_id).only("treeNode_id").first()
            if ref:
                target_node_id = ref.treeNode_id

        # Zielposition berechnen
        def resolve_insert_at(_siblings):
            if ref_id and direction in ("before", "after"):
                for idx, s in enumerate(_siblings):
                    if s.id == ref_id:
                        return idx + (1 if direction == "after" else 0)
            if isinstance(new_order, int):
                return max(0, min(int(new_order), len(_siblings)))
            return len(_siblings)

        # Verschieben zwischen Knoten?
        if target_node_id != old_node_id:
            # Lücke im alten Knoten schließen
            ExercisePackage.objects.filter(
                treeNode_id=old_node_id, sort_order__gt=old_order
            ).update(sort_order=F("sort_order") - 1)

            siblings = list(
                ExercisePackage.objects
                .filter(treeNode_id=target_node_id)
                .order_by("sort_order", "id")
            )
            insert_at = resolve_insert_at(siblings)

            for idx, s in enumerate(siblings):
                new_so = idx if idx < insert_at else idx + 1
                if s.sort_order != new_so:
                    s.sort_order = new_so
            if siblings:
                ExercisePackage.objects.bulk_update(siblings, ["sort_order"])

            pkg.treeNode_id = target_node_id
            pkg.sort_order = insert_at

        else:
            # Re-Ordering innerhalb des Knotens
            if (ref_id and direction in ("before", "after")) or isinstance(new_order, int):
                siblings = list(
                    ExercisePackage.objects
                    .filter(treeNode_id=old_node_id)
                    .order_by("sort_order", "id")
                )
                insert_at = resolve_insert_at([s for s in siblings if s.id != pkg.id])
                if insert_at != old_order:
                    if insert_at < old_order:
                        ExercisePackage.objects.filter(
                            treeNode_id=old_node_id,
                            sort_order__gte=insert_at,
                            sort_order__lt=old_order
                        ).update(sort_order=F("sort_order") + 1)
                    else:
                        ExercisePackage.objects.filter(
                            treeNode_id=old_node_id,
                            sort_order__gt=old_order,
                            sort_order__lte=insert_at
                        ).update(sort_order=F("sort_order") - 1)
                    pkg.sort_order = insert_at

        # Feldupdates
        if title:
            pkg.packageName = title
        if desc is not None:
            pkg.packageDescription = desc

        d_created = _date_from_payload(created) if isinstance(created, str) else None
        if d_created:
            pkg.createDate = d_created

        d_changed = _date_from_payload(changed) if isinstance(changed, str) else None
        if d_changed:
            pkg.changeDate = d_changed

        # Zuordnung speichern/zurücksetzen
        if assignment is not None:
            if isinstance(assignment, str):
                a = assignment.strip()
                pref = f"{pkg.id}_"
                if a.startswith(pref):
                    a = a[len(pref):]  # nur „nackten“ Namen speichern
            else:
                a = None

            pkg.packageAssignment = a or None
        pkg.save()

    return JsonResponse({
        "id": pkg.id,
        "title": pkg.packageName,
        "desc": pkg.packageDescription,
        "created": pkg.createDate.isoformat() if pkg.createDate else None,
        "changed": pkg.changeDate.isoformat() if pkg.changeDate else None,
        "sort_order": pkg.sort_order,
        "assignment": _get_pkg_assignment(pkg),  # <-- NEU
        "node": {"id": pkg.treeNode_id},
    })


# ------------------------------------------------------------
# Paket anlegen (inkl. Position "davor/danach")
# ------------------------------------------------------------

@require_http_methods(["POST"])
@transaction.atomic
def create_package(request):
    """
    POST /api/package/
    Body:
      title, desc?, created?, changed?, node_id (required),
      direction? ('before'|'after'), ref_id?, assignment? (optional).
    """
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return HttpResponseBadRequest("invalid json")

    title     = (payload.get("title") or "").strip()
    desc      = payload.get("desc") or ""
    created   = payload.get("created") or timezone.now().date()
    changed   = payload.get("changed") or timezone.now().date()
    node_id   = payload.get("node_id")
    direction = (payload.get("direction") or "").lower()
    ref_id    = payload.get("ref_id")
    assignment = (payload.get("assignment") or "").strip() or None  # optional

    if not title or not node_id:
        return HttpResponseBadRequest("title and node_id required")

    node = get_object_or_404(TreeNode, pk=node_id)

    # Ziel-Sortierindex
    if direction in ("before", "after") and ref_id:
        ref = get_object_or_404(ExercisePackage, pk=ref_id, treeNode=node)
        target = ref.sort_order if direction == "before" else ref.sort_order + 1
        ExercisePackage.objects.filter(treeNode=node, sort_order__gte=target)\
            .update(sort_order=F("sort_order") + 1)
        sort_order = target
    else:
        max_so = ExercisePackage.objects.filter(treeNode=node).aggregate(m=Max("sort_order"))["m"]
        sort_order = 0 if max_so is None else max_so + 1

    pkg = ExercisePackage.objects.create(
        packageName=title,
        packageDescription=desc,
        createDate=created,
        changeDate=changed,
        sort_order=sort_order,
        treeNode=node,
        packageAssignment=assignment,
    )
    return JsonResponse({
        "id": pkg.id,
        "title": pkg.packageName,
        "desc": pkg.packageDescription,
        "created": pkg.createDate,
        "changed": pkg.changeDate,
        "sort_order": pkg.sort_order,
        "assignment": _get_pkg_assignment(pkg),  # <-- NEU
    }, status=201)


# ------------------------------------------------------------
# Kategorie anlegen / aktualisieren / löschen
# ------------------------------------------------------------

@csrf_exempt
@require_http_methods(["POST"])
def create_category(request):
    """
    POST /api/category/
    Body: name (required), parent_id?, ref_id?, direction? ('before'|'after'),
          created?, changed?
    """
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    name = (payload.get("name") or "").strip()
    parent_id = _normalize_parent_id(payload.get("parent_id"))
    ref_id = payload.get("ref_id", None)
    direction = payload.get("direction", None)  # 'before' | 'after' | None

    if not name:
        return JsonResponse({"error": "name required"}, status=400)

    if _duplicate_exists(name, parent_id, exclude_id=None):
        return JsonResponse({"error": "duplicate_name"}, status=409)

    created = _date_from_payload(payload.get("created"), fallback=date.today())
    changed = _date_from_payload(payload.get("changed"), fallback=date.today())

    with transaction.atomic():
        siblings_qs = TreeNode.objects.filter(parent_id=parent_id).order_by("sort_order", "id")
        siblings = list(siblings_qs)

        insert_at = len(siblings)
        if ref_id and direction in ("before", "after"):
            for idx, n in enumerate(siblings):
                if n.id == ref_id:
                    insert_at = idx + (1 if direction == "after" else 0)
                    break

        for idx, n in enumerate(siblings):
            new_order = idx if idx < insert_at else idx + 1
            if n.sort_order != new_order:
                n.sort_order = new_order
        if siblings:
            TreeNode.objects.bulk_update(siblings, ["sort_order"])

        node = TreeNode.objects.create(
            text=name,
            parent_id=parent_id,
            createDate=created,
            changeDate=changed,
            sort_order=insert_at,
        )

    node = (
        TreeNode.objects
        .filter(pk=node.pk)
        .annotate(
            children_count=Count("children", distinct=True),
            pkg_count=Count("exercise_packages", distinct=True),
        )
    ).first()
    return JsonResponse(_serialize_node(node, with_counts=True), status=201)


@csrf_exempt
@require_http_methods(["PATCH", "DELETE"])
def update_category(request, category_id: int):
    """
    PATCH /api/category/<id>/
      Body: { name?, changed? ('YYYY-MM-DD'), created? ('YYYY-MM-DD') }
      - Prüft Duplikate auf gleicher Ebene (case-insensitive).
    DELETE /api/category/<id>/
    """
    try:
        node = TreeNode.objects.get(pk=category_id)
    except TreeNode.DoesNotExist:
        return JsonResponse({"error": "not found"}, status=404)

    if request.method == "DELETE":
        node.delete()
        return JsonResponse({"ok": True})

    # PATCH
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    name = payload.get("name", None)
    changed = payload.get("changed", None)
    created = payload.get("created", None)

    if isinstance(name, str):
        new_name = name.strip()
        if new_name and new_name.lower() != node.text.lower():
            if _duplicate_exists(new_name, node.parent_id, exclude_id=node.pk):
                return JsonResponse({"error": "duplicate_name"}, status=409)
            node.text = new_name

    if isinstance(changed, str) and changed.strip():
        d = _date_from_payload(changed)
        if d:
            node.changeDate = d

    if isinstance(created, str) and created.strip():
        d = _date_from_payload(created)
        if d:
            node.createDate = d

    node.save(update_fields=["text", "createDate", "changeDate"])

    node = (
        TreeNode.objects
        .filter(pk=node.pk)
        .annotate(
            children_count=Count("children", distinct=True),
            pkg_count=Count("exercise_packages", distinct=True),
        )
    ).first()

    return JsonResponse(_serialize_node(node, with_counts=True))
