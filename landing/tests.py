from pathlib import Path
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse


class UploadedPackagesTests(TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.directory = Path(self.temp_dir.name) / "UploadedPackages"
        override = override_settings(UPLOADED_PACKAGES_DIR=self.directory)
        override.enable()
        self.addCleanup(override.disable)
        user_model = get_user_model()
        self.staff = user_model.objects.create_user("staff", password="test", is_staff=True)
        self.regular = user_model.objects.create_user("regular", password="test")

    def test_staff_can_upload_list_and_delete_a_package(self):
        self.client.force_login(self.staff)
        self.assertContains(self.client.get(reverse("login_register")), "Zeige hochgeladene Pakete")
        response = self.client.post(
            reverse("landing:upload_package"),
            {"package_file": SimpleUploadedFile("training.zip", b"package")},
            follow=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual((self.directory / "training.zip").read_bytes(), b"package")
        self.assertContains(response, "training.zip")

        response = self.client.post(
            reverse("landing:delete_uploaded_package"),
            {"filename": "training.zip"},
            follow=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse((self.directory / "training.zip").exists())

    def test_regular_user_cannot_manage_files(self):
        self.directory.mkdir()
        (self.directory / "existing.zip").write_bytes(b"keep")
        self.client.force_login(self.regular)
        self.assertNotContains(self.client.get(reverse("login_register")), "Zeige hochgeladene Pakete")
        self.assertEqual(self.client.get(reverse("landing:uploaded_packages")).status_code, 302)
        self.assertEqual(
            self.client.post(reverse("landing:delete_uploaded_package"), {"filename": "existing.zip"}).status_code,
            302,
        )
        self.assertEqual(
            self.client.post(
                reverse("landing:upload_package"),
                {"package_file": SimpleUploadedFile("new.zip", b"new")},
            ).status_code,
            302,
        )
        self.assertEqual((self.directory / "existing.zip").read_bytes(), b"keep")
        self.assertFalse((self.directory / "new.zip").exists())

    def test_duplicate_and_invalid_deletion_are_rejected(self):
        self.directory.mkdir()
        (self.directory / "existing.zip").write_bytes(b"original")
        self.client.force_login(self.staff)
        self.client.post(
            reverse("landing:upload_package"),
            {"package_file": SimpleUploadedFile("existing.zip", b"replacement")},
        )
        self.assertEqual((self.directory / "existing.zip").read_bytes(), b"original")
        self.client.post(reverse("landing:delete_uploaded_package"), {"filename": "../existing.zip"})
        self.assertEqual((self.directory / "existing.zip").read_bytes(), b"original")

    def test_upload_requires_csrf_token(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.staff)
        response = client.post(
            reverse("landing:upload_package"),
            {"package_file": SimpleUploadedFile("training.zip", b"package")},
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.directory.exists())
