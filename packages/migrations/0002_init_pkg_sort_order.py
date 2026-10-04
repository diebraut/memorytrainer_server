from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('packages', '0001_initial'),
    ]
    operations = [
        migrations.AddField(
            model_name='exercisepackage',
            name='sort_order',
            field=models.IntegerField(default=0, db_index=True),
        ),
    ]
