from django.apps import AppConfig

class MyMemorytrainerConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'  # Falls du das verwendest
    name = 'memorytrainer'

    def ready(self):
        # Falls du den Tree-Initializer wieder aktivieren willst, entferne das Kommentarzeichen
        # from django.db.models.signals import post_migrate
        # post_migrate.connect(self.init_knowledge_tree, sender=self)

        print("✅ Memorytrainer-App wurde erfolgreich geladen!")
