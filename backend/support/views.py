import os
import json
import requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

CF_WORKER_URL = os.getenv(
    "CF_WORKER_URL",
    "https://tiktak-rag-worker.hayouniamine11.workers.dev"
).rstrip("/")


@csrf_exempt
@require_POST
def ai_ask(request):
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"error": "invalid_json"}, status=400)

    message = (payload.get("message") or "").strip()
    tenant_id = payload.get("tenant_id", "tiktak_pro")
    user_id = payload.get("user_id")
    history = payload.get("history") or []

    if not message:
        return JsonResponse({"error": "message is required"}, status=400)

    # Forward to Worker (with history!)
    try:
        r = requests.post(
            f"{CF_WORKER_URL}/chat",
            json={"message": message, "history": history},
            timeout=20,
            headers={"Content-Type": "application/json"},
        )
        data = r.json()
    except Exception as e:
        return JsonResponse(
            {
                "mode": "escalate",
                "reason": "worker_unreachable",
                "error": str(e),
            },
            status=200,
        )

    # Escalation -> create ticket (mock for now)
    if data.get("mode") == "escalate":
        return JsonResponse(
            {
                "mode": "escalate",
                "confidence": data.get("confidence", 0),
                "context": data.get("context"),
                "ticket": {
                    "id": "TCK-001",
                    "status": "open",
                    "priority": "high",
                    "category": data.get("category", "incident"),
                    "tenant_id": tenant_id,
                    "user_id": user_id,
                },
            },
            status=200,
        )

    # clarify / solve
    return JsonResponse(
        {
            "mode": data.get("mode"),
            "confidence": data.get("confidence", 0),
            "context": data.get("context"),
            "questions": data.get("questions"),
            "answer": data.get("answer"),
        },
        status=200,
    )
