import uuid
from django.conf import settings
from django.db import models



class Conversation(models.Model):
    """
    One conversation thread per (tenant, user). Can be resumed via conversation_id.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=100, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, db_index=True)

    status = models.CharField(
        max_length=20,
        choices=[("open", "open"), ("closed", "closed"), ("escalated", "escalated")],
        default="open",
        db_index=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.tenant_id} / {self.user_id} / {self.id}"


class Message(models.Model):
    """
    Stores chat history. meta can store internal fields like confidence, playbook_id, etc.
    """
    ROLE_CHOICES = [
        ("user", "user"),
        ("assistant", "assistant"),
        ("system", "system"),
    ]

    id = models.BigAutoField(primary_key=True)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, db_index=True)
    content = models.TextField()
    meta = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
        ]


class Ticket(models.Model):
    """
    Only created when mode=escalate and the TikTak ticket API is called (or mocked for now).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=100, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, db_index=True)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="tickets")

    # TikTak ticket id returned by your internal API (string in case it's like #8078)
    external_ticket_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)

    status = models.CharField(max_length=20, default="open", db_index=True)
    priority = models.CharField(max_length=10, default="normal", db_index=True)
    category = models.CharField(max_length=50, default="incident", db_index=True)

    # structured evidence: url, error, request_id, steps_tried, screenshot, etc.
    evidence = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
