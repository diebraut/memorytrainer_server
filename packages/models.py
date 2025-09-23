from django.db import models
from django.utils import timezone

from django.db import models
from django.utils import timezone

class TreeNode(models.Model):
    text = models.CharField(max_length=255)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')

    # NEU: Datumsfelder – editierbar (kein auto_now/auto_now_add, damit du sie im UI setzen kannst)
    createDate = models.DateField(default=timezone.now)
    changeDate = models.DateField(default=timezone.now)

    class Meta:
        ordering = ['text']

    def __str__(self):
        return self.text


class ExercisePackage(models.Model):
    packageName = models.CharField(max_length=255)
    packageDescription = models.TextField()
    createDate = models.DateField(default=timezone.now)
    changeDate = models.DateField(default=timezone.now)
    treeNode = models.ForeignKey(
        TreeNode,
        on_delete=models.CASCADE,
        related_name='exercise_packages'
    )

    class Meta:
        ordering = ['packageName']

    def __str__(self):
        return self.packageName


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
