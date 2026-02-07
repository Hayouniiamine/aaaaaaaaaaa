from django.urls import path
from .views import ai_ask

urlpatterns = [
    path("ai/ask/", ai_ask),
]
