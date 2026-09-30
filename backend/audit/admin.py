from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    """Journal en lecture seule dans l'administration Django."""

    list_display = ("created_at", "action", "actor", "patient", "ip")
    list_filter = ("action",)
    search_fields = ("actor__email", "patient__email", "target_id")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
