from django.urls import path
from .views import (
    ai_ask, start_conversation, conversation_history, end_conversation,
    ai_stats, ai_incidents, ai_incident_update,
)

urlpatterns = [
    path("ai/start/", start_conversation),
    path("ai/history/", conversation_history),
    path("ai/end/", end_conversation),
    path("ai/ask/", ai_ask),
    path("ai/stats/", ai_stats),
    path("ai/incidents/", ai_incidents),
    path("ai/incidents/update/", ai_incident_update),
]
