from django.conf import settings
from django.db import models
from django.utils import timezone

from django.db import migrations

from django.utils import timezone
from django.db import models

class TreeNode(models.Model):
    text = models.CharField(max_length=255)
    parent = models.ForeignKey('self', null=True, blank=True,
                               related_name='children', on_delete=models.CASCADE)

    # NEU – mit Default (oder auto_* je nach Wunsch)
    createDate = models.DateField(default=timezone.now)        # oder auto_now_add=True
    changeDate = models.DateField(default=timezone.now)        # oder auto_now=True

    sort_order = models.PositiveIntegerField(default=0, db_index=True)

    class Meta:
        ordering = ['sort_order', 'id']


class ExercisePackage(models.Model):
    packageName = models.CharField(max_length=255)
    packageDescription = models.TextField()
    createDate = models.DateField(default=timezone.now)
    changeDate = models.DateField(default=timezone.now)
    sort_order = models.IntegerField(default=0, db_index=True)
    treeNode = models.ForeignKey('packages.TreeNode', on_delete=models.CASCADE, related_name='exercise_packages')

    # NEU – Dateiauswahl aus ../data/uploads
    packageAssignment = models.FilePathField(
        path=str(settings.UPLOADS_DIR),          # s. settings.UPLOADS_DIR
        match=r'.+\.(zip|xml|json)$',
        recursive=False,
        allow_files=True,
        allow_folders=False,
        max_length=512,
        blank=True,
        null=True,
        verbose_name='Paketzurordnung',
    )

    class Meta:
        ordering = ['sort_order', 'id']

# Hilfsklasse (kein Django-Model) für Demo-Seeding
class KnowledgeTree:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(KnowledgeTree, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return
        self._initialized = True
        self.roots = []
        self._initialize_tree()

    def _initialize_tree(self):
        # Wenn bereits Daten vorhanden sind: nur Roots laden
        if TreeNode.objects.exists():
            self.roots = TreeNode.objects.filter(parent__isnull=True)
            return

        # --- Wurzeln ---
        root1 = TreeNode.objects.create(text="1. Naturwissenschaften")
        root2 = TreeNode.objects.create(text="2. Geisteswissenschaften")
        root3 = TreeNode.objects.create(text="3. Sozialwissenschaften")
        root4 = TreeNode.objects.create(text="4. Technologie und Ingenieurwesen")
        root5 = TreeNode.objects.create(text="5. Lebenswissenschaften")
        root6 = TreeNode.objects.create(text="6. Bildung und Allgemeinwissen")

        # --- Beispiele Unterknoten ---
        u11 = TreeNode.objects.create(text="Unterkat. 1.1", parent=root1)
        u12 = TreeNode.objects.create(text="Unterkat. 1.2", parent=root1)

        TreeNode.objects.create(text="Unterkat. 1.1.1", parent=u11)
        TreeNode.objects.create(text="Unterkat. 1.1.2", parent=u11)
        TreeNode.objects.create(text="Unterkat. 1.1.3", parent=u11)

        TreeNode.objects.create(text="Unterkat. 1.2.1", parent=u12)
        TreeNode.objects.create(text="Unterkat. 1.2.2", parent=u12)

        u21 = TreeNode.objects.create(text="Unterkat. 2.1", parent=root2)
        TreeNode.objects.create(text="Unterkat. 2.1.1", parent=u21)

        self.roots = [root1, root2, root3, root4, root5, root6]

        # --- Beispiel-Pakete ---
        self._initialize_exercise_packages()

    def _initialize_exercise_packages(self):
        u11 = TreeNode.objects.get(text="Unterkat. 1.1")
        ExercisePackage.objects.create(
            packageName="packName_1",
            packageDescription="Inhalts Beschreibung etwas länger",
            createDate="2017-11-11",
            changeDate="2025-01-01",
            treeNode=u11
        )
        ExercisePackage.objects.create(
            packageName="packName_2",
            packageDescription="Inhalts Beschreibung etwas länger",
            createDate="2019-11-11",
            changeDate="2025-01-01",
            treeNode=u11
        )

        u111 = TreeNode.objects.get(text="Unterkat. 1.1.1")
        ExercisePackage.objects.bulk_create([
            ExercisePackage(packageName="packName_1", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2017-11-11", changeDate="2025-01-01", treeNode=u111),
            ExercisePackage(packageName="packName_2", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2019-11-11", changeDate="2025-01-01", treeNode=u111),
            ExercisePackage(packageName="packName_3", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2019-11-11", changeDate="2025-01-01", treeNode=u111),
        ])

        u113 = TreeNode.objects.get(text="Unterkat. 1.1.3")
        ExercisePackage.objects.bulk_create([
            ExercisePackage(packageName="packName_1", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2017-11-11", changeDate="2025-01-01", treeNode=u113),
            ExercisePackage(packageName="packName_2", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2019-11-11", changeDate="2025-01-01", treeNode=u113),
        ])

        u122 = TreeNode.objects.get(text="Unterkat. 1.2.2")
        ExercisePackage.objects.bulk_create([
            ExercisePackage(packageName="packName_1", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2017-11-11", changeDate="2025-01-01", treeNode=u122),
            ExercisePackage(packageName="packName_2", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2019-11-11", changeDate="2025-01-01", treeNode=u122),
            ExercisePackage(packageName="packName_3", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2017-11-11", changeDate="2025-01-01", treeNode=u122),
            ExercisePackage(packageName="packName_4", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2019-11-11", changeDate="2025-01-01", treeNode=u122),
        ])

        u211 = TreeNode.objects.get(text="Unterkat. 2.1.1")
        ExercisePackage.objects.bulk_create([
            ExercisePackage(packageName="packName_1", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2017-11-11", changeDate="2025-01-01", treeNode=u211),
            ExercisePackage(packageName="packName_2", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2019-11-11", changeDate="2025-01-01", treeNode=u211),
            ExercisePackage(packageName="packName_3", packageDescription="Inhalts Beschreibung etwas länger",
                            createDate="2017-11-11", changeDate="2025-01-01", treeNode=u211),
        ])

    def save_knowledge(self):
        pass

    def print_tree(self, node=None, level=0):
        if node is None:
            for root in self.roots:
                self.print_tree(root, level)
        else:
            print("  " * level + node.text)
            for child in node.children.all():
                self.print_tree(child, level + 1)
            for exercise_package in node.exercise_packages.all():
                print("  " * (level + 1) + f"ExercisePackage: {exercise_package.packageName}")

def init_sort_order(apps, schema_editor):
    TreeNode = apps.get_model('packages', 'TreeNode')
    # pro Parent eine laufende Nummer vergeben
    for parent_id in TreeNode.objects.values_list('parent_id', flat=True).distinct():
        siblings = TreeNode.objects.filter(parent_id=parent_id).order_by('id')
        for idx, node in enumerate(siblings):
            node.sort_order = idx
            node.save(update_fields=['sort_order'])

class Migration(migrations.Migration):
    dependencies = [('packages', '000X_previous')]
    operations = [migrations.RunPython(init_sort_order, migrations.RunPython.noop)]

