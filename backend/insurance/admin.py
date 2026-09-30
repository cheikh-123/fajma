from django.contrib import admin

from .models import DoctorInsurer, Insurer


@admin.register(Insurer)
class InsurerAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "default_coverage_percent", "is_active")
    list_filter = ("kind", "is_active")
    prepopulated_fields = {"slug": ("name",)}


admin.site.register(DoctorInsurer)
