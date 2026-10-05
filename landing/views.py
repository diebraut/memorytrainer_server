from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST


ALLOWED_PACKAGE_EXTENSIONS = {".zip", ".xml", ".json"}
MAX_PACKAGE_BYTES = 512 * 1024 * 1024


def _uploaded_packages_dir():
    directory = Path(settings.UPLOADED_PACKAGES_DIR)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _safe_package_name(name):
    return (
        bool(name)
        and len(name) <= 200
        and name not in (".", "..")
        and "/" not in name
        and "\\" not in name
        and "\0" not in name
    )

def index(request):
    # Startseite
    return render(request, "landing/index.html")

@ensure_csrf_cookie
def pakete(request):
    # Seite mit Paketen / Knowledge-Tree
    return render(request, "landing/pakete.html")


@staff_member_required(login_url="login_register")
def uploaded_packages(request):
    files = []
    for path in _uploaded_packages_dir().iterdir():
        if path.is_file() and not path.is_symlink():
            stat = path.stat()
            files.append({
                "name": path.name,
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime, timezone.get_current_timezone()),
            })
    files.sort(key=lambda file: file["name"].casefold())
    return render(request, "landing/uploaded_packages.html", {"files": files})


@staff_member_required(login_url="login_register")
@require_POST
def upload_package(request):
    package = request.FILES.get("package_file")
    if package is None:
        messages.error(request, "Bitte eine Paketdatei auswählen.")
    elif not _safe_package_name(package.name) or Path(package.name).suffix.lower() not in ALLOWED_PACKAGE_EXTENSIONS:
        messages.error(request, "Erlaubt sind ZIP-, XML- und JSON-Dateien mit einem gültigen Dateinamen.")
    elif not 0 < package.size <= MAX_PACKAGE_BYTES:
        messages.error(request, "Die Paketdatei muss zwischen 1 Byte und 512 MB groß sein.")
    else:
        target = _uploaded_packages_dir() / package.name
        created = False
        try:
            with target.open("xb") as output:
                created = True
                for chunk in package.chunks():
                    output.write(chunk)
        except FileExistsError:
            messages.error(request, "Eine Datei mit diesem Namen ist bereits vorhanden.")
        except OSError:
            if created:
                target.unlink(missing_ok=True)
            messages.error(request, "Die Datei konnte nicht gespeichert werden.")
        else:
            messages.success(request, f"{package.name} wurde hochgeladen.")
    return redirect("landing:uploaded_packages")


@staff_member_required(login_url="login_register")
@require_POST
def delete_uploaded_package(request):
    name = request.POST.get("filename", "")
    if not _safe_package_name(name):
        messages.error(request, "Ungültiger Dateiname.")
    else:
        target = _uploaded_packages_dir() / name
        if not target.is_file() or target.is_symlink():
            messages.error(request, "Die Datei wurde nicht gefunden.")
        else:
            try:
                target.unlink()
            except OSError:
                messages.error(request, "Die Datei konnte nicht gelöscht werden.")
            else:
                messages.success(request, f"{name} wurde gelöscht.")
    return redirect("landing:uploaded_packages")
