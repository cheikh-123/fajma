from django.contrib import admin

from .models import LedgerEntry, Payment, Payout, Refund, Subscription, SubscriptionPayment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("reference", "amount", "method", "status", "paid_at")
    list_filter = ("status", "method")
    search_fields = ("reference",)
    readonly_fields = [f.name for f in Payment._meta.fields]


@admin.register(LedgerEntry)
class LedgerEntryAdmin(admin.ModelAdmin):
    """Journal comptable en lecture seule : les écritures ne se modifient jamais."""

    list_display = ("created_at", "doctor", "kind", "amount", "commission")
    list_filter = ("kind",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Payout)
class PayoutAdmin(admin.ModelAdmin):
    list_display = ("reference", "doctor", "amount", "method", "status", "created_at")
    list_filter = ("status",)
    readonly_fields = [f.name for f in Payout._meta.fields]


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ("payment", "amount", "status", "created_at")
    list_filter = ("status",)
    readonly_fields = [f.name for f in Refund._meta.fields]


admin.site.register(Subscription)
admin.site.register(SubscriptionPayment)
