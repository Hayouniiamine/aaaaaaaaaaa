import uuid
from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """
    Conversation thread + ticket-style intake + satisfaction.
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

    # --- Resolution tracking (P1 #9) ---
    RESOLUTION_CHOICES = [
        ("ai_resolved", "ai_resolved"),
        ("escalated", "escalated"),
        ("abandoned", "abandoned"),
        ("unknown", "unknown"),
    ]
    resolution_method = models.CharField(
        max_length=20, choices=RESOLUTION_CHOICES, default="unknown", db_index=True,
    )

    # --- Intake (before chat) ---
    enterprise = models.CharField(max_length=160, blank=True, default="")
    problem_subject = models.CharField(max_length=200, blank=True, default="")
    affected_url = models.URLField(blank=True, default="")

    client_name = models.CharField(max_length=120, blank=True, default="")
    client_email = models.EmailField(blank=True, default="")
    client_phone = models.CharField(max_length=40, blank=True, default="")

    meta = models.JSONField(default=dict, blank=True)

    # --- Satisfaction / closing ---
    satisfaction_stars = models.PositiveSmallIntegerField(null=True, blank=True)  # 1..5
    satisfaction_comment = models.TextField(blank=True, default="")
    ended_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.tenant_id} / {self.user_id} / {self.id}"


class Message(models.Model):
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
    Only created when escalated (external API can be plugged later).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=100, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, db_index=True)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="tickets")

    external_ticket_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)

    status = models.CharField(max_length=20, default="open", db_index=True)
    priority = models.CharField(max_length=10, default="normal", db_index=True)
    category = models.CharField(max_length=50, default="incident", db_index=True)

    evidence = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)


class Incident(models.Model):
    """
    P0 #6: Cross-ticket incident correlation.
    Aggregates conversations reporting similar errors within a time window.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=100, db_index=True)

    error_pattern = models.CharField(max_length=200, db_index=True)  # e.g. "502", "timeout", "panne"
    severity = models.CharField(max_length=10, default="high", db_index=True)
    status = models.CharField(
        max_length=20,
        choices=[("open", "open"), ("acknowledged", "acknowledged"), ("resolved", "resolved")],
        default="open",
        db_index=True,
    )

    # How many conversations reported it
    hit_count = models.PositiveIntegerField(default=1)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    # Store IDs of related conversations
    conversation_ids = models.JSONField(default=list, blank=True)

    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["tenant_id", "status", "last_seen"]),
        ]

    def __str__(self):
        return f"[{self.status}] {self.error_pattern} ({self.hit_count} hits)"
