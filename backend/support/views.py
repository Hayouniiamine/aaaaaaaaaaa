"""
Enhanced views.py - Optional improvements to leverage refactored worker features

This is OPTIONAL - your current views.py works perfectly fine.
These enhancements add better analytics, smarter escalation, and improved UX.
"""

import json
import requests

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, F
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST, require_GET

from .models import Conversation, Message, Ticket, Incident


def resolve_tenant_id(request) -> str:
    return "tiktak_pro"


def get_or_create_widget_user():
    User = get_user_model()
    user, _ = User.objects.get_or_create(
        username="support_widget",
        defaults={"is_active": True},
    )
    return user


def get_request_user_or_widget(request):
    if request.user.is_authenticated:
        return request.user

    secret = (
        request.headers.get("X-TikTak-Widget-Secret")
        or request.headers.get("x-tiktak-widget-secret")
        or ""
    )
    
    # Debug logging
    import sys
    print(f"[DEBUG] Widget auth check:", file=sys.stderr)
    print(f"  - Incoming header: '{secret}'", file=sys.stderr)
    print(f"  - Expected secret: '{settings.WIDGET_SHARED_SECRET}'", file=sys.stderr)
    print(f"  - Match: {secret == settings.WIDGET_SHARED_SECRET}", file=sys.stderr)
    
    if settings.WIDGET_SHARED_SECRET and secret == settings.WIDGET_SHARED_SECRET:
        user = get_or_create_widget_user()
        print(f"  - ✓ Widget user authenticated: {user.username}", file=sys.stderr)
        return user

    print(f"  - ✗ Widget auth FAILED", file=sys.stderr)
    return None


def get_recent_history(conversation, limit=20):
    qs = Message.objects.filter(conversation=conversation).order_by("-created_at")[:limit]
    return [{"role": m.role, "content": m.content} for m in reversed(qs)]


@csrf_exempt
@require_POST
def start_conversation(request):
    actor = get_request_user_or_widget(request)
    if actor is None:
        return JsonResponse({"error": "unauthorized"}, status=401)

    payload = json.loads(request.body.decode("utf-8"))
    intake = payload.get("intake") or {}

    required = ["enterprise", "problem_subject", "affected_url", "client_name"]
    for f in required:
        if not intake.get(f):
            return JsonResponse({"error": "missing_field", "field": f}, status=400)

    conversation = Conversation.objects.create(
        tenant_id=resolve_tenant_id(request),
        user=actor,
        enterprise=intake["enterprise"],
        problem_subject=intake["problem_subject"],
        affected_url=intake["affected_url"],
        client_name=intake["client_name"],
        client_email=intake.get("client_email", ""),
        client_phone=intake.get("client_phone", ""),
        status="open",
    )

    Message.objects.create(
        conversation=conversation,
        role="system",
        content=f"Ticket opened for {conversation.enterprise} — {conversation.problem_subject}",
        meta={"type": "intake"},
    )

    return JsonResponse({"conversation_id": str(conversation.id), "status": conversation.status}, status=201)


@csrf_exempt
@require_POST
def conversation_history(request):
    actor = get_request_user_or_widget(request)
    if actor is None:
        return JsonResponse({"error": "unauthorized"}, status=401)

    payload = json.loads(request.body.decode("utf-8"))
    cid = payload.get("conversation_id")

    try:
        conv = Conversation.objects.get(id=cid, user=actor)
    except Conversation.DoesNotExist:
        return JsonResponse({"error": "conversation_not_found"}, status=404)

    messages = Message.objects.filter(conversation=conv).order_by("created_at")
    return JsonResponse(
        {
            "conversation_id": str(conv.id),
            "status": conv.status,
            "intake": {
                "enterprise": conv.enterprise,
                "problem_subject": conv.problem_subject,
                "affected_url": conv.affected_url,
                "client_name": conv.client_name,
                "client_email": conv.client_email,
                "client_phone": conv.client_phone,
            },
            "satisfaction": {
                "stars": getattr(conv, "satisfaction_stars", None),
                "comment": getattr(conv, "satisfaction_comment", ""),
                "ended_at": conv.ended_at.isoformat() if getattr(conv, "ended_at", None) else None,
            },
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "created_at": m.created_at.isoformat(),
                    "meta": m.meta or {},
                }
                for m in messages
            ],
        }
    )


@csrf_exempt
@require_POST
def end_conversation(request):
    actor = get_request_user_or_widget(request)
    if actor is None:
        return JsonResponse({"error": "unauthorized"}, status=401)

    payload = json.loads(request.body.decode("utf-8"))
    cid = payload.get("conversation_id")
    stars = int(payload.get("stars", 0))
    comment = payload.get("comment", "")

    try:
        conv = Conversation.objects.get(id=cid, user=actor)
    except Conversation.DoesNotExist:
        return JsonResponse({"error": "conversation_not_found"}, status=404)

    conv.satisfaction_stars = stars
    conv.satisfaction_comment = comment
    conv.status = "closed"
    conv.ended_at = timezone.now()

    # Resolution tracking: determine how the conversation was resolved
    if conv.resolution_method == "unknown":
        if Ticket.objects.filter(conversation=conv).exists() or conv.meta.get("escalation_recommended"):
            conv.resolution_method = "escalated"
        elif stars and stars >= 3:
            conv.resolution_method = "ai_resolved"
        elif stars and stars < 3:
            conv.resolution_method = "abandoned"
        else:
            conv.resolution_method = "ai_resolved"

    conv.save()

    Message.objects.create(
        conversation=conv,
        role="system",
        content=f"Conversation ended — rating {stars}/5",
        meta={"type": "rating"},
    )

    return JsonResponse(
        {
            "conversation_id": str(conv.id),
            "status": conv.status,
            "satisfaction": {"stars": stars, "comment": comment},
        }
    )


@csrf_exempt
@require_POST
def ai_ask(request):
    """
    ENHANCED VERSION - Leverages new refactored worker features
    
    New features:
    1. Uses 'verdict' field for smarter routing
    2. Tracks 'context' (detected module) for analytics
    3. Returns 'next_question' for better UX
    4. Smarter auto-escalation based on severity + confidence
    5. Better metadata tracking
    6. Vision analysis support for screenshots
    """
    import sys
    print(f"[DEBUG] ai_ask: Authenticating request", file=sys.stderr)
    actor = get_request_user_or_widget(request)
    if actor is None:
        print(f"[DEBUG] ai_ask: Authentication failed, returning 401", file=sys.stderr)
        return JsonResponse({"error": "unauthorized"}, status=401)
    print(f"[DEBUG] ai_ask: Authenticated as {actor.username}", file=sys.stderr)

    payload = json.loads(request.body.decode("utf-8"))
    message = (payload.get("message") or "").strip()
    conversation_id = payload.get("conversation_id")
    confirm_escalation = bool(payload.get("confirm_escalation", False))
    image = payload.get("image")  # NEW: Base64 image from screenshot upload

    if not conversation_id:
        return JsonResponse({"error": "conversation_required"}, status=400)

    try:
        conv = Conversation.objects.get(id=conversation_id, user=actor)
    except Conversation.DoesNotExist:
        return JsonResponse({"error": "conversation_not_found"}, status=404)

    # Store user message
    msg = Message.objects.create(
        conversation=conv, 
        role="user", 
        content=message,
        meta={"has_image": bool(image)} if image else {}
    )

    # P0 #6: Check for incident correlation on user messages
    _check_incident_correlation(conv, message, conv.tenant_id)

    # Get conversation history
    history = get_recent_history(conv)

    # Call refactored worker with image support
    try:
        worker_payload = {
            "message": message,
            "history": history,
            "tenant_id": conv.tenant_id,
        }
        # NEW: Pass image to worker if available
        if image:
            worker_payload["image"] = image
            
        r = requests.post(
            f"{settings.CF_WORKER_URL}/chat",
            json=worker_payload,
            timeout=25,
        )
        data = r.json()
    except Exception as e:
        # Fallback error response
        data = {
            "answer": "Erreur service. Voulez-vous escalader pour créer un ticket ?",
            "mode": "escalate",
            "verdict": "tiktak_side",
            "signals": {
                "confidence": 0.0,
                "severity": "critical",
                "category": "general",
                "sentiment": "frustrated",
                "escalation_recommended": True,
            },
        }

    # Extract fields with safe defaults
    answer = data.get("answer", "")
    signals = data.get("signals") or {}

    # ENHANCEMENT 1: Use verdict field for better logic
    verdict = data.get("verdict", "unclear")  # NEW: user_side/tiktak_side/unclear
    
    confidence = float(signals.get("confidence", 0.5)) if isinstance(signals, dict) else 0.5
    severity = (signals.get("severity", "low") if isinstance(signals, dict) else "low")
    category = (signals.get("category", "general") if isinstance(signals, dict) else "general")
    sentiment = (signals.get("sentiment", "calm") if isinstance(signals, dict) else "calm")
    escalation_recommended = bool(signals.get("escalation_recommended", False)) if isinstance(signals, dict) else False

    # ENHANCEMENT 2: Extract new fields
    detected_module = data.get("context", "general")  # NEW: Detected module (scanner, shipments, etc.)
    next_question = data.get("next_question")  # NEW: Single focused follow-up question
    
    # ENHANCEMENT 3: Smarter auto-escalation logic
    # Auto-escalate if:
    # 1. User confirmed, OR
    # 2. Critical severity, OR
    # 3. High severity + low confidence, OR
    # 4. Verdict indicates TikTak issue with high confidence
    auto_escalate = (
        confirm_escalation or
        severity == "critical" or
        (severity == "high" and confidence < 0.6) or
        (verdict == "tiktak_side" and confidence >= 0.75)
    )

    # ENHANCEMENT 4: Use verdict to determine mode if not auto-escalating
    if not auto_escalate:
        if verdict == "tiktak_side":
            mode = "escalate"  # Suggest escalation but don't force
        elif verdict == "unclear":
            mode = "clarify"
        else:  # user_side
            mode = "solve"
    else:
        mode = "escalate"

    # ENHANCEMENT 5: Store enhanced metadata
    Message.objects.create(
        conversation=conv,
        role="assistant",
        content=answer,
        meta={
            "payload": data,
            "confidence": confidence,
            "severity": severity,
            "category": category,
            "sentiment": sentiment,
            "escalation_recommended": escalation_recommended,
            "mode": mode,
            # NEW: Enhanced metadata
            "verdict": verdict,  # Root cause: user_side/tiktak_side/unclear
            "detected_module": detected_module,  # scanner/shipments/auth/etc
            "next_question": next_question,  # Focused follow-up
            "evidence_count": len(data.get("evidence") or []),
            "processing_time_ms": data.get("processing_time_ms"),
            "ticket_type": data.get("ticket_type"),
            "detected_language": data.get("detected_language"),
        },
    )

    # Update conversation metadata
    conv.meta.update(
        {
            "last_confidence": confidence,
            "severity": severity,
            "category": category,
            "sentiment": sentiment,
            "escalation_recommended": escalation_recommended,
            # NEW: Track module and verdict
            "detected_module": detected_module,
            "verdict": verdict,
        }
    )
    conv.save(update_fields=["meta", "updated_at"])

    # Handle escalation
    ticket_payload = None
    if auto_escalate and conv.status != "escalated":
        # ENHANCEMENT 6: Better priority mapping
        if severity == "critical":
            priority = "critical"
        elif severity == "high":
            priority = "urgent"
        elif severity == "medium":
            priority = "normal"
        else:
            priority = "low"

        ticket = Ticket.objects.create(
            tenant_id=conv.tenant_id,
            user=actor,
            conversation=conv,
            priority=priority,
            category=detected_module,  # Use detected module as category
            evidence={
                "signals": signals,
                "last_user_message": message,
                "verdict": verdict,
                "detected_module": detected_module,
                "worker_evidence": data.get("evidence") or [],
            },
        )

        conv.status = "escalated"
        conv.resolution_method = "escalated"
        conv.save(update_fields=["status", "resolution_method"])

        ticket_payload = {
            "id": str(ticket.id),
            "priority": priority,
            "module": detected_module,
        }

    # ENHANCEMENT 7: Better quality scoring
    quality = "high" if confidence >= 0.75 else "medium" if confidence >= 0.5 else "low"

    # ENHANCEMENT 8: Return enhanced response
    return JsonResponse(
        {
            "conversation_id": str(conv.id),
            "answer": answer,
            "mode": mode,
            "confidence": round(confidence, 2),
            "quality": quality,
            "signals": signals,
            "ticket_type": data.get("ticket_type"),
            "questions": data.get("questions") or [],
            "evidence": data.get("evidence") or [],
            "playbook": data.get("playbook") or None,
            "ui": data.get("ui"),
            "actions": data.get("actions") or [],
            "ticket": ticket_payload,
            # NEW: Enhanced fields
            "next_question": next_question,  # Single focused question
            "verdict": verdict,  # Root cause
            "detected_module": detected_module,  # Module classification
            "context": detected_module,  # Routing context for frontend
            "category": category,  # Category for frontend
            "route_link": data.get("route_link"),  # Direct dashboard URL
        }
    )


# ---------------------------------------------------------------------------
#  P0 #5 — Monitoring / Stats Dashboard
# ---------------------------------------------------------------------------

@csrf_exempt
@require_GET
def ai_stats(request):
    """
    Returns aggregated analytics for the support system.
    Query params: ?period=24h|7d|30d|all  (default: 7d)
    """
    actor = get_request_user_or_widget(request)
    if actor is None:
        return JsonResponse({"error": "unauthorized"}, status=401)

    tenant = resolve_tenant_id(request)
    period = request.GET.get("period", "7d")

    now = timezone.now()
    period_map = {
        "24h": timezone.timedelta(hours=24),
        "7d": timezone.timedelta(days=7),
        "30d": timezone.timedelta(days=30),
    }
    since = now - period_map.get(period, period_map["7d"]) if period != "all" else None

    # Base queryset
    convs = Conversation.objects.filter(tenant_id=tenant)
    msgs = Message.objects.filter(conversation__tenant_id=tenant)
    if since:
        convs = convs.filter(created_at__gte=since)
        msgs = msgs.filter(created_at__gte=since)

    total = convs.count()
    by_status = dict(convs.values_list("status").annotate(c=Count("id")).values_list("status", "c"))
    by_resolution = dict(
        convs.exclude(resolution_method="unknown")
        .values_list("resolution_method")
        .annotate(c=Count("id"))
        .values_list("resolution_method", "c")
    )

    # Satisfaction
    rated = convs.filter(satisfaction_stars__isnull=False)
    avg_stars = rated.aggregate(avg=Avg("satisfaction_stars"))["avg"]
    star_dist = dict(
        rated.values_list("satisfaction_stars").annotate(c=Count("id")).values_list("satisfaction_stars", "c")
    )

    # Module distribution (from meta->detected_module)
    module_counts = {}
    for m in convs.exclude(meta={}).values_list("meta", flat=True):
        mod = m.get("detected_module") if isinstance(m, dict) else None
        if mod:
            module_counts[mod] = module_counts.get(mod, 0) + 1

    # Avg processing time from assistant messages with processing_time_ms
    pt_msgs = msgs.filter(role="assistant", meta__has_key="processing_time_ms")
    # Django JSONField lookup: meta__processing_time_ms exists
    # We'll compute in Python for compatibility
    pt_values = [
        m["processing_time_ms"]
        for m in pt_msgs.values_list("meta", flat=True)
        if isinstance(m, dict) and isinstance(m.get("processing_time_ms"), (int, float))
    ]
    avg_response_ms = round(sum(pt_values) / len(pt_values)) if pt_values else None

    # Escalation rate
    escalated = by_status.get("escalated", 0) + by_resolution.get("escalated", 0)
    escalation_rate = round(escalated / total * 100, 1) if total else 0

    # Severity distribution from conversation meta
    severity_counts = {}
    for m in convs.exclude(meta={}).values_list("meta", flat=True):
        sev = m.get("severity") if isinstance(m, dict) else None
        if sev:
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

    # Sentiment distribution
    sentiment_counts = {}
    for m in convs.exclude(meta={}).values_list("meta", flat=True):
        sent = m.get("sentiment") if isinstance(m, dict) else None
        if sent:
            sentiment_counts[sent] = sentiment_counts.get(sent, 0) + 1

    # Open incidents
    open_incidents = Incident.objects.filter(tenant_id=tenant, status="open").count()

    return JsonResponse({
        "period": period,
        "total_conversations": total,
        "status_breakdown": by_status,
        "resolution_breakdown": by_resolution,
        "satisfaction": {
            "average_stars": round(avg_stars, 2) if avg_stars else None,
            "rated_count": rated.count(),
            "distribution": star_dist,
        },
        "escalation_rate_pct": escalation_rate,
        "avg_response_time_ms": avg_response_ms,
        "module_distribution": module_counts,
        "severity_distribution": severity_counts,
        "sentiment_distribution": sentiment_counts,
        "open_incidents": open_incidents,
    })


# ---------------------------------------------------------------------------
#  P0 #6 — Technical Alerting / Incident Correlation
# ---------------------------------------------------------------------------

ERROR_PATTERNS = [
    "502", "503", "500", "504", "timeout", "panne", "erreur critique",
    "site down", "page blanche", "serveur", "hors ligne",
]
INCIDENT_THRESHOLD = 3        # conversations within window
INCIDENT_WINDOW_HOURS = 1     # time window


def _check_incident_correlation(conversation: Conversation, message_text: str, tenant_id: str):
    """
    Called after each user message. Looks for repeated error patterns
    across recent conversations. Creates/updates Incident if threshold hit.
    """
    text_lower = message_text.lower()
    matched_pattern = None
    for pat in ERROR_PATTERNS:
        if pat in text_lower:
            matched_pattern = pat
            break

    if not matched_pattern:
        return None

    since = timezone.now() - timezone.timedelta(hours=INCIDENT_WINDOW_HOURS)

    # Count distinct conversations reporting similar pattern recently
    # We look in user messages' content
    recent_convs = (
        Message.objects.filter(
            conversation__tenant_id=tenant_id,
            role="user",
            content__icontains=matched_pattern,
            created_at__gte=since,
        )
        .values_list("conversation_id", flat=True)
        .distinct()
    )
    hit_count = len(set(recent_convs))

    if hit_count < INCIDENT_THRESHOLD:
        return None

    # Create or update incident
    incident, created = Incident.objects.get_or_create(
        tenant_id=tenant_id,
        error_pattern=matched_pattern,
        status="open",
        defaults={
            "hit_count": hit_count,
            "severity": "critical" if hit_count >= 5 else "high",
            "conversation_ids": list(set(str(c) for c in recent_convs)),
        },
    )
    if not created:
        incident.hit_count = hit_count
        incident.conversation_ids = list(set(
            incident.conversation_ids + [str(c) for c in recent_convs]
        ))
        incident.severity = "critical" if hit_count >= 5 else "high"
        incident.save()

    return incident


@csrf_exempt
@require_GET
def ai_incidents(request):
    """
    List open/acknowledged incidents. Query: ?status=open|acknowledged|resolved|all
    """
    actor = get_request_user_or_widget(request)
    if actor is None:
        return JsonResponse({"error": "unauthorized"}, status=401)

    tenant = resolve_tenant_id(request)
    status_filter = request.GET.get("status", "open")

    qs = Incident.objects.filter(tenant_id=tenant)
    if status_filter != "all":
        qs = qs.filter(status=status_filter)

    qs = qs.order_by("-last_seen")[:50]

    incidents = [
        {
            "id": str(inc.id),
            "error_pattern": inc.error_pattern,
            "severity": inc.severity,
            "status": inc.status,
            "hit_count": inc.hit_count,
            "first_seen": inc.first_seen.isoformat(),
            "last_seen": inc.last_seen.isoformat(),
            "conversation_ids": inc.conversation_ids,
        }
        for inc in qs
    ]

    return JsonResponse({"incidents": incidents, "count": len(incidents)})


@csrf_exempt
@require_POST
def ai_incident_update(request):
    """
    Acknowledge or resolve an incident.
    Body: { "incident_id": "...", "action": "acknowledge"|"resolve" }
    """
    actor = get_request_user_or_widget(request)
    if actor is None:
        return JsonResponse({"error": "unauthorized"}, status=401)

    payload = json.loads(request.body.decode("utf-8"))
    iid = payload.get("incident_id")
    action = payload.get("action")

    if action not in ("acknowledge", "resolve"):
        return JsonResponse({"error": "invalid_action"}, status=400)

    try:
        inc = Incident.objects.get(id=iid, tenant_id=resolve_tenant_id(request))
    except Incident.DoesNotExist:
        return JsonResponse({"error": "incident_not_found"}, status=404)

    inc.status = "acknowledged" if action == "acknowledge" else "resolved"
    inc.save()

    return JsonResponse({"id": str(inc.id), "status": inc.status})