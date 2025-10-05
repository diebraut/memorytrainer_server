# packages/views.py
from __future__ import annotations

import json
from datetime import date

from django.db import models
from django.db.models import Count, F, Max, Q
from django.http import JsonResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_GET
from django.utils.dateparse import parse_date

from .models import TreeNode, ExercisePackage
from django.shortcuts import render
from pathlib import Path
from django.conf import settings

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
# packages/views.py (oben, bei den Helpers)
def _normalize_parent_id(value):
    """
    Konvertiert '', None, 'null' -> None; sonst int(value).
    """
    if value in (None, '', 'null'):
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
        # counts wurden bereits via annotate geliefert – ansonsten 0
        data["children_count"] = getattr(node, "children_count", 0) or 0
        data["pkg_count"] = getattr(node, "pkg_count", 0) or 0
    return data


def _siblings_qs(parent_id):
    """
    QS der Geschwister (gleiche Ebene).
    """
    return TreeNode.objects.filter(parent_id=parent_id)


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
    """Interne Helper-Funktion – KEINE View!"""
    d = Path(settings.UPLOADS_DIR)
    d.mkdir(parents=True, exist_ok=True)
    return sorted(p.name for p in d.iterdir() if p.is_file())


# ------------------------------------------------------------
# Read-Endpunkte für den Baum
# ------------------------------------------------------------

@require_GET
def list_uploads(request):
    """Öffentliche View, die von urls.py geroutet wird."""
    return JsonResponse({"files": _list_upload_files()})

def packages_page(request):
    # … dein bisheriger Code/Context
    ctx = {
        # … bestehende Einträge
        "upload_files": _list_upload_files(),  # << NEU
    }
    return render(request, "packages/pakete.html", ctx)

def categories(request):
    """
    Root-Kategorien (parent is null), stabil sortiert nach sort_order.
    """
    roots = (
        TreeNode.objects
        .filter(parent__isnull=True)
        .annotate(
            children_count=Count('children', distinct=True),
            pkg_count=Count('exercise_packages', distinct=True),
        )
        .order_by('sort_order', 'id')
    )

    data = [_serialize_node(n, with_counts=True) for n in roots]
    return JsonResponse(data, safe=False)


def get_subcategories(request, category_id: int):
    """
    Unterkategorien einer Kategorie, stabil sortiert nach sort_order.
    """
    subs = (
        TreeNode.objects
        .filter(parent_id=category_id)
        .annotate(
            children_count=Count('children', distinct=True),
            pkg_count=Count('exercise_packages', distinct=True),
        )
        .order_by('sort_order', 'id')
    )

    data = [_serialize_node(n, with_counts=True) for n in subs]
    return JsonResponse(data, safe=False)


# packages/views.py
# packages/views.py
from django.views.decorators.http import require_GET

@require_GET
def get_details(request, category_id, subcategory_id):
    node = get_object_or_404(TreeNode, pk=subcategory_id)
    qs = (ExercisePackage.objects
          .filter(treeNode=node)
          .order_by('sort_order', 'id')
          .values('id','packageName','packageDescription','createDate','changeDate','sort_order'))
    items = [{
        "id": r["id"],
        "title": r["packageName"],
        "desc": r["packageDescription"],
        "created": r["createDate"],
        "changed": r["changeDate"],
        "sort_order": r["sort_order"],
    } for r in qs]
    return JsonResponse({"items": items})


# packages/views.py
from django.db import transaction
from django.http import JsonResponse
import json


@csrf_exempt
@require_http_methods(["GET", "PATCH", "DELETE"])
def package_detail(request, package_id: int):
    """
    GET    /api/package/<id>/
    PATCH  /api/package/<id>/
      Body-Felder (optional):
        - title: str
        - desc: str
        - created: 'YYYY-MM-DD'
        - changed: 'YYYY-MM-DD'
        - node_id: int                          # in andere Unterkategorie verschieben
        - sort_order: int                       # absolute Zielposition (0-basiert)
        - direction: 'before' | 'after'         # relatives Re-Ordering
        - ref_pkg_id: int                       # Referenzpaket für direction
    DELETE /api/package/<id>/
      - schließt die Sortierlücke im Knoten

    Antworten enthalten immer sort_order.
    """
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
            "node": {"id": pkg.treeNode_id, "name": pkg.treeNode.text if pkg.treeNode_id else None},
        })

    if request.method == "DELETE":
        node_id = pkg.treeNode_id
        hole = pkg.sort_order
        pkg.delete()
        # Lücke in der Sortierung schließen
        ExercisePackage.objects.filter(
            treeNode_id=node_id, sort_order__gt=hole
        ).update(sort_order=F('sort_order') - 1)
        return JsonResponse({"ok": True})

    # --- PATCH ---
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    title = (payload.get("title") or "").strip()
    desc = payload.get("desc")
    created = payload.get("created")
    changed = payload.get("changed")
    node_id = payload.get("node_id")
    new_order = payload.get("sort_order", None)
    direction = payload.get("direction")
    ref_id = payload.get("ref_pkg_id")

    with transaction.atomic():
        old_node_id = pkg.treeNode_id
        old_order = pkg.sort_order

        # --- Zielknoten bestimmen ---
        target_node_id = old_node_id
        if node_id is not None:
            try:
                target_node_id = int(node_id)
            except (TypeError, ValueError):
                return JsonResponse({"error": "invalid node_id"}, status=400)
        elif ref_id:
            # wenn keine node_id gegeben ist, aber ref_pkg_id -> Zielknoten aus Referenz ableiten
            ref = ExercisePackage.objects.filter(pk=ref_id).only('treeNode_id').first()
            if ref:
                target_node_id = ref.treeNode_id

        # --- Re-Ordering / Verschieben vorbereiten ---
        def resolve_insert_at(_siblings):
            # relatives Re-Ordering?
            if ref_id and direction in ("before", "after"):
                for idx, s in enumerate(_siblings):
                    if s.id == ref_id:
                        return idx + (1 if direction == "after" else 0)
            # absolute Zielposition?
            if isinstance(new_order, int):
                return max(0, min(int(new_order), len(_siblings)))
            # Standard: ans Ende
            return len(_siblings)

        # --- Verschieben in anderen Knoten? ---
        if target_node_id != old_node_id:
            # 1) Lücke im alten Knoten schließen
            ExercisePackage.objects.filter(
                treeNode_id=old_node_id, sort_order__gt=old_order
            ).update(sort_order=F('sort_order') - 1)

            # 2) Position im Zielknoten bestimmen und Platz schaffen
            siblings = list(
                ExercisePackage.objects
                .filter(treeNode_id=target_node_id)
                .order_by('sort_order', 'id')
            )
            insert_at = resolve_insert_at(siblings)

            for idx, s in enumerate(siblings):
                new_so = idx if idx < insert_at else idx + 1
                if s.sort_order != new_so:
                    s.sort_order = new_so
            if siblings:
                ExercisePackage.objects.bulk_update(siblings, ['sort_order'])

            # 3) Paket updaten (inkl. Knotenwechsel)
            pkg.treeNode_id = target_node_id
            pkg.sort_order = insert_at

        else:
            # Re-Ordering innerhalb desselben Knotens?
            # Nur wenn direction/ref oder sort_order gegeben ist und sich Position ändert
            if (ref_id and direction in ("before", "after")) or isinstance(new_order, int):
                siblings = list(
                    ExercisePackage.objects
                    .filter(treeNode_id=old_node_id)
                    .order_by('sort_order', 'id')
                )
                # gewünschte Zielposition
                insert_at = resolve_insert_at([s for s in siblings if s.id != pkg.id])
                if insert_at != old_order:
                    if insert_at < old_order:
                        # Block [insert_at ... old_order-1] nach rechts schieben
                        ExercisePackage.objects.filter(
                            treeNode_id=old_node_id,
                            sort_order__gte=insert_at,
                            sort_order__lt=old_order
                        ).update(sort_order=F('sort_order') + 1)
                    else:
                        # Block [old_order+1 ... insert_at] nach links ziehen
                        ExercisePackage.objects.filter(
                            treeNode_id=old_node_id,
                            sort_order__gt=old_order,
                            sort_order__lte=insert_at
                        ).update(sort_order=F('sort_order') - 1)
                    pkg.sort_order = insert_at

        # --- Feld-Updates (Name, Text, Dates) ---
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

        pkg.save()

    # Antwort
    return JsonResponse({
        "id": pkg.id,
        "title": pkg.packageName,
        "desc": pkg.packageDescription,
        "created": pkg.createDate.isoformat() if pkg.createDate else None,
        "changed": pkg.changeDate.isoformat() if pkg.changeDate else None,
        "sort_order": pkg.sort_order,
        "node": {"id": pkg.treeNode_id},
    })


# ------------------------------------------------------------
# Paket anlegen (inkl. Position "davor/danach")
# ------------------------------------------------------------@csrf_exempt
# packages/views.py
from django.db import transaction
from datetime import date


@require_http_methods(["POST"])
@transaction.atomic
def create_package(request):
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

    if not title or not node_id:
        return HttpResponseBadRequest("title and node_id required")

    node = get_object_or_404(TreeNode, pk=node_id)

    # Ziel-Sortierindex bestimmen
    if direction in ("before", "after") and ref_id:
        ref = get_object_or_404(ExercisePackage, pk=ref_id, treeNode=node)
        target = ref.sort_order if direction == "before" else ref.sort_order + 1
        # Platz schaffen
        ExercisePackage.objects.filter(treeNode=node, sort_order__gte=target)\
            .update(sort_order=F('sort_order') + 1)
        sort_order = target
    else:
        # ans Ende
        max_so = ExercisePackage.objects.filter(treeNode=node).aggregate(m=Max("sort_order"))["m"]
        sort_order = 0 if max_so is None else max_so + 1

    pkg = ExercisePackage.objects.create(
        packageName=title,
        packageDescription=desc,
        createDate=created,
        changeDate=changed,
        sort_order=sort_order,
        treeNode=node,
    )

    return JsonResponse({
        "id": pkg.id,
        "title": pkg.packageName,
        "desc": pkg.packageDescription,
        "created": pkg.createDate,
        "changed": pkg.changeDate,
        "sort_order": pkg.sort_order,
    }, status=201)

@csrf_exempt
@require_http_methods(["POST"])
def create_category(request):
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except Exception:
        payload = {}

    name = (payload.get("name") or "").strip()
    parent_id = _normalize_parent_id(payload.get("parent_id"))
    ref_id = payload.get("ref_id", None)
    direction = payload.get("direction", None)  # 'before' | 'after' | None

    if not name:
        return JsonResponse({"error": "name required"}, status=400)

    # Duplikate auf gleicher Ebene verhindern
    if _duplicate_exists(name, parent_id, exclude_id=None):
        return JsonResponse({"error": "duplicate_name"}, status=409)

    created = _date_from_payload(payload.get("created"), fallback=date.today())
    changed = _date_from_payload(payload.get("changed"), fallback=date.today())

    with transaction.atomic():
        # Geschwister in aktueller Anzeigereihenfolge (sort_order,id)
        siblings_qs = TreeNode.objects.filter(parent_id=parent_id).order_by('sort_order', 'id')
        siblings = list(siblings_qs)

        # Standard: ans Ende
        insert_at = len(siblings)

        # Bei 'before'/'after' exakt neben ref einfügen
        if ref_id and direction in ("before", "after"):
            for idx, n in enumerate(siblings):
                if n.id == ref_id:
                    insert_at = idx + (1 if direction == "after" else 0)
                    break  # ref gefunden

        # Alle Geschwister strikt neu durchnummerieren (Gap bei insert_at)
        for idx, n in enumerate(siblings):
            new_order = idx if idx < insert_at else idx + 1
            if n.sort_order != new_order:
                n.sort_order = new_order
        if siblings:
            TreeNode.objects.bulk_update(siblings, ['sort_order'])

        # Neue Kategorie exakt an Position insert_at
        node = TreeNode.objects.create(
            text=name,
            parent_id=parent_id,
            createDate=created,
            changeDate=changed,
            sort_order=insert_at,
        )

    # Antwort mit Zählern
    node = (
        TreeNode.objects
        .filter(pk=node.pk)
        .annotate(
            children_count=Count('children', distinct=True),
            pkg_count=Count('exercise_packages', distinct=True),
        )
    ).first()
    return JsonResponse(_serialize_node(node, with_counts=True), status=201)


# ------------------------------------------------------------
# Kategorie updaten / löschen
# ------------------------------------------------------------

@csrf_exempt
@require_http_methods(["PATCH", "DELETE"])
def update_category(request, category_id: int):
    """
    PATCH /api/category/<id>/
      Body: { name?, changed? ('YYYY-MM-DD'), created? ('YYYY-MM-DD') }
      - Name-Änderung prüft Duplikate auf gleicher Ebene (case-insensitive).

    DELETE /api/category/<id>/
      Löscht Knoten (und durch FK-ON DELETE CASCADE auch Unterknoten/Pakete).
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

    # Name-Update + Duplicate-Check (auf gleicher Ebene)
    if isinstance(name, str):
        new_name = name.strip()
        if new_name and new_name.lower() != node.text.lower():
            if _duplicate_exists(new_name, node.parent_id, exclude_id=node.pk):
                return JsonResponse({"error": "duplicate_name"}, status=409)
            node.text = new_name

    # Datum(e)
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
            children_count=Count('children', distinct=True),
            pkg_count=Count('exercise_packages', distinct=True),
        )
    ).first()

    return JsonResponse(_serialize_node(node, with_counts=True))
