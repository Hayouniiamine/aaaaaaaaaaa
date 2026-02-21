#!/usr/bin/env python3
"""
TikTak PRO AI Assistant — Conversation Accuracy Test v4
========================================================
Fully grounded in the actual worker source code:
  - detection.ts   → coarse module mapping, keyword detection, language detection
  - governance.ts  → hard escalation patterns, false-positive patterns, emotion patterns
  - helpers.ts     → ROUTE_BY_CONTEXT, DASH_BASE, normalizeSupportResponse output shape
  - routes.ts      → response schema, verdict/mode/escalate relationship
  - prompt.ts      → valid categories, verdict values

CRITICAL FIXES vs v3:
  1. Confidence is at response["signals"]["confidence"] NOT response["confidence"]
     → ECE was 0.0000 because no confidence data was ever read
  2. "domains" maps to "settings" via toCoarseModule() — labeler was wrong
  3. Governance patterns (5xx, site-down) are deterministic overrides — testable exactly
  4. next_question MUST be present when verdict="unclear" → new Gate G
  5. escalate boolean must be consistent with verdict → new Gate H
  6. ticket_type (bug/question/demand/incident) predicted and tested → new Gate F
  7. Language detection tested against detected_language field → new Gate I

NEW METRICS:
  - Governance compliance rate (hard rules honored)
  - False-positive 5xx rate (500-as-quantity NOT escalated)
  - Verdict distribution (tiktak_side/user_side/unclear)
  - Ticket type accuracy
  - Language detection accuracy
  - Confidence ECE (now with real data)

Usage:
    python test_conversations_v4.py
    python test_conversations_v4.py --count 200 --seed 42
    python test_conversations_v4.py --validate-labeler
"""

import json
import time
import random
import os
import sys
import io
import re
import argparse
import hashlib
from datetime import datetime
from collections import defaultdict, Counter
import urllib.request
import urllib.error
import ssl

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── Configuration ─────────────────────────────────────────────────────────────
# Using local development server for testing Phase 1-3 integration
API_URL      = "https://tiktak-rag-worker.hayouniamine11.workers.dev/chat"  # Local development
# Alternative for production: ""
TICKETS_PATH = r"C:\Users\aminh\Desktop\tickets.json"
USE_DEBUG    = True  # Enable debug mode for phase metrics
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
REPORT_PATH      = os.path.join(SCRIPT_DIR, "conversation_test_report_v4.txt")
JSON_REPORT_PATH = os.path.join(SCRIPT_DIR, "conversation_test_report_v4.json")
REGRESSION_PATH  = os.path.join(SCRIPT_DIR, "regression_suite_v4.json")
LABELER_VAL_PATH = os.path.join(SCRIPT_DIR, "labeler_validation_v4.json")

DEFAULT_NUM               = 1000
REQUEST_DELAY             = 0.5
MAX_RETRIES               = 3
RETRY_DELAY               = 8
DEFAULT_SEED              = 2026
GREETING_LIVE_SAMPLE_RATE = 0.10
FOLLOWUP_RATE             = 0.30

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode    = ssl.CERT_NONE


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — Worker Constants (mirrored exactly from source)
# ══════════════════════════════════════════════════════════════════════════════

DASH_BASE = "https://dash.tiktak.space"

# From helpers.ts ROUTE_BY_CONTEXT (exact copy)
ROUTE_BY_CONTEXT: dict[str, str] = {
    "orders":        "/orders",
    "products":      "/products",
    "builder":       "/content-management",
    "settings":      "/settings",
    "shipping":      "/shipping",
    "payments":      "/payments",
    "billing":       "/settings",
    "pos":           "/pos",
    "apps":          "/apps-store",
    "customers":     "/customers",
    "auth":          "/settings",
    "inventory":     "/stock-management",
    "domains":       "/domains",
    "notifications": "/settings",
    "general":       "/settings",
}

VALID_DASH_PATHS = set(ROUTE_BY_CONTEXT.values())

# From detection.ts COARSE_MODULES (exact copy)
VALID_CATEGORIES = {
    "orders", "products", "builder", "settings", "apps", "shipping",
    "payments", "customers", "pos", "billing", "general",
    "technical", "auth", "inventory", "notifications",
}

# Valid verdict values (from prompt.ts and routes.ts)
VALID_VERDICTS  = {"tiktak_side", "user_side", "unclear"}
VALID_MODES     = {"solve", "escalate", "clarify"}
VALID_TKT_TYPES = {"bug", "question", "demand", "incident"}
VALID_SENTIMENTS = {"calm", "frustrated", "urgent", "satisfied"}
VALID_SEVERITIES = {"low", "medium", "high", "critical"}
VALID_LANGS      = {"fr", "ar", "darija", "en"}

# Verdict → mode mapping (from normalizeSupportResponse in helpers.ts)
VERDICT_TO_MODE = {
    "tiktak_side": "escalate",
    "user_side":   "solve",
    "unclear":     "clarify",
}


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — Governance Pattern Replication (from governance.ts)
# These patterns are deterministic overrides in the worker — we can test
# that the AI honors them exactly.
# ══════════════════════════════════════════════════════════════════════════════

# From governance.ts HTTP_5XX_PATTERNS
_HTTP_5XX_PATTERNS = [
    re.compile(r'\b(erreur|error)\s*(5\d\d)\b', re.I),
    re.compile(r'\b(5\d\d)\s*(error|erreur)\b', re.I),
    re.compile(r'\binternal\s*server\s*error\b', re.I),
    re.compile(r'\b(erreur|error)\s*interne\s*(du\s*)?(serveur)?\b', re.I),
    re.compile(r'\bgateway\s*timeout\b', re.I),
    re.compile(r'\bbad\s*gateway\b', re.I),
    re.compile(r'\bservice\s*unavailable\b', re.I),
    re.compile(r'\berreur\s*serveur\b', re.I),
    re.compile(r'\bserver\s*error\b', re.I),
    re.compile(r'\bpanne\s*(syst[eè]me|totale|compl[eè]te|generale|g[eé]n[eé]rale|serveur)?\b', re.I),
    re.compile(r'\b(affiche|montre|donne|appara[iî]t|renvoie|retourne)\s*[\'"]?\s*(erreur\s*)?(500|502|503|504)\b', re.I),
    re.compile(r'\b(500|502|503|504)\b.*\b(quand|when|lorsque|lors)\b', re.I),
    re.compile(r'\btimeout\b.*\b(serveur|server)\b', re.I),
    re.compile(r'\b(serveur|server)\b.*\btimeout\b', re.I),
    re.compile(r'\b50[0234]\s*(error|erreur)\b', re.I),
]

# From governance.ts HTTP_FALSE_POSITIVE_PATTERNS
_HTTP_FALSE_POSITIVE_PATTERNS = [
    re.compile(r'\b500\s*(produits?|articles?|commandes?|clients?|items?|r[eé]f[eé]rences?|SKU|fiches?|pages?|variantes?)\b', re.I),
    re.compile(r'\b(plan|forfait|pack|limite|capacite|jusqua|maximum|max)\b.*\b500\b', re.I),
    re.compile(r'\b500\b.*\b(plan|forfait|pack|limite|capacit[eé])\b', re.I),
    re.compile(r'\b(importer|ajouter|avoir|cr[eé]er|g[eé]rer|supporter)\s+500\b', re.I),
    re.compile(r'\b500\s*(dinars?|dt|tnd|euros?|eur|dollars?|usd)\b', re.I),
]

# From governance.ts SITE_DOWN_PATTERNS
_SITE_DOWN_PATTERNS = [
    re.compile(r'\b(site|lien|boutique|page|dashboard|tableau de bord)\b.*\bne\s+(fonctionne|marche)\s+pas\b', re.I),
    re.compile(r'\bne\s+(fonctionne|marche)\s+pas\b.*\b(site|lien|boutique|page|dashboard)\b', re.I),
    re.compile(r'\bsite\s*(crash|down|plant[eé]|plante|inaccessible|bloqu[eé]|en panne)\b', re.I),
    re.compile(r'\b(crash|plante|plant[eé])\b.*\b(site|page|boutique|dashboard)\b', re.I),
    re.compile(r'\bsite\s+ne\s+(souvre|s.ouvre|charge|r[e00e9]pond|repond)\s+pas\b', re.I),
]

# Emotion patterns (high-score = triggers escalation)
_EMOTION_ESCALATION_PATTERNS = [
    re.compile(r'\b(je veux|je demande|je souhaite)\s+(parler|voir|contacter)\s+([aà])?\s*(un|le|la|au)\s*(responsable|manager|superviseur|directeur)', re.I),
    re.compile(r'\bparler\s+([aà])\s+(un\s*)?(responsable|manager|superviseur|directeur)', re.I),
    re.compile(r'\binacceptable\b|\bscandale\b|\bscandaleux\b|\bhonteux\b', re.I),
    re.compile(r'\bremboursez[- ]?moi\b', re.I),
    re.compile(r'\bj.en ai marre\b|\bras[- ]le[- ]bol\b', re.I),
    re.compile(r'\bmon\s+(business|boutique|site)\s+ne\s+(marche|fonctionne)\s+plus\b', re.I),
]

# Greeting detection (replicated from detection.ts isGreetingOnly)
_GREETING_WORDS = {"salut", "bonjour", "hello", "hi", "hey", "salam", "slm", "bsr", "bonsoir", "cc", "coucou", "wesh"}
_GREETING_CONTENT_WORDS = re.compile(
    r'\b(commande|produit|livraison|paiement|domaine|erreur|probl[eè]m|site|stock|aide|comment|marche pas|fonctionne|bug|bloqu|template|ssl|dns|import|activ|factur|abonn)\b',
    re.I
)

def _is_greeting_only(msg: str) -> bool:
    lower = msg.lower().strip()
    words = lower.split()
    if len(words) > 4:
        return False
    if len(words) > 2 and _GREETING_CONTENT_WORDS.search(lower):
        return False
    return any(lower == g or lower.startswith(g + " ") or lower.endswith(" " + g) for g in _GREETING_WORDS)

def check_governance(text: str) -> dict:
    """
    Replicate the governance.ts decision table.
    Returns what the worker SHOULD deterministically do.
    """
    # Check false-positive first
    is_false_positive = any(p.search(text) for p in _HTTP_FALSE_POSITIVE_PATTERNS)
    
    # Check 5xx
    is_5xx = not is_false_positive and any(p.search(text) for p in _HTTP_5XX_PATTERNS)
    
    # Check site-down
    is_site_down = not is_false_positive and not is_5xx and any(p.search(text) for p in _SITE_DOWN_PATTERNS)
    
    # Check emotion escalation
    is_emotion_escalation = any(p.search(text) for p in _EMOTION_ESCALATION_PATTERNS)

    if is_5xx:
        return {
            "tag": "http_5xx",
            "must_escalate": True,
            "must_category": "technical",
            "must_verdict": "tiktak_side",
            "must_severity": "critical",
            "must_ticket_type": "incident",
        }
    if is_site_down:
        return {
            "tag": "site_down",
            "must_escalate": True,
            "must_category": "technical",
            "must_verdict": "tiktak_side",
            "must_severity": "high",
            "must_ticket_type": None,
        }
    if is_false_positive:
        return {"tag": "http_false_positive", "must_escalate": False}
    if is_emotion_escalation:
        return {"tag": "emotion", "must_escalate": True, "must_verdict": "tiktak_side"}
    
    return {"tag": "none"}


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — Language Detection (replicated from detection.ts detectLanguage)
# ══════════════════════════════════════════════════════════════════════════════

def detect_language(msg: str) -> str:
    m = (msg or "").strip()
    if re.search(r'[\u0600-\u06FF]', m):
        return "ar"
    if re.search(r'\b(y7el|5alas|ma5dem|matet3ada|7alit|wesh|bech|chnou|kifech|3lech|ya5i)\b', m, re.I):
        return "darija"
    if re.search(r'\b(the|is|are|have|this|that|with|from|what|where|when|how|please|help)\b', m, re.I):
        return "en"
    return "fr"


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — Module Detection (replicated from detection.ts toCoarseModule)
# ══════════════════════════════════════════════════════════════════════════════

# Exact synonym map from detection.ts toCoarseModule
_COARSE_MAP = {
    "templates": "builder", "template": "builder", "content": "builder",
    "contents": "builder", "cms": "builder", "pages": "builder",
    "page": "builder", "navigation": "builder", "theme": "builder",
    "themes": "builder", "design": "builder", "seo": "builder",
    "domain": "settings", "domains": "settings", "dns": "settings",
    "ssl": "settings", "configuration": "settings", "config": "settings",
    "login": "auth", "password": "auth", "otp": "auth", "connexion": "auth",
    "2fa": "auth",
    "notifications": "notifications", "notification": "notifications",
    "alerte": "notifications", "alertes": "notifications", "sms": "notifications",
    "payment": "payments", "paiement": "payments", "carte": "payments",
    "transaction": "payments", "stripe": "payments",
    "invoice": "billing", "invoices": "billing", "facturation": "billing",
    "facture": "billing", "abonnement": "billing", "subscription": "billing",
    "order": "orders", "commande": "orders", "checkout": "orders",
    "cart": "orders", "panier": "orders",
    "product": "products", "catalog": "products", "catalogue": "products",
    "sku": "products", "category": "products", "categories": "products",
    "collection": "products", "collections": "products",
    "inventory": "inventory", "inventaire": "inventory",
    "stock": "inventory", "rupture": "inventory",
    "delivery": "shipping", "carrier": "shipping", "livraison": "shipping",
    "expédition": "shipping", "expedition": "shipping", "scanner": "shipping",
    "douchette": "shipping", "manifeste": "shipping", "colis": "shipping",
    "customer": "customers", "client": "customers", "clients": "customers",
    "utilisateur": "customers",
    "api": "apps", "integration": "apps", "app": "apps",
    "application": "apps", "applications": "apps", "module": "apps",
    "webhook": "apps", "pixel": "apps", "facebook": "apps",
    "caisse": "pos", "point de vente": "pos", "magasin": "pos",
    "technical": "technical", "bug": "technical",
    "incident": "technical", "crash": "technical", "panne": "technical",
    "support": "general", "ticket": "general", "réclamation": "general",
}

def to_coarse_module(raw: str) -> str:
    v = (raw or "").strip().lower()
    if not v or v == "unclear":
        return "general"
    if v in VALID_CATEGORIES:
        return v
    return _COARSE_MAP.get(v, "general")

# Keyword lists from detection.ts detectPreferredModule (abbreviated — top keywords per module)
_MODULE_KEYWORDS: dict[str, list[str]] = {
    "orders": [
        "commande", "order", "annuler", "annulation", "remboursement",
        "suivi commande", "numéro de commande", "panier", "checkout",
        "code promo", "coupon", "retour échange", "échange",
    ],
    "builder": [
        "template", "thème", "design", "menu", "navigation", "contenu",
        "seo", "header", "footer", "bannière", "section", "bloc",
        "page d'accueil", "accueil", "homepage", "couleur", "logo",
        "favicon", "css", "apparence", "verrouillé", "verrouillage",
        "builder bloqué", "custom code", "landing page", "landing",
    ],
    "products": [
        "produit", "product", "sku", "catalogue", "variante", "variant",
        "collection", "catégorie", "image produit", "photo produit",
        "prix produit", "ajouter produit", "fiche produit",
    ],
    "payments": [
        "paiement", "payment", "carte bancaire", "cb", "visa", "mastercard",
        "refusé paiement", "transaction", "stripe", "konnect", "flouci",
        "tpe en ligne",
    ],
    "billing": [
        "facture tiktak", "abonnement", "forfait", "renouvellement",
        "plan", "upgrade", "facturation", "commissions tiktak",
    ],
    "shipping": [
        "livraison", "livreur", "expédition", "carrier", "transporteur",
        "aramex", "mylerz", "douchette", "scanner", "colis",
        "manifeste", "frais de livraison", "livraison gratuite",
    ],
    "settings": [
        "domaine", "domain", "dns", "ssl", "certificat", "cloudflare",
        "nom de domaine", "paramètre", "configuration", "réglage",
    ],
    "apps": [
        "application", "module", "pixel", "facebook pixel",
        "google analytics", "gtm", "api", "webhook", "intégration",
        "shopify", "apps store",
    ],
    "customers": [
        "client", "customer", "utilisateur", "compte client",
        "profil client", "réclamation client",
    ],
    "inventory": [
        "stock", "inventaire", "rupture", "quantité disponible",
        "synchronisation stock",
    ],
    "pos": [
        "pos", "point de vente", "caisse", "vente boutique",
        "vente physique", "ticket de caisse",
    ],
    "auth": [
        "connexion", "login", "mot de passe", "password", "otp",
        "2fa", "session expirée", "réinitialiser", "activation compte",
    ],
    "notifications": [
        "notification", "email automatique", "alerte", "email notification",
        "email transactionnel",
    ],
    "technical": [
        "erreur 500", "erreur 502", "erreur 503", "erreur 504",
        "internal server error", "erreur serveur", "panne", "crash",
        "site down", "gateway timeout",
    ],
}

def detect_module_from_text(text: str) -> tuple[str, float]:
    """Replicate detection.ts detectPreferredModule keyword logic."""
    lower = text.lower()
    scores: dict[str, float] = {}
    for module, keywords in _MODULE_KEYWORDS.items():
        for kw in keywords:
            if kw in lower:
                scores[module] = scores.get(module, 0) + 1.0
    
    if not scores:
        return "general", 0.0
    
    best = max(scores, key=lambda m: scores[m])
    return best, scores[best]


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — Auto Gold-Set Labeler (grounded in worker source)
# ══════════════════════════════════════════════════════════════════════════════

# Ticket subject → coarse module (using actual toCoarseModule mappings)
_SUBJECT_TO_MODULE: dict[str, str] = {
    "Commande":                 "orders",
    "Paramétrages":             "settings",
    "Page produits":            "products",
    "Website builder":          "builder",
    "Produits":                 "products",
    "Page d'accueil":           "builder",
    "Navigation":               "builder",
    "Applications":             "apps",
    "Paiement en ligne":        "payments",
    "Intégration d'un livreur": "shipping",
    "Checkout":                 "orders",
    "Vente":                    "orders",
    "Stock":                    "inventory",
    "Landing page":             "builder",
    "Statistique":              "apps",
    "Clients":                  "customers",
    "Attributs":                "products",
    "Devis":                    "orders",
}

# Ticket type mapping from ticket field values to worker's ticket_type values
_TICKET_TYPE_MAP: dict[str, list[str]] = {
    "Critical":  ["incident", "bug"],
    "Blocking":  ["bug", "incident"],
    "Problem":   ["bug"],
    "Question":  ["question"],
    "Demande":   ["demand", "question"],
    "Autre":     ["question", "demand"],
}

def auto_label_ticket(ticket: dict) -> dict:
    """
    Ground-truth labeler using worker source knowledge.
    
    MEASUREMENT ERROR NOTE:
    - Module accuracy validated against hand-labeled set (see validate_labeler())
    - Governance-triggered tickets (5xx, site-down) have DETERMINISTIC expected outputs
      from governance.ts — those are ground truth, not estimates
    """
    desc        = (ticket.get("description", "") + " " + ticket.get("title", "")).strip()
    subject     = ticket.get("subject", "Autre")
    ticket_type = ticket.get("ticket_type", "Question")

    # ── Module prediction ──
    # Use keyword detection (primary) + subject hint (secondary)
    kw_module, kw_score = detect_module_from_text(desc)
    subj_module = _SUBJECT_TO_MODULE.get(subject, "general")
    
    if kw_score >= 2.0:
        # Strong keyword signal — trust it
        expected_modules = [kw_module]
        if subj_module != kw_module and subj_module != "general":
            expected_modules.append(subj_module)
    elif kw_score >= 1.0:
        # Weak keyword signal — blend with subject
        expected_modules = list(dict.fromkeys([kw_module, subj_module]))
    else:
        # No keyword signal — rely on subject
        expected_modules = [subj_module] if subj_module != "general" else ["general"]

    accept_any_module = subject == "Autre" and not kw_score

    # ── Governance check (DETERMINISTIC — highest confidence) ──
    gov = check_governance(desc)
    governance_tag = gov.get("tag", "none")
    
    is_governed = governance_tag in ("http_5xx", "site_down", "emotion")
    is_false_positive = governance_tag == "http_false_positive"

    if gov.get("must_category"):
        expected_modules = [gov["must_category"]]
        accept_any_module = False

    # ── Verdict prediction ──
    # Governed tickets have deterministic verdicts
    if gov.get("must_verdict"):
        expected_verdicts = [gov["must_verdict"]]
    else:
        desc_len = len(desc.strip())
        is_vague = desc_len < 30 or desc.strip() in (".", "probleme", "urgent", "aide")
        expected_verdicts = ["unclear", "user_side"] if is_vague else ["user_side", "unclear"]

    # ── Escalation prediction ──
    if gov.get("must_escalate") is True:
        must_escalate = True
    elif is_false_positive or gov.get("must_escalate") is False:
        must_escalate = False
    else:
        must_escalate = None  # not predictable without more context

    # ── Ticket type prediction ──
    expected_ticket_types = _TICKET_TYPE_MAP.get(ticket_type, ["question"])
    if gov.get("must_ticket_type"):
        expected_ticket_types = [gov["must_ticket_type"]]

    # ── Language prediction ──
    expected_language = detect_language(desc)

    # ── Severity prediction ──
    if gov.get("must_severity"):
        expected_severities = [gov["must_severity"]]
    elif ticket_type == "Critical":
        expected_severities = ["critical", "high"]
    elif ticket_type == "Blocking":
        expected_severities = ["high", "critical", "medium"]
    elif ticket_type == "Problem":
        expected_severities = ["medium", "high", "low"]
    else:
        expected_severities = ["low", "medium"]

    return {
        "expected_modules":       expected_modules,
        "accept_any_module":      accept_any_module,
        "expected_verdicts":      expected_verdicts,
        "must_escalate":          must_escalate,
        "must_not_escalate":      is_false_positive,
        "expected_ticket_types":  expected_ticket_types,
        "expected_language":      expected_language,
        "expected_severities":    expected_severities,
        "governance_tag":         governance_tag,
        "is_governed":            is_governed,
        "is_false_positive":      is_false_positive,
        "desc_length":            len(desc),
    }


# ── Hand-labeled micro-set for labeler self-validation ────────────────────────
# Format: (ticket_dict, expected_module, expected_verdict_0, must_escalate)
HAND_LABELED_SET = [
    (
        {"description": "Mon domaine .tn ne se connecte pas au dashboard",
         "title": "", "subject": "Paramétrages", "ticket_type": "Problem"},
        "settings", "user_side", None
    ),
    (
        {"description": "Je veux ajouter une variante couleur sur mon produit",
         "title": "", "subject": "Produits", "ticket_type": "Question"},
        "products", "user_side", None
    ),
    (
        {"description": "Commande #12450 jamais expédiée",
         "title": "", "subject": "Commande", "ticket_type": "Problem"},
        "orders", "user_side", None
    ),
    (
        {"description": "site verrouillé je peux plus éditer",
         "title": "", "subject": "Website builder", "ticket_type": "Blocking"},
        "builder", "user_side", None
    ),
    (
        {"description": "erreur 500 sur mon site je peux rien faire",
         "title": "", "subject": "Paramétrages", "ticket_type": "Critical"},
        "technical", "tiktak_side", True  # DETERMINISTIC via governance
    ),
    (
        {"description": "paiement konnect refusé lors du checkout",
         "title": "", "subject": "Paiement en ligne", "ticket_type": "Problem"},
        "payments", "user_side", None
    ),
    (
        {"description": ".",
         "title": "urgent", "subject": "Autre", "ticket_type": "Question"},
        "general", "unclear", None
    ),
    (
        {"description": "comment activer le scanner douchette pour aramex",
         "title": "", "subject": "Intégration d'un livreur", "ticket_type": "Question"},
        "shipping", "user_side", None
    ),
    (
        {"description": "je veux renouveler mon abonnement pack pro",
         "title": "", "subject": "Paramétrages", "ticket_type": "Question"},
        "billing", "user_side", None
    ),
    (
        {"description": "facebook pixel ne se déclenche pas",
         "title": "", "subject": "Applications", "ticket_type": "Problem"},
        "apps", "user_side", None
    ),
    (
        {"description": "j'ai 500 produits à importer est-ce possible",
         "title": "", "subject": "Produits", "ticket_type": "Question"},
        "products", "user_side", False  # "500" is quantity — should NOT escalate
    ),
    (
        {"description": "service unavailable depuis ce matin impossible de travailler",
         "title": "", "subject": "Autre", "ticket_type": "Critical"},
        "technical", "tiktak_side", True  # DETERMINISTIC
    ),
    (
        {"description": "connexion OTP ne fonctionne pas je reçois pas le code",
         "title": "", "subject": "Paramétrages", "ticket_type": "Problem"},
        "auth", "user_side", None
    ),
    (
        {"description": "stock ne se synchronise plus avec les commandes",
         "title": "", "subject": "Stock", "ticket_type": "Problem"},
        "inventory", "user_side", None
    ),
    (
        {"description": "je veux parler à un responsable c'est inacceptable",
         "title": "", "subject": "Autre", "ticket_type": "Problem"},
        "general", "tiktak_side", True  # emotion escalation
    ),
]


def validate_labeler(verbose: bool = True) -> dict:
    correct_module  = 0
    correct_verdict = 0
    correct_gov_escalate = 0
    gov_total = 0
    details = []

    for ticket, exp_module, exp_verdict, exp_escalate in HAND_LABELED_SET:
        label = auto_label_ticket(ticket)
        
        mod_ok  = exp_module  in label["expected_modules"]
        verd_ok = exp_verdict in label["expected_verdicts"]
        
        # Only check escalation when we have a deterministic expectation
        esc_ok = True
        if exp_escalate is True:
            gov_total += 1
            esc_ok = label.get("must_escalate") is True
            if esc_ok:
                correct_gov_escalate += 1
        elif exp_escalate is False:
            gov_total += 1
            esc_ok = label.get("must_not_escalate") is True or label.get("must_escalate") is False
            if esc_ok:
                correct_gov_escalate += 1

        if mod_ok:  correct_module  += 1
        if verd_ok: correct_verdict += 1

        details.append({
            "desc":             ticket["description"][:60],
            "expected_module":  exp_module,
            "predicted_modules": label["expected_modules"],
            "module_ok":        mod_ok,
            "expected_verdict": exp_verdict,
            "predicted_verdicts": label["expected_verdicts"],
            "verdict_ok":       verd_ok,
            "gov_tag":          label["governance_tag"],
            "escalate_ok":      esc_ok,
        })

    n = len(HAND_LABELED_SET)
    result = {
        "n":                  n,
        "module_acc":         round(correct_module / n, 3),
        "verdict_acc":        round(correct_verdict / n, 3),
        "gov_escalate_acc":   round(correct_gov_escalate / gov_total, 3) if gov_total else 1.0,
        "gov_total":          gov_total,
        "details":            details,
    }

    if verbose:
        ma, va, ga = result["module_acc"], result["verdict_acc"], result["gov_escalate_acc"]
        print()
        print("  ┌──────────────────────────────────────────────────────────────┐")
        print(f"  │ LABELER SELF-VALIDATION ({n} hand-labeled cases)              │")
        print(f"  │ Module: {ma:.0%}  Verdict: {va:.0%}  Gov-Escalate: {ga:.0%} ({gov_total} governed cases)   │")
        if ma < 0.85:
            print(f"  │ ⚠  Gate B has ~{(1-ma):.0%} measurement error                       │")
        print("  └──────────────────────────────────────────────────────────────┘")
        for d in details:
            icons = "✓" if d["module_ok"] and d["verdict_ok"] and d["escalate_ok"] else "~" if d["module_ok"] else "✗"
            print(f"  {icons} [{d['expected_module']:12s}] [{d['gov_tag']:18s}] {d['desc']}")
            if not d["module_ok"]:
                print(f"      Module: expected={d['expected_module']!r} got={d['predicted_modules']}")
            if not d["verdict_ok"]:
                print(f"      Verdict: expected={d['expected_verdict']!r} got={d['predicted_verdicts']}")
        print()

    return result


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — API Client
# ══════════════════════════════════════════════════════════════════════════════

def chat_request(message: str, history=None, state=None, tenant_id: str = "tiktak_pro") -> dict:
    """POST to /chat endpoint with Phase 1-3 debug mode support.
    
    Phase 1-3 metrics extracted when debug=1:
    - _phase1_playbook_top_score: Best playbook relevance (0.0-1.0)
    - _phase2_verdict_pattern_matched: Early verdict from patterns (bool)
    - _phase3_facts_count: Facts confirmed from user (int)
    """
    payload = {
        "message":   message,
        "history":   history or [],
        "tenant_id": tenant_id,
    }
    if state:
        payload["state"] = state

    data = json.dumps(payload).encode("utf-8")
    
    # Add debug flag to URL for Phase 1-3 metrics
    url = API_URL
    if USE_DEBUG:
        separator = "&" if "?" in API_URL else "?"
        url = API_URL + f"{separator}debug=1"
    
    req  = urllib.request.Request(
        url, data=data,
        headers={
            "Content-Type": "application/json",
            "Accept":       "application/json",
            "User-Agent":   "TikTak-TestHarness/4.0",
        },
        method="POST",
    )

    for attempt in range(MAX_RETRIES):
        try:
            t0 = time.time()
            # Skip SSL verification for local development
            ctx = ssl_ctx if "https" in url else None
            with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
                body    = resp.read().decode("utf-8")
                latency = int((time.time() - t0) * 1000)
                result  = json.loads(body)
                result["_client_latency_ms"] = latency
                return result
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(RETRY_DELAY * (attempt + 1))
                continue
            return {"error": f"HTTP {e.code}", "_client_latency_ms": 0}
        except urllib.error.URLError as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(3)
                continue
            return {"error": f"URL: {e.reason}", "_client_latency_ms": 0}
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(3)
                continue
            return {"error": str(e), "_client_latency_ms": 0}

    return {"error": "max_retries_exceeded", "_client_latency_ms": 0}


def extract_confidence(response: dict) -> float:
    """
    CRITICAL FIX: confidence is at response["signals"]["confidence"]
    NOT at response["confidence"] (which doesn't exist at the top level).
    Previous test versions read the wrong field → ECE was always 0.0000.
    """
    # Primary path (normalizeSupportResponse output)
    signals = response.get("signals") or {}
    conf = signals.get("confidence")
    if isinstance(conf, (int, float)) and not isinstance(conf, bool):
        return float(max(0.0, min(1.0, conf)))
    return 0.0


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7 — Semantic Actionability (Gate D)
# ══════════════════════════════════════════════════════════════════════════════

_NAV_VERB_RE = re.compile(
    r"""(?:
        rendez(?:\s*-\s*vous\s+(?:dans|sur|à|vers)?)?
        | allez?\s+(?:dans|sur|à|vers|au|aux)?
        | aller\s+(?:dans|sur|à|vers|au|aux)?
        | accédez?\s+(?:à|au|aux|dans|sur)?
        | accéder\s+(?:à|au|aux|dans|sur)?
        | cliquez?\s+(?:sur)?
        | naviguer?\s+(?:vers|dans|sur)?
        | ouvrez?\s+(?:le|la|les|l')?
        | sélectionner?\s+(?:le|la|les|l')?
    )\s*""",
    re.IGNORECASE | re.VERBOSE,
)

_ACTION_WORDS = [
    "cliqu", "activ", "désactiv", "configur", "vérifi", "accéd",
    "sélection", "ajouter", "créer", "sauvegarder", "modifi",
    "supprim", "navigu", "ouv", "entrez", "rempli", "cochez",
    "appuyez", "renseign", "taper", "copier",
]

def _semantic_actionability(answer: str, mode: str) -> tuple[bool, str]:
    if not answer:
        return False, "Empty answer"
    text = answer.strip()

    if mode == "clarify":
        if "?" not in text:
            return False, "Clarify mode but no question mark"
        if len(text) < 15:
            return False, "Clarify answer too short"
        return True, "Contains question"

    if mode == "escalate":
        return len(text) >= 30, "Escalate answer too short" if len(text) < 30 else "OK"

    # solve mode
    lower = text.lower()
    has_numbered = bool(re.search(r'(?:^|\n)\s*(?:\d+[\.\)]\s|étape\s+\d+)', text, re.MULTILINE))
    has_bullets  = len(re.findall(r'(?:^|\n)\s*[-•]\s*\S.{4,}', text, re.MULTILINE)) >= 2
    has_nav      = bool(_NAV_VERB_RE.search(lower))
    action_hits  = sum(1 for a in _ACTION_WORDS if a in lower)

    if len(text) < 60:
        return False, f"Too short ({len(text)} chars)"

    ok = has_numbered or has_bullets or (has_nav and action_hits >= 2)
    reason = (
        f"numbered={has_numbered}, bullets={has_bullets}, "
        f"nav={has_nav}, actions={action_hits}"
    )
    return ok, reason


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 8 — Hallucination Detection
# ══════════════════════════════════════════════════════════════════════════════

KNOWN_HALLUCINATIONS = {
    "woocommerce", "wordpress", "magento", "prestashop",
    "etsy", "amazon seller", "bigcommerce", "squarespace", "wix",
    # Features that don't exist in TikTak
    "ai assistant settings", "machine learning dashboard", "neural network",
}

def check_hallucinations(answer: str) -> tuple[int, list[str]]:
    if not answer:
        return 0, []
    lower = answer.lower()
    issues = []

    # Competitor platforms (not shopify — it IS mentioned in prompt.ts as a module trigger)
    for fake in KNOWN_HALLUCINATIONS:
        if fake in lower:
            issues.append(f"Referenced non-existent platform: '{fake}'")

    # Dashboard URL validation (only flag clearly wrong paths)
    for url in re.findall(r'https?://[^\s<>"\']+', answer):
        if "tiktak" in url or "dash." in url:
            path = url.replace(DASH_BASE, "").split("?")[0].split("#")[0]
            if path and path != "/":
                is_valid = path in VALID_DASH_PATHS or any(
                    path.startswith(vp + "/") for vp in VALID_DASH_PATHS
                )
                if not is_valid:
                    issues.append(f"Invalid dashboard URL path: '{path}'")

    return len(issues), issues


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 9 — Follow-up Generator (deterministic)
# ══════════════════════════════════════════════════════════════════════════════

def generate_ticket_followup(ticket: dict, ai_response: dict) -> str:
    desc   = ticket.get("description", "").strip()
    mode   = (ai_response.get("mode") or "")
    answer = (ai_response.get("answer") or "")

    if mode == "clarify" or (answer and "?" in answer[-120:]):
        if any(w in desc.lower() for w in ["domaine", "domain", ".tn", ".com"]):
            return f"Mon domaine est {ticket.get('company_name', 'example')}.tn"
        if re.search(r"commande|order", desc, re.I):
            return "Le numéro de commande est #98765432"
        if re.search(r"erreur|error|bug", desc, re.I):
            return "L'erreur affichée est: 'Une erreur s'est produite, veuillez réessayer'"
        return "Je suis sur le dashboard TikTak, j'ai les droits admin"

    templates = [
        "J'ai essayé mais ça ne marche toujours pas, que faire?",
        "D'accord, mais comment je fais exactement la première étape?",
        "Je suis dans le dashboard mais je ne trouve pas cette option",
        "Et si ça persiste après ces étapes, quelle est la suite?",
    ]
    idx = int(hashlib.md5(str(ticket.get("id", "0")).encode()).hexdigest(), 16) % len(templates)
    return templates[idx]


def evaluate_followup(response: dict, prev_answer: str) -> bool:
    if "error" in response:
        return False
    answer = response.get("answer", "")
    if len(answer) < 20:
        return False
    if any(w in answer.lower() for w in ["je suis ton assistant", "décris-moi ton problème"]):
        return False
    # Check for verbatim repetition
    if prev_answer and len(answer) > 50:
        prev_w = set(prev_answer.lower().split())
        curr_w = set(answer.lower().split())
        if prev_w and curr_w:
            overlap = len(prev_w & curr_w) / max(len(prev_w), len(curr_w))
            if overlap > 0.88:
                return False
    return True


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 10 — ConversationResult & Evaluators
# ══════════════════════════════════════════════════════════════════════════════

class ConversationResult:
    def __init__(self, ticket: dict):
        self.ticket_id   = ticket.get("id", "?")
        self.subject     = ticket.get("subject", "?")
        self.ticket_type = ticket.get("ticket_type", "?")
        self.company     = ticket.get("company_name", "?")
        self.user_message = (ticket.get("description", "") or ticket.get("title", ""))[:200]
        self.gold        = auto_label_ticket(ticket)

        # ── Pass/Fail Gates ──
        # A: Verdict correct (tiktak_side/user_side/unclear)
        self.gate_a_verdict   = None
        # B: Category correct (module)
        self.gate_b_module    = None
        # C: No hallucination
        self.gate_c_no_halluc = None
        # D: Semantic actionability
        self.gate_d_actionable = None
        self.gate_d_reason     = ""
        # E: Governance compliance (hard rules honored)
        self.gate_e_governance = None
        # F: Ticket type prediction accuracy
        self.gate_f_ticket_type = None
        # G: next_question present when verdict=unclear
        self.gate_g_next_question = None
        # H: escalate boolean consistent with verdict
        self.gate_h_escalate_consistent = None
        # I: Language detection accuracy
        self.gate_i_language = None

        # Resolution verdict (primary KPI)
        self.resolved = None

        # Scalar metrics
        self.confidence         = 0.0   # from signals.confidence (FIXED)
        self.confidence_correct = False
        self.severity_match     = False
        self.greeting_ok        = None
        self.followup_context_kept = None
        self.route_link_valid   = False

        # Raw API fields
        self.detected_verdict   = ""
        self.detected_category  = ""
        self.detected_language  = ""
        self.detected_ticket_type = ""
        self.detected_sentiment = ""
        self.detected_severity  = ""
        self.detected_escalate  = None
        self.processing_time_ms = 0

        # Phase 1-3 Enhancement Metrics (NEW)
        self.phase1_playbook_score = 0.0      # Top playbook relevance (0.0-1.0)
        self.phase2_pattern_matched = False   # Pattern verdict found (bool)
        self.phase3_facts_count = 0           # Facts confirmed (int)
        self.phase1_enabled = False
        self.phase2_enabled = False
        self.phase3_enabled = False

        self.hallucinations = []
        self.phases         = []
        self.errors         = []

    @property
    def gates_passed(self) -> int:
        # Core gates: A, B, C, D (resolve gates)
        return sum(1 for g in [self.gate_a_verdict, self.gate_b_module,
                                self.gate_c_no_halluc, self.gate_d_actionable]
                   if g is True)

    @property
    def gates_total(self) -> int:
        return 4

    @property
    def weighted_score(self) -> float:
        p_score = self._problem_score()
        has_followup = any(p["phase"] == "followup" for p in self.phases)
        g_score = 100 if self.greeting_ok else (50 if self.greeting_ok is None else 0)
        if has_followup:
            f_score = 100 if self.followup_context_kept else 0
            return g_score * 0.05 + p_score * 0.80 + f_score * 0.15
        return g_score * 0.05 + p_score * 0.95

    def _problem_score(self) -> float:
        score = 0
        # A: verdict (25 pts)
        if self.gate_a_verdict:           score += 25
        # B: module (20 pts)
        if self.gate_b_module is True:    score += 20
        elif self.gate_b_module is None:  score += 12
        # C: no hallucination (20 pts)
        if self.gate_c_no_halluc is True: score += 20
        elif self.gate_c_no_halluc is None: score += 10
        # D: actionable (20 pts)
        if self.gate_d_actionable:        score += 20
        # E: governance (10 pts)
        if self.gate_e_governance is True: score += 10
        elif self.gate_e_governance is None: score += 5
        # F: ticket type (5 pts)
        if self.gate_f_ticket_type:       score += 5
        return score

    def to_dict(self) -> dict:
        return {
            "ticket_id":    self.ticket_id,
            "subject":      self.subject,
            "ticket_type":  self.ticket_type,
            "company":      self.company,
            "user_message": self.user_message,
            "gold":         self.gold,
            "gates": {
                "A_verdict":          self.gate_a_verdict,
                "B_module":           self.gate_b_module,
                "C_no_hallucination": self.gate_c_no_halluc,
                "D_actionable":       self.gate_d_actionable,
                "E_governance":       self.gate_e_governance,
                "F_ticket_type":      self.gate_f_ticket_type,
                "G_next_question":    self.gate_g_next_question,
                "H_escalate_consistent": self.gate_h_escalate_consistent,
                "I_language":         self.gate_i_language,
                "passed_core":        self.gates_passed,
                "total_core":         self.gates_total,
            },
            "detected": {
                "verdict":      self.detected_verdict,
                "category":     self.detected_category,
                "language":     self.detected_language,
                "ticket_type":  self.detected_ticket_type,
                "sentiment":    self.detected_sentiment,
                "severity":     self.detected_severity,
                "escalate":     self.detected_escalate,
                "confidence":   self.confidence,
            },
            "resolved":               self.resolved,
            "weighted_score":         round(self.weighted_score, 1),
            "confidence_correct":     self.confidence_correct,
            "severity_match":         self.severity_match,
            "greeting_ok":            self.greeting_ok,
            "followup_context_kept":  self.followup_context_kept,
            "route_link_valid":       self.route_link_valid,
            "hallucinations":         self.hallucinations,
            "processing_time_ms":     self.processing_time_ms,
            "gate_d_reason":          self.gate_d_reason,
            "phases":                 self.phases,
            "errors":                 self.errors,
            "phase1_3_metrics": {
                "phase1_playbook_score":  round(self.phase1_playbook_score, 3),
                "phase2_pattern_matched": self.phase2_pattern_matched,
                "phase3_facts_count":     self.phase3_facts_count,
                "enabled": {
                    "phase1": self.phase1_enabled,
                    "phase2": self.phase2_enabled,
                    "phase3": self.phase3_enabled,
                }
            },
        }


def evaluate_greeting(response: dict) -> bool:
    if "error" in response:
        return False
    answer = response.get("answer", "")
    cat    = response.get("category", "")
    has_greeting = any(w in answer.lower() for w in
                       ["salut", "bonjour", "bienvenue", "aide", "assistant", "👋", "salam"])
    has_invite   = any(w in answer.lower() for w in
                       ["problème", "question", "aide", "décris", "help"])
    return has_greeting and has_invite and cat == "general" and len(answer) > 15


def evaluate_problem(response: dict, gold: dict) -> dict:
    r: dict = {
        "gate_a_verdict":          False,
        "gate_b_module":           None,
        "gate_c_no_halluc":        True,
        "gate_d_actionable":       False,
        "gate_d_reason":           "",
        "gate_e_governance":       None,
        "gate_f_ticket_type":      False,
        "gate_g_next_question":    None,
        "gate_h_escalate_consistent": True,
        "gate_i_language":         False,
        "confidence":              0.0,
        "confidence_correct":      False,
        "severity_match":          False,
        "route_link_valid":        False,
        "hallucinations":          [],
        "issues":                  [],
    }

    if "error" in response:
        r["issues"].append(f"API error: {response.get('error', '')}")
        r["gate_c_no_halluc"] = None
        r["gate_e_governance"] = None
        return r

    answer       = response.get("answer", "")
    verdict      = (response.get("verdict") or "").lower()
    category     = (response.get("category") or "").lower()
    mode         = (response.get("mode") or "").lower()
    escalate     = response.get("escalate", False)
    next_question = response.get("next_question")
    ticket_type  = (response.get("ticket_type") or "").lower()
    severity     = (response.get("severity") or "").lower()
    detected_lang = (response.get("detected_language") or "").lower()
    route_link   = (response.get("route_link") or "")

    # Confidence — CORRECT PATH: signals.confidence
    r["confidence"] = extract_confidence(response)
    
    # ── Extract Phase 1-3 Metrics (NEW) ──
    # These come from debug response when debug=1 is passed
    phase1_score = response.get("_phase1_playbook_top_score")
    phase2_matched = response.get("_phase2_verdict_pattern_matched")
    phase3_facts = response.get("_phase3_facts_count")
    
    phase1_enabled = False
    phase2_enabled = False
    phase3_enabled = False
    
    if isinstance(phase1_score, (str, float)):
        phase1_enabled = True
        try:
            r["phase1_score"] = float(phase1_score) if phase1_score else 0.0
        except:
            r["phase1_score"] = 0.0
    
    if isinstance(phase2_matched, bool):
        phase2_enabled = True
        r["phase2_matched"] = phase2_matched
    
    if isinstance(phase3_facts, int):
        phase3_enabled = True
        r["phase3_facts"] = phase3_facts
    
    r["phase1_enabled"] = phase1_enabled
    r["phase2_enabled"] = phase2_enabled
    r["phase3_enabled"] = phase3_enabled

    # ── Gate A: Verdict accuracy ──
    # Verdict is more specific than mode — it's the primary routing signal
    if verdict in gold["expected_verdicts"]:
        r["gate_a_verdict"] = True
    elif mode in [VERDICT_TO_MODE.get(v, "") for v in gold["expected_verdicts"]]:
        # mode matches even if verdict label wrong → partial pass
        r["gate_a_verdict"] = True
        r["issues"].append(f"Verdict '{verdict}' not in expected but mode '{mode}' matches")
    else:
        r["gate_a_verdict"] = False
        r["issues"].append(f"Verdict '{verdict}' (mode='{mode}') not in expected {gold['expected_verdicts']}")

    # ── Gate B: Category (module) accuracy ──
    cat_coarse = to_coarse_module(category)  # normalise synonyms
    if gold["accept_any_module"]:
        r["gate_b_module"] = None if not cat_coarse or cat_coarse == "unclear" else True
    elif cat_coarse in gold["expected_modules"]:
        r["gate_b_module"] = True
    else:
        r["gate_b_module"] = False
        r["issues"].append(f"Category '{category}'→'{cat_coarse}' WRONG, expected {gold['expected_modules']}")

    r["confidence_correct"] = (r["gate_b_module"] in (True, None)) and r["gate_a_verdict"]

    # ── Gate C: No hallucination ──
    h_count, h_details = check_hallucinations(answer)
    r["hallucinations"] = h_details
    if h_count > 0:
        r["gate_c_no_halluc"] = False
        r["issues"].extend(h_details)

    # ── Gate D: Semantic actionability ──
    passes, reason = _semantic_actionability(answer, mode)
    r["gate_d_actionable"] = passes
    r["gate_d_reason"]     = reason
    if not passes:
        r["issues"].append(f"Not actionable: {reason}")

    # ── Gate E: Governance compliance ──
    # DETERMINISTIC: if governance says must_escalate=True, escalate must be True
    gov = gold.get("governance_tag", "none")
    if gov in ("http_5xx", "site_down", "emotion"):
        if gold.get("must_escalate") is True:
            gov_ok = escalate is True and verdict == "tiktak_side"
            r["gate_e_governance"] = gov_ok
            if not gov_ok:
                r["issues"].append(
                    f"Governance [{gov}] requires escalate=True + verdict=tiktak_side, "
                    f"got escalate={escalate} verdict='{verdict}'"
                )
    elif gold.get("is_false_positive"):
        # False-positive 500: must NOT escalate
        gov_ok = escalate is not True
        r["gate_e_governance"] = gov_ok
        if not gov_ok:
            r["issues"].append("False-positive '500' was incorrectly escalated")
    else:
        r["gate_e_governance"] = None  # Not deterministically testable

    # ── Gate F: Ticket type accuracy ──
    if ticket_type in gold["expected_ticket_types"]:
        r["gate_f_ticket_type"] = True
    else:
        r["gate_f_ticket_type"] = False
        r["issues"].append(f"ticket_type '{ticket_type}' not in expected {gold['expected_ticket_types']}")

    # ── Gate G: next_question when verdict=unclear ──
    if verdict == "unclear":
        has_q = bool(next_question and len(next_question.strip()) > 5)
        r["gate_g_next_question"] = has_q
        if not has_q:
            r["issues"].append("verdict=unclear but next_question is missing or empty")
    elif verdict in ("user_side", "tiktak_side"):
        # next_question should be null when verdict != unclear
        if next_question and len((next_question or "").strip()) > 5:
            r["gate_g_next_question"] = False
            r["issues"].append(f"verdict='{verdict}' but next_question is set (should be null)")
        else:
            r["gate_g_next_question"] = True

    # ── Gate H: escalate boolean consistent with verdict ──
    # tiktak_side ↔ escalate=True; user_side ↔ escalate=False; unclear → either
    if verdict == "tiktak_side" and escalate is not True:
        r["gate_h_escalate_consistent"] = False
        r["issues"].append(f"verdict=tiktak_side but escalate={escalate} (should be True)")
    elif verdict == "user_side" and escalate is True:
        r["gate_h_escalate_consistent"] = False
        r["issues"].append(f"verdict=user_side but escalate=True (should be False)")

    # ── Gate I: Language detection ──
    expected_lang = gold.get("expected_language", "fr")
    r["gate_i_language"] = detected_lang == expected_lang
    if not r["gate_i_language"]:
        r["issues"].append(f"Language '{detected_lang}' != expected '{expected_lang}'")

    # ── Secondary: severity ──
    r["severity_match"] = severity in gold["expected_severities"]

    # ── Secondary: route link validity ──
    if route_link:
        if route_link.startswith(DASH_BASE):
            path = route_link.replace(DASH_BASE, "").split("?")[0].split("#")[0]
            r["route_link_valid"] = path in VALID_DASH_PATHS or any(
                path.startswith(vp + "/") for vp in VALID_DASH_PATHS
            )
        elif route_link.startswith("http"):
            r["route_link_valid"] = True
        if not r["route_link_valid"]:
            r["issues"].append(f"Invalid route_link path: {route_link}")

    return r


def determine_resolution(result: "ConversationResult") -> bool:
    """
    Resolved = verdict correct + module correct/neutral + no hallucination + actionable.
    If governed (5xx/site_down): additionally requires governance compliance.
    """
    core = (
        result.gate_a_verdict is True
        and result.gate_b_module is not False
        and result.gate_c_no_halluc is not False
        and result.gate_d_actionable is True
    )
    if not core:
        return False
    if result.gate_e_governance is False:
        return False
    return True


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 11 — Conversation Runner
# ══════════════════════════════════════════════════════════════════════════════

GREETINGS = [
    "Bonjour", "Salut", "Salam", "Bonsoir", "Hello",
    "Salam alaykom", "Bonjour, j'ai besoin d'aide",
    "Salut, j'ai un problème", "Salem",
]

CANONICAL_GREETING_RESPONSE = (
    "Salut 👋 Je suis ton assistant TikTak PRO. "
    "Décris-moi ton problème et je t'aide à le résoudre ! "
    "Si tu as un message d'erreur ou une URL, partage-les pour un diagnostic plus rapide."
)


def _ticket_hash(ticket_id) -> int:
    return int(hashlib.md5(str(ticket_id).encode()).hexdigest(), 16)


def select_tickets(tickets: list, n: int = 1000) -> list:
    """Stratified sampling by subject — reproducible with fixed seed."""
    usable = [t for t in tickets
              if t.get("description", "").strip() and len(t["description"].strip()) > 10]

    by_subject: dict[str, list] = defaultdict(list)
    for t in usable:
        by_subject[t.get("subject", "Autre")].append(t)

    total_usable = len(usable)
    selected, remaining = [], n

    for subject in sorted(by_subject.keys(), key=lambda s: -len(by_subject[s])):
        pool  = by_subject[subject]
        alloc = max(5, int(n * len(pool) / total_usable))
        alloc = min(alloc, remaining, len(pool))
        if alloc <= 0:
            continue
        selected.extend(random.sample(pool, alloc))
        remaining -= alloc
        if remaining <= 0:
            break

    if remaining > 0:
        ids   = {t["id"] for t in selected}
        extra = random.sample(
            [t for t in usable if t["id"] not in ids],
            min(remaining, len(usable) - len(selected))
        )
        selected.extend(extra)

    random.shuffle(selected)
    return selected[:n]


def run_conversation(ticket: dict, idx: int, total: int, live_greeting_indices: set) -> ConversationResult:
    result = ConversationResult(ticket)

    desc         = ticket.get("description", "").strip()
    title        = ticket.get("title", "").strip()
    user_message = desc if len(desc) > 15 else f"{title}. {desc}"

    history: list = []
    state   = None

    # ── Phase 1: Greeting ────────────────────────────────────────────────────
    greeting = GREETINGS[_ticket_hash(ticket.get("id", idx)) % len(GREETINGS)]

    if idx in live_greeting_indices:
        time.sleep(REQUEST_DELAY)
        resp_g = chat_request(greeting, [], None)
        result.greeting_ok = evaluate_greeting(resp_g)
        greeting_ai = resp_g.get("answer", CANONICAL_GREETING_RESPONSE)
        if "error" in resp_g:
            result.errors.append(f"Greeting error: {resp_g['error']}")
    else:
        result.greeting_ok = True
        greeting_ai        = CANONICAL_GREETING_RESPONSE

    result.phases.append({
        "phase":    "greeting",
        "user_msg": greeting,
        "ok":       result.greeting_ok,
        "live":     idx in live_greeting_indices,
        "ai_answer": greeting_ai[:200],
    })
    history.append({"role": "user",      "content": greeting})
    history.append({"role": "assistant", "content": greeting_ai})

    # ── Phase 2: Problem ─────────────────────────────────────────────────────
    time.sleep(REQUEST_DELAY)
    resp2 = chat_request(user_message, history, state)
    eval2 = evaluate_problem(resp2, result.gold)

    # Store all gate results
    result.gate_a_verdict            = eval2["gate_a_verdict"]
    result.gate_b_module             = eval2["gate_b_module"]
    result.gate_c_no_halluc          = eval2["gate_c_no_halluc"]
    result.gate_d_actionable         = eval2["gate_d_actionable"]
    result.gate_d_reason             = eval2["gate_d_reason"]
    result.gate_e_governance         = eval2["gate_e_governance"]
    result.gate_f_ticket_type        = eval2["gate_f_ticket_type"]
    result.gate_g_next_question      = eval2["gate_g_next_question"]
    result.gate_h_escalate_consistent = eval2["gate_h_escalate_consistent"]
    result.gate_i_language           = eval2["gate_i_language"]
    result.confidence                = eval2["confidence"]
    result.confidence_correct        = eval2["confidence_correct"]
    result.severity_match            = eval2["severity_match"]
    result.route_link_valid          = eval2["route_link_valid"]
    result.hallucinations            = eval2["hallucinations"]
    result.processing_time_ms        = resp2.get("processing_time_ms", 0) or 0
    
    # Store Phase 1-3 Enhancement Metrics (NEW)
    result.phase1_playbook_score     = eval2.get("phase1_score", 0.0)
    result.phase2_pattern_matched    = eval2.get("phase2_matched", False)
    result.phase3_facts_count        = eval2.get("phase3_facts", 0)
    result.phase1_enabled            = eval2.get("phase1_enabled", False)
    result.phase2_enabled            = eval2.get("phase2_enabled", False)
    result.phase3_enabled            = eval2.get("phase3_enabled", False)

    # Store detected raw values for reporting
    if "error" not in resp2:
        result.detected_verdict     = resp2.get("verdict", "")
        result.detected_category    = resp2.get("category", "")
        result.detected_language    = resp2.get("detected_language", "")
        result.detected_ticket_type = resp2.get("ticket_type", "")
        result.detected_sentiment   = resp2.get("sentiment", "")
        result.detected_severity    = resp2.get("severity", "")
        result.detected_escalate    = resp2.get("escalate")

    result.phases.append({
        "phase":      "problem",
        "user_msg":   user_message[:200],
        "gates":      {k: v for k, v in eval2.items() if k.startswith("gate_")},
        "gate_d_reason": eval2["gate_d_reason"],
        "issues":     eval2["issues"],
        "category":   resp2.get("category", ""),
        "verdict":    resp2.get("verdict", ""),
        "mode":       resp2.get("mode", ""),
        "confidence": eval2["confidence"],
        "escalate":   resp2.get("escalate"),
        "ticket_type": resp2.get("ticket_type", ""),
        "gov_tag":    result.gold.get("governance_tag", "none"),
        "ai_answer":  resp2.get("answer", "")[:300] if "error" not in resp2
                      else f"ERROR: {resp2.get('error')}",
    })

    if "error" not in resp2:
        history.append({"role": "user",      "content": user_message})
        history.append({"role": "assistant", "content": resp2.get("answer", "")})
        state = resp2.get("state")

    # ── Phase 3: Follow-up (deterministic) ───────────────────────────────────
    do_followup = (_ticket_hash(ticket.get("id", idx)) % 100) < int(FOLLOWUP_RATE * 100)

    if do_followup and "error" not in resp2:
        followup = generate_ticket_followup(ticket, resp2)
        time.sleep(REQUEST_DELAY)
        resp3 = chat_request(followup, history, state)
        result.followup_context_kept = evaluate_followup(resp3, resp2.get("answer", ""))

        result.phases.append({
            "phase":        "followup",
            "user_msg":     followup,
            "context_kept": result.followup_context_kept,
            "ai_answer":    resp3.get("answer", "")[:200] if "error" not in resp3
                            else f"ERROR: {resp3.get('error')}",
        })

    result.resolved = determine_resolution(result)

    # ── Progress bar (update every 5% or every 50 tickets) ─────────────────────────
    pct = (idx + 1) / total * 100
    should_update = (idx + 1) % max(50, total // 20) == 0 or (idx + 1) == total
    
    if should_update:
        filled = int(40 * (idx + 1) / total)
        bar = "█" * filled + "░" * (40 - filled)
        res_count = sum(1 for r in [] if getattr(r, 'resolved', False))  # Updated in main loop
        print(
            f"  [{bar}] {pct:5.1f}%  |  {idx+1:4d}/{total}  |  T{result.ticket_id}",
            flush=True
        )

    return result


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 12 — Calibration (ECE)
# ══════════════════════════════════════════════════════════════════════════════

def compute_ece(results: list, n_bins: int = 10) -> float:
    """Expected Calibration Error — uses signals.confidence (the correct field)."""
    bins = [[] for _ in range(n_bins)]
    for r in results:
        if r.confidence <= 0:
            continue
        b = min(int(r.confidence * n_bins), n_bins - 1)
        bins[b].append(r.confidence_correct)

    total = sum(len(b) for b in bins)
    if total == 0:
        return float("nan")

    ece = 0.0
    for i, b in enumerate(bins):
        if not b:
            continue
        acc      = sum(b) / len(b)
        mid_conf = (i + 0.5) / n_bins
        ece     += (len(b) / total) * abs(acc - mid_conf)

    return round(ece, 4)


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 13 — Report Generator
# ══════════════════════════════════════════════════════════════════════════════

def generate_report(results: list, elapsed: float, labeler_val: dict | None = None) -> str:
    L: list[str] = []
    def add(line: str = ""): L.append(line)

    total = len(results)
    if total == 0:
        return "No results."

    add("╔" + "═" * 98 + "╗")
    add("║" + " TIKTAK PRO AI — CONVERSATION ACCURACY TEST v4".ljust(99) + "║")
    add("║" + " Grounded in: detection.ts · governance.ts · helpers.ts · routes.ts · prompt.ts".ljust(99) + "║")
    add("╚" + "═" * 98 + "╝")
    add()
    add(f"  📊 Test Results:     {total} conversations")
    add(f"  ⏱️  Duration:        {elapsed:.0f}s ({elapsed/60:.1f} min)  |  Avg: {elapsed/max(total,1):.1f}s/conv")
    add(f"  🔗 Endpoint:         {API_URL}")
    add(f"  🌱 Seed:            {DEFAULT_SEED}")
    add(f"  📅 Date:            {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    add()

    # ── Labeler validation ──────────────────────────────────────────────────
    if labeler_val:
        ma, va, ga = labeler_val["module_acc"], labeler_val["verdict_acc"], labeler_val["gov_escalate_acc"]
        add()
        add("  AUTO-LABELER VALIDATION (Gate B/A measurement error)")
        add(f"  Module: {ma:.0%}  |  Verdict: {va:.0%}  |  Gov-Escalate: {ga:.0%} ({labeler_val['gov_total']} deterministic cases)")
        if ma < 0.85:
            add(f"  ⚠  Gate B has ~{(1-ma):.0%} error rate — adjust numbers accordingly")
        else:
            add(f"  ✓  Labeler quality acceptable")
    add()

    # ── Primary KPI ─────────────────────────────────────────────────────────
    add("*" * 100)
    add("  PRIMARY KPI — RESOLVED WITHOUT HUMAN INTERVENTION")
    add("*" * 100)

    resolved        = sum(1 for r in results if r.resolved)
    resolution_rate = 100 * resolved / total

    add(f"  Resolved:    {resolved:>5} / {total}  ({resolution_rate:.1f}%)")
    add(f"  Needs Human: {total-resolved:>5} / {total}  ({100-resolution_rate:.1f}%)")
    add()

    # Resolution breakdown by verdict
    by_verdict: dict[str, list] = defaultdict(list)
    for r in results:
        by_verdict[r.detected_verdict or "?"].append(r)

    add(f"  Resolution by verdict:")
    for v in ["user_side", "tiktak_side", "unclear", "?"]:
        rs = by_verdict.get(v, [])
        if not rs:
            continue
        res_pct = 100 * sum(1 for r in rs if r.resolved) / len(rs)
        add(f"    {v:<15} {len(rs):>4} tickets | {sum(1 for r in rs if r.resolved):>4} resolved ({res_pct:.1f}%)")

    # ── Gate pass rates ──────────────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  PASS/FAIL GATES")
    add("-" * 100)

    def gate_stats(attr, label, note=""):
        vals = [getattr(r, attr) for r in results]
        passed  = sum(1 for v in vals if v is True)
        failed  = sum(1 for v in vals if v is False)
        neutral = sum(1 for v in vals if v is None)
        pct = 100 * passed / (passed + failed) if (passed + failed) else 0
        suffix = f"  [{note}]" if note else ""
        add(f"  {label:<50} {passed:>5}/{total}  ({pct:.1f}%){suffix}")
        return passed, failed, neutral

    gate_stats("gate_a_verdict",   "Gate A — Verdict (tiktak_side/user_side/unclear)")
    gate_stats("gate_b_module",    "Gate B — Category (correct module)")
    gate_stats("gate_c_no_halluc", "Gate C — No Hallucination",
               note="excl. governed=None")
    gate_stats("gate_d_actionable","Gate D — Actionable (semantic v3)")
    
    # Gate E — only on governed tickets
    governed = [r for r in results if r.gold.get("is_governed") or r.gold.get("is_false_positive")]
    gov_pass = sum(1 for r in governed if r.gate_e_governance is True)
    gov_fail = sum(1 for r in governed if r.gate_e_governance is False)
    add(f"  {'Gate E — Governance Compliance (governed tickets only)':<50} "
        f"{gov_pass:>5}/{len(governed)}  ({100*gov_pass/max(len(governed),1):.1f}%)")

    gate_stats("gate_f_ticket_type", "Gate F — Ticket Type (bug/question/demand/incident)")
    
    # Gate G — only when verdict is unclear or user_side/tiktak_side
    g_testable = [r for r in results if r.gate_g_next_question is not None]
    g_pass = sum(1 for r in g_testable if r.gate_g_next_question is True)
    add(f"  {'Gate G — next_question when verdict=unclear':<50} "
        f"{g_pass:>5}/{len(g_testable)}  ({100*g_pass/max(len(g_testable),1):.1f}%)")

    gate_stats("gate_h_escalate_consistent", "Gate H — escalate ↔ verdict consistent")
    gate_stats("gate_i_language", "Gate I — Language detection (fr/ar/darija/en)")

    add()
    all_core = sum(1 for r in results if r.gates_passed == r.gates_total)
    add(f"  All core gates (A+B+C+D) pass: {all_core}/{total} ({100*all_core/total:.1f}%)")

    # ── Governance compliance deep-dive ─────────────────────────────────────
    add()
    add("-" * 100)
    add("  GOVERNANCE COMPLIANCE (deterministic override accuracy)")
    add("-" * 100)
    add("  Source: governance.ts decision table — P0=false_positive, P1=5xx, P3=site_down, emotion")
    add()

    by_gov_tag: dict[str, list] = defaultdict(list)
    for r in results:
        by_gov_tag[r.gold.get("governance_tag", "none")].append(r)

    add(f"  {'Gov Tag':<22} {'N':>4} {'Must-Esc':>9} {'AI-Esc%':>8} {'Compliant%':>11} {'Resolved%':>11}")
    add(f"  {'─'*22} {'─'*4} {'─'*9} {'─'*8} {'─'*11} {'─'*11}")
    for tag in ["http_5xx", "site_down", "emotion", "http_false_positive", "none"]:
        rs = by_gov_tag.get(tag, [])
        if not rs:
            continue
        must_esc_count = sum(1 for r in rs if r.gold.get("must_escalate") is True)
        ai_esc_count   = sum(1 for r in rs if r.detected_escalate is True)
        compliant      = sum(1 for r in rs if r.gate_e_governance is True)
        testable       = sum(1 for r in rs if r.gate_e_governance is not None)
        resolved       = sum(1 for r in rs if r.resolved)

        must_str   = f"{must_esc_count}/{len(rs)}"
        ai_pct     = 100 * ai_esc_count / len(rs)
        comp_pct   = 100 * compliant / testable if testable else 0.0
        res_pct    = 100 * resolved / len(rs)

        add(f"  {tag:<22} {len(rs):>4} {must_str:>9} {ai_pct:>7.1f}% {comp_pct:>10.1f}% {res_pct:>10.1f}%")

    fp_tickets = by_gov_tag.get("http_false_positive", [])
    if fp_tickets:
        false_escalated = sum(1 for r in fp_tickets if r.detected_escalate is True)
        add(f"\n  False-positive '500' incorrectly escalated: {false_escalated}/{len(fp_tickets)}")
        if false_escalated > 0:
            add(f"  ⚠  The AI is escalating '500 produits' / '500 DT' as server errors")

    # ── Confidence calibration (ECE — now with real data) ───────────────────
    add()
    add("-" * 100)
    add("  CONFIDENCE CALIBRATION  (signals.confidence — FIXED PATH vs v3)")
    add("-" * 100)

    conf_values = [r.confidence for r in results]
    nonzero_conf = [c for c in conf_values if c > 0]
    add(f"  Conversations with confidence > 0: {len(nonzero_conf)}/{total}")
    if not nonzero_conf:
        add("  ⚠  ALL confidence values are 0 — check if signals.confidence is being populated.")
        add("     This indicates computeConfidence() in rag.ts may not be running,")
        add("     or the API response structure changed.")
    else:
        add(f"  Avg confidence: {sum(nonzero_conf)/len(nonzero_conf):.3f}  |  "
            f"Min: {min(nonzero_conf):.3f}  |  Max: {max(nonzero_conf):.3f}")

        ece = compute_ece(results)
        add(f"  ECE: {ece:.4f}  (0=perfect, >0.15=misleading)")
        if ece != ece:  # nan
            add("  ⚠  ECE undefined (no confidence data)")
        elif ece < 0.05:
            add("  ✓ Well-calibrated")
        elif ece < 0.15:
            add("  ~ Acceptable calibration")
        else:
            add("  ⚠  Poor calibration")

        add()
        bins: dict[str, dict] = defaultdict(lambda: {"n": 0, "correct": 0, "sum_conf": 0.0})
        for r in results:
            if r.confidence <= 0:
                continue
            b = f"{min(int(r.confidence * 5) * 20, 80)}-{min(int(r.confidence * 5) * 20 + 20, 100)}%"
            bins[b]["n"]        += 1
            bins[b]["correct"]  += int(r.confidence_correct)
            bins[b]["sum_conf"] += r.confidence

        add(f"  {'Bin':>8}  {'N':>5}  {'Acc%':>7}  {'AvgConf':>8}  {'Cal?':>8}")
        add(f"  {'─'*8}  {'─'*5}  {'─'*7}  {'─'*8}  {'─'*8}")
        for b in sorted(bins.keys()):
            d    = bins[b]
            acc  = 100 * d["correct"] / d["n"]
            avgc = d["sum_conf"] / d["n"]
            mid  = float(b.split("-")[0]) / 100 + 0.10
            cal  = "GOOD" if abs(acc/100 - mid) < 0.20 else ("OVER" if acc/100 > mid else "UNDER")
            add(f"  {b:>8}  {d['n']:>5}  {acc:>6.1f}%  {avgc:>8.2f}  {cal:>8}")

    # ── Verdict distribution ─────────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  VERDICT & MODE DISTRIBUTION")
    add("-" * 100)

    verdicts  = Counter(r.detected_verdict or "?" for r in results)
    modes     = Counter(r.detected_category or "?" for r in results)  # use category as proxy

    add(f"  {'Verdict':<18} {'Count':>6} {'%':>7}")
    add(f"  {'─'*18} {'─'*6} {'─'*7}")
    for v, c in verdicts.most_common():
        add(f"  {v:<18} {c:>6} {100*c/total:>6.1f}%")

    # ── Category (module) distribution ──────────────────────────────────────
    add()
    add("-" * 100)
    add("  MODULE DETECTION (Gate B)")
    add("-" * 100)

    m_correct = sum(1 for r in results if r.gate_b_module is True)
    m_wrong   = sum(1 for r in results if r.gate_b_module is False)
    m_neutral = sum(1 for r in results if r.gate_b_module is None)
    m_acc     = 100 * m_correct / (m_correct + m_wrong) if (m_correct + m_wrong) else 0

    add(f"  Correct:  {m_correct}  Wrong: {m_wrong}  Neutral (accept-any): {m_neutral}")
    add(f"  Accuracy (excl neutral): {m_acc:.1f}%")

    detected_cats = Counter(
        to_coarse_module(r.detected_category) for r in results if r.detected_category
    )
    add(f"\n  {'Detected Category':<22} {'Count':>6} {'%':>7}")
    add(f"  {'─'*22} {'─'*6} {'─'*7}")
    for cat, cnt in detected_cats.most_common():
        add(f"  {cat:<22} {cnt:>6} {100*cnt/total:>6.1f}%")

    # Top mismatches
    mismatches = Counter()
    for r in results:
        if r.gate_b_module is False:
            for p in r.phases:
                if p["phase"] == "problem":
                    exp = r.gold["expected_modules"][0] if r.gold["expected_modules"] else "?"
                    got = to_coarse_module(p.get("category", "?"))
                    mismatches[f"{r.subject} → exp:{exp} got:{got}"] += 1
                    break

    if mismatches:
        add(f"\n  Top Module Mismatches:")
        add(f"  {'Description':<55} {'Count':>5}")
        add(f"  {'─'*55} {'─'*5}")
        for m, c in mismatches.most_common(15):
            add(f"  {m[:55]:<55} {c:>5}")

    # ── Language detection ───────────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  LANGUAGE DETECTION (Gate I)")
    add("-" * 100)

    lang_correct = sum(1 for r in results if r.gate_i_language)
    add(f"  Overall accuracy: {lang_correct}/{total} ({100*lang_correct/total:.1f}%)")
    add()

    by_lang: dict[str, list] = defaultdict(list)
    for r in results:
        by_lang[r.gold.get("expected_language", "fr")].append(r)

    add(f"  {'Expected':>10}  {'N':>5}  {'Correct%':>9}  {'Detected (wrong ones)':}")
    add(f"  {'─'*10}  {'─'*5}  {'─'*9}  {'─'*25}")
    for lang in ["fr", "ar", "darija", "en"]:
        rs = by_lang.get(lang, [])
        if not rs:
            continue
        correct = sum(1 for r in rs if r.gate_i_language)
        wrong_detected = Counter(
            r.detected_language for r in rs if not r.gate_i_language and r.detected_language
        )
        wrong_str = ", ".join(f"{l}:{c}" for l, c in wrong_detected.most_common(3))
        add(f"  {lang:>10}  {len(rs):>5}  {100*correct/len(rs):>8.1f}%  {wrong_str}")

    # ── Ticket type accuracy ─────────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  TICKET TYPE DETECTION (Gate F)")
    add("-" * 100)

    f_correct = sum(1 for r in results if r.gate_f_ticket_type)
    add(f"  Overall accuracy: {f_correct}/{total} ({100*f_correct/total:.1f}%)")
    add()

    detected_types = Counter(r.detected_ticket_type for r in results if r.detected_ticket_type)
    add(f"  {'Detected Type':<15}  {'Count':>6}  {'%':>7}")
    add(f"  {'─'*15}  {'─'*6}  {'─'*7}")
    for tt, cnt in detected_types.most_common():
        add(f"  {tt:<15}  {cnt:>6}  {100*cnt/total:>6.1f}%")

    # ── Results by subject ───────────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  RESULTS BY TICKET SUBJECT")
    add("-" * 100)

    by_subj: dict[str, list] = defaultdict(list)
    for r in results:
        by_subj[r.subject].append(r)

    add(f"  {'Subject':<28} {'N':>4} {'Res%':>6} {'GA%':>6} {'GB%':>6} {'GD%':>6} {'Score%':>7}")
    add(f"  {'─'*28} {'─'*4} {'─'*6} {'─'*6} {'─'*6} {'─'*6} {'─'*7}")
    for subj in sorted(by_subj.keys(), key=lambda s: -len(by_subj[s])):
        rs  = by_subj[subj]
        n   = len(rs)
        res = 100 * sum(1 for r in rs if r.resolved) / n
        ga  = 100 * sum(1 for r in rs if r.gate_a_verdict) / n
        gb  = 100 * sum(1 for r in rs if r.gate_b_module is True) / n
        gd  = 100 * sum(1 for r in rs if r.gate_d_actionable) / n
        avg = sum(r.weighted_score for r in rs) / n
        add(f"  {subj:<28} {n:>4} {res:>5.1f}% {ga:>5.1f}% {gb:>5.1f}% {gd:>5.1f}% {avg:>6.1f}%")

    # ── Results by ticket type ───────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  RESULTS BY TICKET TYPE")
    add("-" * 100)

    by_ttype: dict[str, list] = defaultdict(list)
    for r in results:
        by_ttype[r.ticket_type].append(r)

    add(f"  {'Type':<12} {'N':>5} {'Res%':>7} {'EscOK%':>8} {'GovOK%':>8} {'Score%':>8}")
    add(f"  {'─'*12} {'─'*5} {'─'*7} {'─'*8} {'─'*8} {'─'*8}")
    for tt in ["Critical", "Blocking", "Problem", "Question", "Demande", "Autre"]:
        rs = by_ttype.get(tt, [])
        if not rs:
            continue
        n    = len(rs)
        res  = 100 * sum(1 for r in rs if r.resolved) / n
        esc  = 100 * sum(1 for r in rs if r.gate_h_escalate_consistent) / n
        gov_t = [r for r in rs if r.gate_e_governance is not None]
        gov  = 100 * sum(1 for r in gov_t if r.gate_e_governance) / max(len(gov_t), 1)
        avg  = sum(r.weighted_score for r in rs) / n
        add(f"  {tt:<12} {n:>5} {res:>6.1f}% {esc:>7.1f}% {gov:>7.1f}% {avg:>7.1f}%")

    # ── Gate D failure reasons ───────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  GATE D FAILURE REASONS (actionability)")
    add("-" * 100)

    d_reasons = Counter()
    for r in results:
        if not r.gate_d_actionable and r.gate_d_reason:
            d_reasons[r.gate_d_reason] += 1

    for reason, cnt in d_reasons.most_common(15):
        add(f"  {reason[:75]:<75} {cnt:>5}")

    # ── Hallucination report ─────────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  HALLUCINATION REPORT")
    add("-" * 100)

    all_halluc     = [h for r in results for h in r.hallucinations]
    halluc_tickets = sum(1 for r in results if r.hallucinations)

    add(f"  Conversations with hallucinations: {halluc_tickets}/{total} ({100*halluc_tickets/total:.1f}%)")
    add(f"  Total hallucination instances:     {len(all_halluc)}")
    if all_halluc:
        add()
        for h, c in Counter(all_halluc).most_common(10):
            add(f"  {h[:75]:<75} {c:>5}")

    # ── Severity distribution ────────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  SEVERITY DISTRIBUTION")
    add("-" * 100)

    sev_dist = Counter(r.detected_severity or "?" for r in results)
    sev_acc  = sum(1 for r in results if r.severity_match)
    add(f"  Severity accuracy: {sev_acc}/{total} ({100*sev_acc/total:.1f}%)")
    for sev in ["critical", "high", "medium", "low", "?"]:
        c = sev_dist.get(sev, 0)
        if c:
            add(f"  {sev:<10} {c:>5} ({100*c/total:.1f}%)")

    # ── Response time ────────────────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  RESPONSE TIME (server-side processing_time_ms)")
    add("-" * 100)

    times = sorted(r.processing_time_ms for r in results if r.processing_time_ms > 0)
    if times:
        add(f"  Avg: {sum(times)/len(times):.0f}ms  |  Median: {times[len(times)//2]:.0f}ms")
        add(f"  P95: {times[int(0.95*len(times))]:.0f}ms  |  P99: {times[min(int(0.99*len(times)), len(times)-1)]:.0f}ms")
        add(f"  Min: {times[0]:.0f}ms  |  Max: {times[-1]:.0f}ms")

    # ── Follow-up ────────────────────────────────────────────────────────────
    followup_results = [r for r in results if any(p["phase"] == "followup" for p in r.phases)]
    followup_ok      = sum(1 for r in followup_results if r.followup_context_kept)
    if followup_results:
        add()
        add("-" * 100)
        add("  FOLLOW-UP CONTEXT RETENTION")
        add("-" * 100)
        add(f"  Tested: {len(followup_results)}  |  Context kept: {followup_ok} ({100*followup_ok/len(followup_results):.1f}%)")

    # ── Most common issues ───────────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  MOST COMMON ISSUES")
    add("-" * 100)

    all_issues = Counter()
    for r in results:
        for p in r.phases:
            for iss in p.get("issues", []):
                all_issues[iss] += 1

    for iss, cnt in all_issues.most_common(25):
        add(f"  {iss[:75]:<75} {cnt:>5}")

    # ── Weighted score distribution ──────────────────────────────────────────
    add()
    add("-" * 100)
    add("  WEIGHTED SCORES (Greeting 5%, Problem 80-95%, Follow-up 15%)")
    add("-" * 100)

    w_scores = [r.weighted_score for r in results]
    avg_w    = sum(w_scores) / len(w_scores)
    med_w    = sorted(w_scores)[len(w_scores)//2]

    excellent = sum(1 for s in w_scores if s >= 80)
    good      = sum(1 for s in w_scores if 60 <= s < 80)
    fair      = sum(1 for s in w_scores if 40 <= s < 60)
    poor      = sum(1 for s in w_scores if s < 40)

    add(f"  Average: {avg_w:.1f}%  |  Median: {med_w:.1f}%")
    add(f"  Excellent (≥80%): {excellent:4d} ({100*excellent/total:.1f}%)")
    add(f"  Good     (60-79%): {good:4d} ({100*good/total:.1f}%)")
    add(f"  Fair     (40-59%): {fair:4d} ({100*fair/total:.1f}%)")
    add(f"  Poor     (<40%):   {poor:4d} ({100*poor/total:.1f}%)")

    # ── Worst 30 ────────────────────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  WORST 30 CONVERSATIONS (regression candidates)")
    add("-" * 100)

    worst = sorted(results, key=lambda r: (r.resolved, r.weighted_score))[:30]
    for i, r in enumerate(worst, 1):
        gov = f"[GOV:{r.gold.get('governance_tag')}]" if r.gold.get("is_governed") else ""
        gates = (
            f"A:{'P' if r.gate_a_verdict else 'F'} "
            f"B:{'P' if r.gate_b_module is True else 'N' if r.gate_b_module is None else 'F'} "
            f"C:{'P' if r.gate_c_no_halluc is not False else 'F'} "
            f"D:{'P' if r.gate_d_actionable else 'F'} "
            f"E:{'P' if r.gate_e_governance is True else ('N' if r.gate_e_governance is None else 'F')}"
        )
        add(f"\n  #{i} T{r.ticket_id} [{r.subject}] [{r.ticket_type}] {gov}")
        add(f"     Score:{r.weighted_score:.0f}% Resolved:{'Y' if r.resolved else 'N'} | {gates}")
        add(f"     Detected: verdict={r.detected_verdict} cat={r.detected_category} "
            f"esc={r.detected_escalate} conf={r.confidence:.2f}")
        for p in r.phases:
            if p["phase"] == "problem":
                add(f"     User: {p['user_msg'][:100]}")
                add(f"     AI:   {p['ai_answer'][:160]}")
                if p.get("gate_d_reason"):
                    add(f"     D-reason: {p['gate_d_reason']}")
                for iss in p.get("issues", [])[:3]:
                    add(f"       ▸ {iss}")
        for h in r.hallucinations[:2]:
            add(f"       ⚠ HALLUC: {h}")

    # ── Phase 1-3 Enhancements ───────────────────────────────────────────────
    add()
    add("-" * 100)
    add("  PHASE 1-3 ENHANCEMENT METRICS")
    add("-" * 100)

    # Check how many have Phase 1-3 data
    phase1_enabled = [r for r in results if r.phase1_enabled]
    phase2_enabled = [r for r in results if r.phase2_enabled]
    phase3_enabled = [r for r in results if r.phase3_enabled]

    add(f"  Phase 1 (Playbook Scoring) active:  {len(phase1_enabled):>5}/{total} ({100*len(phase1_enabled)/total:.1f}%)")
    add(f"  Phase 2 (Pattern Matching) active:  {len(phase2_enabled):>5}/{total} ({100*len(phase2_enabled)/total:.1f}%)")
    add(f"  Phase 3 (Facts Confirmation) active:{len(phase3_enabled):>5}/{total} ({100*len(phase3_enabled)/total:.1f}%)")
    add()

    if phase1_enabled:
        scores = [r.phase1_playbook_score for r in phase1_enabled if r.phase1_playbook_score is not None]
        if scores:
            avg_score = sum(scores) / len(scores)
            high_score = sum(1 for s in scores if s >= 0.7)
            med_score = sum(1 for s in scores if 0.4 <= s < 0.7)
            low_score = sum(1 for s in scores if s < 0.4)
            add(f"  Phase 1 — Playbook Relevance Scores")
            add(f"    Average Score:      {avg_score:.3f}/1.0")
            add(f"    High   (≥0.7):      {high_score:>5} ({100*high_score/len(scores):.1f}%)")
            add(f"    Medium (0.4-0.7):   {med_score:>5} ({100*med_score/len(scores):.1f}%)")
            add(f"    Low    (<0.4):      {low_score:>5} ({100*low_score/len(scores):.1f}%)")
            add()

    if phase2_enabled:
        matched = sum(1 for r in phase2_enabled if r.phase2_pattern_matched)
        not_matched = len(phase2_enabled) - matched
        add(f"  Phase 2 — Verdict Pattern Matching (early verdict detection)")
        add(f"    Patterns Matched:   {matched:>7}/{len(phase2_enabled)} ({100*matched/len(phase2_enabled):.1f}%)")
        add(f"    No Pattern Match:   {not_matched:>7}/{len(phase2_enabled)} ({100*not_matched/len(phase2_enabled):.1f}%)")
        
        # Check if pattern matches correlate to faster resolution
        if matched > 0:
            matched_resolved = sum(1 for r in phase2_enabled if r.phase2_pattern_matched and r.resolved)
            not_matched_resolved = sum(1 for r in phase2_enabled if not r.phase2_pattern_matched and r.resolved)
            matched_res_rate = 100 * matched_resolved / matched
            not_matched_res_rate = 100 * not_matched_resolved / not_matched if not_matched else 0
            add(f"    Resolution w/ match:   {matched_res_rate:.1f}%")
            if not_matched:
                add(f"    Resolution w/o match:  {not_matched_res_rate:.1f}%")
        add()

    if phase3_enabled:
        facts = [r.phase3_facts_count for r in phase3_enabled if r.phase3_facts_count is not None]
        if facts:
            avg_facts = sum(facts) / len(facts)
            max_facts = max(facts)
            zero_facts = sum(1 for f in facts if f == 0)
            nonzero_facts = len(facts) - zero_facts
            add(f"  Phase 3 — Facts Confirmation (user provided)")
            add(f"    Average Facts/Conversation:  {avg_facts:.1f}")
            add(f"    Max Facts in Single Conv:    {max_facts}")
            add(f"    Conversations with facts:    {nonzero_facts:>5}/{len(facts)} ({100*nonzero_facts/len(facts):.1f}%)")
            add(f"    No facts provided:           {zero_facts:>5}/{len(facts)} ({100*zero_facts/len(facts):.1f}%)")
            add()

    # Phase 1-3 impact on resolution
    p123_active = [r for r in results if r.phase1_enabled or r.phase2_enabled or r.phase3_enabled]
    if p123_active:
        p123_resolved = sum(1 for r in p123_active if r.resolved)
        p123_res_rate = 100 * p123_resolved / len(p123_active)
        add(f"  Resolution Rate with Phase 1-3: {p123_res_rate:.1f}% ({p123_resolved}/{len(p123_active)})")

    # ── Final grade ──────────────────────────────────────────────────────────
    add()
    add("=" * 100)
    add("  FINAL GRADE")
    add("=" * 100)

    if resolution_rate >= 80:   grade, verdict = "A+", "Exceptional — resolves 80%+ tickets autonomously"
    elif resolution_rate >= 70: grade, verdict = "A",  "Excellent — strong autonomous resolution"
    elif resolution_rate >= 60: grade, verdict = "B+", "Good — solid but room for improvement"
    elif resolution_rate >= 50: grade, verdict = "B",  "Decent — handles majority of cases"
    elif resolution_rate >= 40: grade, verdict = "C+", "Average — needs significant improvement"
    elif resolution_rate >= 30: grade, verdict = "C",  "Below average — too many failures"
    else:                        grade, verdict = "D",  "Poor — fundamental issues"

    gov_rate = 100 * gov_pass / max(len(governed), 1)
    ece_val  = compute_ece(results)
    ece_str  = f"{ece_val:.4f}" if ece_val == ece_val else "n/a (no conf data)"

    add(f"  Grade:               {grade}")
    add(f"  Resolution Rate:     {resolution_rate:.1f}%")
    add(f"  Weighted Score:      {avg_w:.1f}%")
    add(f"  Module Accuracy:     {m_acc:.1f}%")
    add(f"  Governance Compliant:{gov_rate:.1f}%  ({len(governed)} governed tickets)")
    add(f"  Hallucination-Free:  {100*(1-halluc_tickets/total):.1f}%")
    add(f"  Language Acc:        {100*lang_correct/total:.1f}%")
    add(f"  ECE (calibration):   {ece_str}")
    add(f"  Verdict: {verdict}")
    add()
    add("  Methodology Notes:")
    add("  - Resolution requires all 4 core gates: verdict(A) + module(B) + no-halluc(C) + actionable(D)")
    add("  - If governance-triggered (5xx/site_down): additionally requires Gate E")
    add("  - Confidence read from signals.confidence (FIXED from v3 which read wrong field)")
    add("  - Governance patterns replicated exactly from governance.ts decision table")
    add("  - Category normalised via toCoarseModule() — 'domains'→'settings', etc.")
    add("  - Gate G: next_question must be present when verdict=unclear (structural requirement from prompt.ts)")
    add("  - Gate H: escalate boolean must be consistent with verdict (tiktak_side↔true)")
    add("  - Follow-up selection is hash-based (stable across runs with same seed)")
    add("=" * 100)

    return "\n".join(L)


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 14 — Main
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="TikTak PRO AI — Conversation Accuracy Test v4")
    parser.add_argument("--count",            type=int,  default=DEFAULT_NUM)
    parser.add_argument("--seed",             type=int,  default=DEFAULT_SEED)
    parser.add_argument("--validate-labeler", action="store_true")
    args = parser.parse_args()

    random.seed(args.seed)

    print()
    print("  " + "╔" + "═" * 68 + "╗")
    print("  " + "║" + " TikTak PRO AI — Conversation Accuracy Test v4".center(68) + "║")
    print("  " + "║" + " Grounded in: detection.ts · governance.ts · helpers.ts · routes.ts".center(68) + "║")
    print("  " + "╚" + "═" * 68 + "╝")

    print("\n  ✓ Running auto-labeler self-validation...")
    labeler_val = validate_labeler(verbose=True)
    with open(LABELER_VAL_PATH, "w", encoding="utf-8") as f:
        json.dump(labeler_val, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Saved → {LABELER_VAL_PATH}")

    if args.validate_labeler:
        print("  --validate-labeler: stopping here.")
        return

    print(f"\n  Loading tickets from {TICKETS_PATH}...")
    with open(TICKETS_PATH, "r", encoding="utf-8") as f:
        all_tickets = json.load(f)
    print(f"  Loaded {len(all_tickets)} tickets")

    num = args.count
    print(f"  Selecting {num} tickets (stratified, seed={args.seed})...")
    tickets = select_tickets(all_tickets, num)
    print(f"  Selected {len(tickets)} across {len(set(t['subject'] for t in tickets))} subjects")
    print()

    sel_subj = Counter(t["subject"] for t in tickets)
    for subj, cnt in sel_subj.most_common():
        print(f"    • {subj:.<40} {cnt:>4} tickets")

    # Governance-triggered tickets stats
    gov_count = sum(1 for t in tickets if check_governance(t.get("description", "")).get("tag") != "none")

    live_greeting_count   = max(1, int(len(tickets) * GREETING_LIVE_SAMPLE_RATE))
    live_greeting_indices = set(
        sorted(range(len(tickets)), key=lambda i: _ticket_hash(tickets[i].get("id", i)))
        [:live_greeting_count]
    )

    followup_count = sum(
        1 for i, t in enumerate(tickets)
        if (_ticket_hash(t.get("id", i)) % 100) < int(FOLLOWUP_RATE * 100)
    )

    est_calls = len(tickets) + live_greeting_count + followup_count
    
    print()
    print("  " + "─" * 70)
    print(f"  📊 Test Configuration")
    print("  " + "─" * 70)
    print(f"  🛡️  Governance-triggered:  {gov_count:4d}  ({100*gov_count/len(tickets):6.1f}%)  [deterministic gate E]")
    print(f"  👋 Live greeting tests:     {live_greeting_count:4d}  ({100*live_greeting_count/len(tickets):6.1f}%)")
    print(f"  🔄 Follow-up conversations: {followup_count:4d}  ({100*followup_count/len(tickets):6.1f}%)")
    print(f"  📡 Estimated API calls:     {est_calls:4d}")
    print(f"  ⏱️  Estimated time:          ~{est_calls * 3.5 / 60:.0f} minutes")
    print("  " + "─" * 70)
    print()
    print("  Running test...")
    print()

    results: list[ConversationResult] = []
    start = time.time()
    print()

    for i, ticket in enumerate(tickets):
        try:
            result = run_conversation(ticket, i, len(tickets), live_greeting_indices)
            results.append(result)
        except KeyboardInterrupt:
            print(f"\n\n  ⚠  Interrupted at {i+1}/{len(tickets)}")
            break
        except Exception as e:
            r = ConversationResult(ticket)
            r.errors.append(str(e))
            r.phases.append({
                "phase": "error", "issues": [str(e)],
                "user_msg": "", "ai_answer": ""
            })
            results.append(r)
            
            # Show progress even on errors
            if (i + 1) % max(50, len(tickets) // 20) == 0 or (i + 1) == len(tickets):
                pct = (i + 1) / len(tickets) * 100
                filled = int(40 * (i + 1) / len(tickets))
                bar = "█" * filled + "░" * (40 - filled)
                print(f"  [{bar}] {pct:5.1f}%  |  {i+1:4d}/{len(tickets)}  |  ERROR", flush=True)

    elapsed = time.time() - start
    print()

    print("  " + "─" * 70)
    print(f"  ✓ Completed {len(results)} conversations in {elapsed:.0f}s ({elapsed/60:.1f} min)")
    print("  " + "─" * 70)
    print()

    print("  📝 Generating report...")
    report = generate_report(results, elapsed, labeler_val)

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"  ✓ Report saved:     {REPORT_PATH}")

    with open(JSON_REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump([r.to_dict() for r in results], f, ensure_ascii=False, indent=2)
    print(f"  ✓ Raw JSON saved:   {JSON_REPORT_PATH}")

    worst_50 = sorted(results, key=lambda r: (r.resolved, r.weighted_score))[:50]
    with open(REGRESSION_PATH, "w", encoding="utf-8") as f:
        json.dump([r.to_dict() for r in worst_50], f, ensure_ascii=False, indent=2)
    print(f"  ✓ Regression suite: {REGRESSION_PATH}")

    # Console summary
    resolved    = sum(1 for r in results if r.resolved)
    avg_w       = sum(r.weighted_score for r in results) / len(results)
    h_free      = sum(1 for r in results if not r.hallucinations)
    gov_tested  = [r for r in results if r.gate_e_governance is not None]
    gov_ok      = sum(1 for r in gov_tested if r.gate_e_governance)
    conf_nonzero = sum(1 for r in results if r.confidence > 0)

    print()
    print("  " + "╔" + "═" * 68 + "╗")
    print("  " + "║" + " QUICK SUMMARY".ljust(68) + "║")
    print("  " + "╠" + "═" * 68 + "╣")
    print("  " + "║" + f"  Resolution Rate:  {100*resolved/len(results):5.1f}%".ljust(68) + "║")
    print("  " + "║" + f"  Weighted Score:   {avg_w:5.1f}%".ljust(68) + "║")
    print("  " + "║" + f"  Hallucination-Free: {100*h_free/len(results):5.1f}%".ljust(68) + "║")
    print("  " + "║" + f"  Governance Compliance: {100*gov_ok/max(len(gov_tested),1):5.1f}%  ({len(gov_tested)} tested)".ljust(68) + "║")
    print("  " + "║" + f"  Confidence Data Points: {conf_nonzero} / {len(results)}".ljust(68) + "║")
    print("  " + "╚" + "═" * 68 + "╝")
    print()


if __name__ == "__main__":
    main()