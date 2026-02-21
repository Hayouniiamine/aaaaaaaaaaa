from django.contrib import admin
from .models import Conversation, Message, Ticket


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "tenant_id",
        "user",
        "status",
        "enterprise",
        "problem_subject",
        "affected_url",
        "client_name",
        "client_email",
        "client_phone",
        "satisfaction_stars",
        "created_at",
        "updated_at",
    )
    list_filter = ("tenant_id", "status", "created_at", "satisfaction_stars")
    search_fields = (
        "id",
        "enterprise",
        "problem_subject",
        "affected_url",
        "client_name",
        "client_email",
        "client_phone",
    )


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "role", "created_at")
    list_filter = ("role", "created_at")
    search_fields = ("conversation__id", "content")


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ("id", "tenant_id", "user", "status", "priority", "category", "external_ticket_id", "created_at")
    list_filter = ("tenant_id", "status", "priority", "category", "created_at")
    search_fields = ("id", "external_ticket_id", "conversation__id")
