# packages/services.py
from __future__ import annotations

from pathlib import Path
import shutil
import os

from django.conf import settings
from django.utils import timezone

from .models import ExercisePackage


class PackageFileManager:
    """
    Kapselt Dateizuordnung:
    - uploads -> assigned-packages (mit Prefix "<id>_")
    - assigned-packages -> uploads (Prefix entfernen)
    - Speichert in der DB IMMER den Originalnamen OHNE Prefix.
    """

    def __init__(self, uploads_dir: Path | None = None, assigned_dir: Path | None = None):
        self.uploads_dir = Path(uploads_dir or settings.UPLOADS_DIR)
        self.assigned_dir = Path(assigned_dir or settings.ASSIGNED_PACKAGES_DIR)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.assigned_dir.mkdir(parents=True, exist_ok=True)

    # ---------- helpers ----------

    def _pkg_prefix(self, package_id: int) -> str:
        return f"{int(package_id)}_"

    def _unique_name(self, directory: Path, base_name: str) -> str:
        """
        Liefert einen Dateinamen, der im Zielverzeichnis noch nicht existiert.
        Fügt ' (1)', ' (2)', ... vor der Extension an.
        """
        stem, ext = os.path.splitext(base_name)
        candidate = base_name
        i = 1
        while (directory / candidate).exists():
            candidate = f"{stem} ({i}){ext}"
            i += 1
        return candidate

    # ---------- public API ----------

    def list_uploads(self) -> list[str]:
        """Alle Dateien im uploads-Verzeichnis (nur Dateien, keine Unterordner)."""
        return sorted(p.name for p in self.uploads_dir.iterdir() if p.is_file())

    def assign_to_package(self, package_id: int, filename: str) -> dict:
        """
        Verschiebt uploads/<filename> -> assigned-packages/<id>_<filename>
        und speichert in ExercisePackage.packageAssignment = <filename> (OHNE Prefix).
        """
        pkg = ExercisePackage.objects.select_for_update().get(pk=package_id)

        src = self.uploads_dir / filename
        if not src.exists() or not src.is_file():
            raise FileNotFoundError(f"Source not found: {src}")

        prefixed = self._pkg_prefix(package_id) + filename
        dst = self.assigned_dir / prefixed

        # falls Ziel bereits existiert (sollte eigentlich nicht passieren), neue eindeutige Variante
        if dst.exists():
            prefixed = self._unique_name(self.assigned_dir, prefixed)
            dst = self.assigned_dir / prefixed

        # move
        shutil.move(str(src), str(dst))

        # DB: nur Originalname speichern (ohne Prefix)
        pkg.packageAssignment = filename
        pkg.changeDate = pkg.changeDate or timezone.now().date()
        pkg.save(update_fields=["packageAssignment", "changeDate"])

        return {
            "ok": True,
            "package_id": pkg.id,
            "original_name": filename,   # ohne Prefix
            "assigned_name": prefixed,   # mit Prefix im assigned-Verzeichnis
        }

    def unassign_from_package(self, package_id: int) -> dict:
        """
        Verschiebt assigned-packages/<id>_<filename> -> uploads/<filename>
        und löscht die Zuordnung in der DB (setzt packageAssignment = "").
        """
        pkg = ExercisePackage.objects.select_for_update().get(pk=package_id)
        original = (pkg.packageAssignment or "").strip()
        if not original:
            raise ValueError("Kein zugeordnetes Paket gespeichert.")

        prefixed = self._pkg_prefix(package_id) + original
        src = self.assigned_dir / prefixed

        # Wenn die Datei nicht mehr dort liegt, brechen wir nicht hart ab:
        # Wir räumen die DB auf und geben eine Info zurück.
        moved = False
        dest_name = original

        if src.exists() and src.is_file():
            # Kollision im uploads-Verzeichnis vermeiden
            dest_name = self._unique_name(self.uploads_dir, original)
            dst = self.uploads_dir / dest_name
            shutil.move(str(src), str(dst))
            moved = True

        # DB zurücksetzen
        pkg.packageAssignment = ""
        pkg.changeDate = pkg.changeDate or timezone.now().date()
        pkg.save(update_fields=["packageAssignment", "changeDate"])

        return {
            "ok": True,
            "package_id": pkg.id,
            "restored_name": dest_name,    # im uploads-Verzeichnis
            "file_moved": moved,
        }
