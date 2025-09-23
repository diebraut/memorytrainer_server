# memorytrainer/management/commands/initialize_knowledge_tree.py
from django.core.management.base import BaseCommand
from packages.models import TreeNode, ExercisePackage

class Command(BaseCommand):
    help = 'Initialisiert den Knowledge Tree'

    def handle(self, *args, **kwargs):
        KnowledgeTree()
        self.stdout.write(self.style.SUCCESS('Knowledge Tree erfolgreich initialisiert'))
