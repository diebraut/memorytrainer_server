from django.db import migrations

def init_pkg_sort_order(apps, schema_editor):
    ExercisePackage = apps.get_model('packages', 'ExercisePackage')
    TreeNode = apps.get_model('packages', 'TreeNode')

    for node_id in TreeNode.objects.values_list('id', flat=True):
        siblings = ExercisePackage.objects.filter(treeNode_id=node_id).order_by('id')
        for idx, pkg in enumerate(siblings):
            pkg.sort_order = idx
            pkg.save(update_fields=['sort_order'])

class Migration(migrations.Migration):
    dependencies = [('packages', '0002_init_pkg_sort_order')]
    operations = [migrations.RunPython(init_pkg_sort_order, migrations.RunPython.noop)]