import json
import requests

from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.utils import timezone

from .models import Conversation, Message, Ticket


def resolve_tenant_id(request) -> str:
    return "tiktak_pro"


def get_or_create_widget_user():
    """
    When the Nuxt widget calls the backend without Django session auth,
    attach messages/tickets to a dedicated service user.
    """
    User = get_user_model()
    user, _ = User.objects.get_or_create(
        username="support_widget",
        defaults={"is_active": True},
    )
    return user


def get_request_user_or_widget(request):
    """
    Auth policy:
    - If admin session is logged in => use request.user
    - Else if widget secret matches => use service user
    - Else => unauthorized
    """
    if request.user.is_authenticated:
        return request.user

    secret = request.headers.get("X-TikTak-Widget-Secret") or request.headers.get("x-tiktak-widget-secret") or ""
    secret = secret.strip()

    if settings.WIDGET_SHARED_SECRET and secret == settings.WIDGET_SHARED_SECRET:
        return get_or_create_widget_user()

    return None


def get_recent_history(conversation: Conversation, limit: int = 10):
    qs = Message.objects.filter(conversation=conversation).order_by("-created_at")[:limit]
    msgs = list(qs)[::-1]
    return [{"role": m.role, "content": m.content} for m in msgs]


@csrf_exempt
@require_POST
def ai_ask(request):
    # 1) Auth (session OR widget-secret)
    actor = get_request_user_or_widget(request)
    if actor is None:
        return JsonResponse({"error": "unauthorized"}, status=401)

    # 2) Parse input
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"error": "invalid_json"}, status=400)

    message = (payload.get("message") or "").strip()
    conversation_id = payload.get("conversation_id")
    confirm_escalation = bool(payload.get("confirm_escalation", False))

    if not message:
        return JsonResponse({"error": "message is required"}, status=400)

    tenant_id = resolve_tenant_id(request)

    # 3) Load or create conversation
    conversation = None
    if conversation_id:
        try:
            conversation = Conversation.objects.get(
                id=conversation_id,
                tenant_id=tenant_id,
                user=actor,
            )
        except Conversation.DoesNotExist:
            conversation = None

    if conversation is None:
        conversation = Conversation.objects.create(
            tenant_id=tenant_id,
            user=actor,
            status="open",
        )

    conversation.updated_at = timezone.now()
    conversation.save(update_fields=["updated_at"])

    # 4) Save user message
    Message.objects.create(
        conversation=conversation,
        role="user",
        content=message,
        meta={"confirm_escalation": confirm_escalation},
    )

    # 5) Build history from DB
    history = get_recent_history(conversation, limit=10)

    # 6) Call Cloudflare Worker
    worker_payload = {
        "message": message,
        "history": history,
        "tenant": tenant_id,
        "user": str(actor.id),
        "confirm": {"user_confirmed": confirm_escalation},
    }

    try:
        r = requests.post(
            f"{settings.CF_WORKER_URL}/chat",
            json=worker_payload,
            timeout=20,
            headers={"Content-Type": "application/json"},
        )
        data = r.json()
    except Exception as e:
        data = {
            "mode": "escalate",
            "answer": (
                "Our support service is temporarily unavailable. "
                "I’m escalating this to support."
            ),
            "signals": {"confidence": 0.0, "incident": True},
            "evidence": {"error": str(e)},
        }

    mode = data.get("mode", "clarify")
    answer = data.get("answer", "")
    signals = data.get("signals", {}) or {}
    confidence = float(signals.get("confidence", 0.0))
    incident = bool(signals.get("incident", False))

    # 7) Save assistant message
    Message.objects.create(
        conversation=conversation,
        role="assistant",
        content=answer,
        meta={
            "mode": mode,
            "signals": signals,
            "context": data.get("context"),
            "playbook_id": data.get("playbook_id"),
            "confirm_escalation": confirm_escalation,
        },
    )

    ticket_payload = None

    # 8) Sidekick escalation policy
    should_create_ticket_now = incident or confirm_escalation

    confirm_ui = None
    if mode == "escalate" and not should_create_ticket_now:
        confirm_ui = {
            "type": "confirm_escalation",
            "title": "Créer un ticket support ?",
            "message": (
                "Je peux créer un ticket pour l’équipe TikTak PRO. "
                "Avant ça, confirmez : avez-vous déjà essayé les étapes proposées ?"
            ),
            "buttons": [
                {"label": "Oui, créer le ticket", "action": "confirm_escalation"},
                {"label": "Non, je veux essayer", "action": "cancel"},
            ],
        }

    if mode == "escalate" and should_create_ticket_now:
        conversation.status = "escalated"
        conversation.save(update_fields=["status", "updated_at"])

        t = Ticket.objects.create(
            tenant_id=tenant_id,
            user=actor,
            conversation=conversation,
            external_ticket_id=None,
            priority="high" if incident else "normal",
            category=data.get("category", "incident"),
            evidence=data.get("evidence") or {},
        )

        ticket_payload = {
            "id": str(t.id),
            "external_ticket_id": t.external_ticket_id,
            "status": t.status,
            "priority": t.priority,
            "category": t.category,
        }

    # 9) Customer-safe response
    quality = "high" if confidence >= 0.75 else "medium" if confidence >= 0.5 else "low"

    return JsonResponse(
        {
            "conversation_id": str(conversation.id),
            "mode": mode,
            "answer": answer,
            "ui": confirm_ui or data.get("ui"),
            "actions": data.get("actions") or [],
            "quality": quality,
            "ticket": ticket_payload,
        },
        status=200,
    )
