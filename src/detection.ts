// src/detection.ts — Module detection, entity extraction, language detection, escalation patterns
//
// Core functions:
//   canonicalModule()           — Normalize module name to canonical form
//   toCoarseModule()            — Map fine-grained modules to 14 coarse categories
//   detectPreferredModule()     — Smart module detection from keywords (0.3-2.0x weights)
//   extractEntities()           — Extract problem metadata: error codes, entities, language, payment status
//   checkHardEscalation()       — Detect immediate escalation triggers
//   isGreetingOnly()            — Detect small-talk (should not charge LLM)
//   isThanksOnly()              — Detect gratitude (conversation end)
//   detectLanguage()            — Detect: French, English, Arabic, French-Darija mix

import type { HistoryMsg, RetrievalContext } from "./types";
import { normalizeSujet, type Sujet } from "../shared/taxonomy";
import { findVerdictPattern, inferVerdictFromPattern } from "./verdictPatterns";


/* ════════════════════════════════════════════════════════════════════════ */
/* CANONICAL MODULE MAPPING                                                 */
/* ════════════════════════════════════════════════════════════════════════ */
//
// Converts raw module names to canonical form (lowercase, normalized)
// Input: "Orders", "ORDERS", "commandes", "Commande", null, undefined
// Output: "orders", "orders", "orders", "orders", "general", "general"
//

/**
 * Normalize raw module string to canonical form
 * Handles: case-insensitivity, French/Arabic aliases, null/undefined
 *
 * @param raw - Module name from user, API, or metadata
 * @returns Canonical module name (lowercase, normalized)
 */
export function canonicalModule(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "general";
  const norm = normalizeSujet(s);
  return toCoarseModule(norm);
}

/* ----------------------------- Coarse module mapping ----------------------------- */

const COARSE_MODULES = new Set([
  "orders", "products", "builder", "settings", "apps", "shipping",
  "payments", "customers", "pos", "billing", "general",
  "technical", "auth", "inventory", "notifications",
]);

export function toCoarseModule(x: unknown): Sujet {
  const v = String(x ?? "").trim().toLowerCase();
  if (!v || v === "unclear") return "general";

  // If already a coarse module, keep it
  if (
    v === "apps" || v === "builder" || v === "general" || v === "orders" ||
    v === "products" || v === "settings" || v === "shipping" ||
    v === "payments" || v === "billing" || v === "customers" || v === "pos" ||
    v === "technical" || v === "auth" || v === "inventory" || v === "notifications"
  ) return v as Sujet;

  // Fine-grained / legacy / synonym → coarse
  const map: Record<string, Sujet> = {
    // builder-ish
    "templates": "builder", "template": "builder", "content": "builder",
    "contents": "builder", "cms": "builder", "pages": "builder",
    "page": "builder", "navigation": "builder", "theme": "builder",
    "themes": "builder", "design": "builder", "seo": "builder",

    // settings-ish
    "domain": "settings", "domains": "settings", "dns": "settings",
    "ssl": "settings", "configuration": "settings", "config": "settings",

    // auth
    "auth": "auth", "login": "auth", "password": "auth",
    "mot de passe": "auth", "otp": "auth", "connexion": "auth",
    "authentification": "auth", "2fa": "auth", "déconnexion": "auth",

    // notifications
    "notifications": "notifications", "notification": "notifications",
    "alerte": "notifications", "alertes": "notifications",
    "email notification": "notifications", "sms": "notifications",

    // payments
    "payment": "payments", "paiement": "payments", "carte": "payments",
    "transaction": "payments", "3ds": "payments", "stripe": "payments",

    // billing
    "invoice": "billing", "invoices": "billing", "facturation": "billing",
    "facture": "billing", "abonnement": "billing", "subscription": "billing",

    // orders
    "order": "orders", "commande": "orders", "orders_management": "orders",
    "checkout": "orders", "cart": "orders", "panier": "orders",

    // products
    "product": "products", "catalog": "products", "catalogue": "products",
    "sku": "products", "category": "products", "categories": "products",
    "collection": "products", "collections": "products",

    // inventory
    "inventory": "inventory", "inventaire": "inventory",
    "stock": "inventory", "rupture": "inventory", "disponibilité": "inventory",

    // shipping
    "delivery": "shipping", "carrier": "shipping", "livraison": "shipping",
    "expedition": "shipping", "expédition": "shipping", "scanner": "shipping",
    "douchette": "shipping", "scan": "shipping", "barcode": "shipping",
    "manifeste": "shipping", "manifest": "shipping", "colis": "shipping",
    "étiquette": "shipping", "etiquette": "shipping",

    // customers
    "customer": "customers", "client": "customers", "clients": "customers",
    "utilisateur": "customers", "user": "customers",

    // apps / integrations
    "api": "apps", "integration": "apps", "integrations": "apps",
    "app": "apps", "application": "apps", "applications": "apps",
    "apps_store": "apps", "module": "apps", "modules": "apps",
    "webhook": "apps", "webhooks": "apps", "pixel": "apps",
    "facebook": "apps", "leads": "apps", "messenger": "apps",
    "tracking_automatique": "apps", "shipper": "apps",

    // pos
    "caisse": "pos", "point de vente": "pos", "magasin": "pos", "terminal": "pos",

    // technical
    "technical": "technical", "bug": "technical",
    "incident": "technical", "crash": "technical", "panne": "technical",

    // support → general
    "support": "general", "ticket": "general", "tickets": "general",
    "complaint": "general", "réclamation": "general",
  };

  return map[v] ?? "general";
}

/* ════════════════════════════════════════════════════════════════════════ */
/* MODULE DETECTION (Smart keyword-based routing)                            */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * Detect preferred module for user's message using keyword matching
 *
 * ALGORITHM:
 * 1. Build scoring table: each module has keywords with weights (0.3-2.0x)
 *    - Higher weight = more specific (e.g., "livraison" = 1.6x for shipping)
 *    - Lower weight = common (e.g., "général" = 1.0x for general)
 * 2. Score current message: count keywords matched, apply weights
 * 3. Decay history: add last 4 messages to signal with decay factor (0.2 * (1-i/len))
 * 4. Return module with highest total score
 *
 * ACCURACYBOOSTS:
 * - Multilingual: French, English, Arabic, Darija (transliteration)
 * - User context: decaying history signal prevents misclassification
 * - Specific phrases: e.g., "retour échange" = orders (not general returns)
 *
 * @param message - Current user message
 * @param history - Previous messages in conversation (last 4 used for context)
 * @returns {module, score} - Best matching module and confidence score
 */
export function detectPreferredModule(message: string, history: HistoryMsg[]): { module: string; score: number } {
  const lowerMsg = message.toLowerCase();

  const moduleKeywords: Record<string, { keywords: string[]; weight: number }> = {
    orders: {
      keywords: [
        "commande","order","commandes","orders",
        "annuler commande","annuler","annulation","remboursement","rembourser",
        "suivi commande","confirmer commande","état commande","numéro de commande",
        "panier","cart","checkout","code promo","coupon","validation commande",
        "confirmation de commande","section commande","section commandes",
        "reporté","reportée","commande reportée","commandes reportées",
        "échange","echange","exchange","échanger","echanger","commande échange","commande d'échange",
        "remplacer produit","remplacement","mauvais produit","mauvaise taille","mauvaise couleur",
        "retour échange","retour et échange","lbadla","nbadel",
        "lcommande","tet3ada","matet3adech","mayet3adech","ntab3ou","ntaba3",
      ],
      weight: 1.8,
    },
    builder: {
      keywords: [
        "template","templates","thème","theme","design","menu","navigation",
        "contenu","content","cms","seo","website builder",
        "mise en page","en-tête","header","footer","pied de page","bannière","banner","banniere",
        "slider","section","bloc","block","éditeur","editeur","personnaliser",
        "page d'accueil","accueil","homepage",
        "couleur","color","police","font","fond","arrière-plan","background",
        "logo","favicon","image de couverture","galerie","carousel",
        "popup","pop-up","bouton","button","formulaire","responsive",
        "css","style","apparence","visuel","look","affichage",
        "ajouter section","modifier section","supprimer section",
        "modifier la page","créer une page","créer page","nouvelle page",
        "ajouter une page","ajouter page","supprimer la page",
        "modifier le contenu","modifier contenu","modifier le texte","modifier texte",
        "sous-menu","sous menu","lien hypertexte",
        "ne s'affiche pas correctement","mal affiché","affichage cassé",
        "largeur","taille","responsive","mobile",
        "upsell","cross-sell","landing page","landing",
        "social media","réseaux sociaux","instagram","lien instagram",
        "video banniere","vidéo bannière","image cliquable",
        "verrouillé","verrouillage","builder bloqué","builder locked","locked",
        "code personnalisé","custom code","glisser-déposer","drag and drop",
        "iframe blanc","iframe blank","page blanche builder",
        "site ralenti","titre","bande","modèle",
        "ldesign","lpage",
      ],
      weight: 2.0,
    },
    products: {
      keywords: [
        "produit","product","produits","products",
        "sku","référence","reference","catalogue","catalog",
        "variant","variante","collection","catégorie","categorie","category",
        "import produit","export produit","image produit","photo produit",
        "prix produit","ajouter produit","modifier produit","supprimer produit",
        "fiche produit","page produit",
        "ne s'affiche pas","ne s'affichent pas","n'apparait pas","n'apparaissent pas",
        "lproduit","tsawer","ma ytla3ch","maytla3ch","ma ybanch","maybanch",
        "yetl3ouli","metetla3",
      ],
      weight: 1.7,
    },
    payments: {
      keywords: [
        "paiement","payment","carte bancaire","carte","cb","visa","mastercard",
        "refusé paiement","refuse","transaction","3ds","stripe",
        "gateway","passerelle","tpe en ligne",
        "lpaiement","5alas","5alast","n5ales","carta","flouss","mat3adech",
      ],
      weight: 1.7,
    },
    settings: {
      keywords: [
        "domaine","domain","dns","ssl","https","certificat","certificate","cloudflare","nameserver","ns",
        "erreur 403","erreur 404","err_","net::err",
        "hors ligne",
        "paramètres du site","configurer le site","réglages du site",
        "langue du site","configuration","paramètres",
        "lsite","yatla3li",
      ],
      weight: 1.5,
    },
    shipping: {
      keywords: [
        "livraison","shipping","livreur","expédition","expedition",
        "colis","manifeste","manifest","étiquette","etiquette",
        "douchette","scanner","scan","barcode",
        "suivi colis","transporteur","carrier","retour colis","ramassage",
        "bon de livraison","bordereau",
        "frais de livraison","frais livraison","livraison gratuite","free shipping",
        "tarif livraison","prix livraison","coût livraison","cout livraison",
        "zone livraison","zone de livraison","gouvernorat","frais transporteur",
        "llivraison","ma wsltch","mawsltch","lfrais",
      ],
      weight: 1.6,
    },
    billing: {
      keywords: [
        "facturation","billing","facture","invoice","factures",
        "abonnement","subscription","plan","forfait",
        "renouvellement","upgrade","downgrade",
        "prix abonnement","tarif","frais liaison","paiement template",
        "annuler abonnement","résilier","expiration abonnement",
        "lfacture","labonnement",
      ],
      weight: 1.5,
    },
    pos: {
      keywords: [
        "pos","caisse","caiss","point de vente","magasin","terminal","vente en magasin",
        "caisse enregistreuse","session caisse","session de vente",
        "tva","total tva","ticket de caisse","bon de caisse",
        "vente physique","vente en boutique","boutique physique",
        "personnel","gestion personnel","gestion des personnels",
        "coût marchandise","cout marchandise",
        "facture pos","factures pos","facture de notre pos",
        "lcaisse","lmagasin",
      ],
      weight: 1.6,
    },
    customers: {
      keywords: [
        "fiche client","compte client","profil client","liste client",
        "customer","customers","gestion client","gestion des clients",
        "utilisateur","user","profil","compte utilisateur",
        "données client","supprimer client","modifier client",
      ],
      weight: 1.3,
    },
    apps: {
      keywords: [
        "api","endpoint","webhook","integration","intégration",
        "developpeur","developer","modules","module","application","applications",
        "facebook pixel","pixel","leads facebook",
        "pixel facebook","tracking automatique","conversion pixel",
        "meta pixel","pixel code","installer pixel","pixel ne fonctionne pas",
        "google analytics","google tag","gtm","tag manager","tiktok pixel",
        "événement pixel","event pixel","purchase event","add to cart event",
        "shipper","first delivery",
      ],
      weight: 1.2,
    },
    technical: {
      keywords: [
        "erreur 500","error 500","erreur 502","error 502","erreur 503","erreur 504",
        "error 504","gateway timeout","internal server error",
        "site crash","crash","bug","site down","site ne fonctionne pas","site ne marche pas",
        "page blanche","page vide","panne","plante","ne charge pas",
        "ne s'affiche pas","serveur","server error","500 error","502 error","503 error","504 error",
        "timeout","ne répond pas","ne repond pas","site planté","site plante",
        "erreur serveur","erreur technique","problème technique","probleme technique",
        "lsite ma5dimch","site ma5demch","lsite 5asro","bug technique",
      ],
      weight: 2.0,
    },
    auth: {
      keywords: [
        "login","connexion","mot de passe","password","otp","mot de pass",
        "authentification","2fa","déconnexion","deconnexion","déconnecté","deconnecte",
        "connecter","se connecter","me connecter","pas connecter","accès","acces",
        "accéder","acceder","identifiant","identifiants","réinitialiser mot de passe",
        "reset password","forgot password","oublié mot de passe",
        "session expirée","session expiree","code otp","vérification otp","verification otp",
        "llogin","lpassword","lconnexion",
      ],
      weight: 1.8,
    },
    inventory: {
      keywords: [
        "stock","inventaire","inventory","quantité","quantite","disponibilité","disponibilite",
        "rupture de stock","rupture","en stock","hors stock","out of stock",
        "mise à jour stock","maj stock","stock disponible","gestion stock","gestion des stocks",
        "niveau de stock","niveaux de stock","ajuster stock","ajustement stock",
        "stock négatif","stock negatif","synchroniser stock","sync stock",
        "lstock","linventaire",
      ],
      weight: 1.6,
    },
    notifications: {
      keywords: [
        "notification","notifications","email notification","sms","alerte","alertes",
        "webhook","email automatique","mail automatique","notification email",
        "notification sms","notification push","envoyer notification","configurer notification",
        "désactiver notification","desactiver notification","activer notification",
        "paramètres notification","notification commande","notification client",
        "email de confirmation","email confirmation","mail de confirmation",
        "lnotification","lnotifications",
      ],
      weight: 1.4,
    },
    general: {
      keywords: [
        "activer mon compte","activation boutique","activation compte","activer boutique",
        "créer boutique","nouvelle boutique","ouvrir boutique","cree boutique","cree nouveau boutique",
        "changer nom boutique","changement nom","nom de boutique","nom boutique","nom de la boutique","changer le nom",
        "changer email","modifier email","vérification email","verification email","changer l'email",
        "team","équipe","capacité pack","pack",
        "liaison","demande de liaison","confirmation de la liaison","retard de confirmation",
        "compte bloqué","compte bloquer","compte bloqu","blocked",
        "duplication","dupliquer","duplication du site",
        "hallt boutique","halit boutique","7alit boutique","n7el boutique",
      ],
      weight: 1.0,
    },
  };

  const scores: Record<string, number> = {};

  // Score current message
  for (const [module, cfg] of Object.entries(moduleKeywords)) {
    let score = 0;
    for (const kw of cfg.keywords) {
      if (kw && lowerMsg.includes(kw)) score += cfg.weight;
    }
    if (score > 0) scores[module] = score;
  }

  // Add decayed history signal (last 4 messages)
  const recentHistory = history.slice(-4);
  for (let i = 0; i < recentHistory.length; i++) {
    const msg = recentHistory[i];
    const lowerHist = msg.content.toLowerCase();
    const decay = 0.2 * (1 - i / Math.max(1, recentHistory.length));
    for (const [module, cfg] of Object.entries(moduleKeywords)) {
      for (const kw of cfg.keywords) {
        if (kw && lowerHist.includes(kw)) {
          scores[module] = (scores[module] || 0) + (cfg.weight * decay);
        }
      }
    }
  }

  // Pick best
  let bestModule = "general";
  let bestScore = 0;
  for (const [module, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestModule = module;
    }
  }

  return { module: canonicalModule(bestModule), score: bestScore };
}

/* ════════════════════════════════════════════════════════════════════════ */
/* ENTITY EXTRACTION (Metadata parsing from user message)                    */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * Extract structured metadata entities from user's free-text message
 *
 * EXTRACTED ENTITIES:
 * - url: Website URL (https://...)
 * - domain: Domain name (e.g., example.com)
 * - order_id: Order number (e.g., #12345, order 98765)
 * - sku_or_product: Product SKU or name (e.g., SKU: ABC123)
 * - payment_method: Payment type (stripe, paypal, edinar, cash, etc.)
 * - error_message: Error code or message (5xx, 4xx, or quoted text)
 * - carrier: Shipping carrier (DHL, FedEx, Aramex, etc.)
 * - has_screenshot_mention: Whether user mentions attaching screenshot
 * - multiple_order_ids: List of all order numbers found
 *
 * REGEX PATTERNS:
 * - URLs: full https?:// URLs
 * - Domains: *.example.com pattern
 * - Orders: #12345, order 98765 format
 * - SKU: "SKU: ABC123" format
 * - Error: HTTP 5xx/4xx codes or "quoted errors"
 *
 * @param message - User's free-text message
 * @returns ExtractedEntities - Structured metadata (sparse object)
 */
export function extractEntities(message: string): import("./types").ExtractedEntities {
  const m = message || "";
  const out: import("./types").ExtractedEntities = {};

  const urlMatch = m.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) out.url = urlMatch[0];

  const domainMatch = m.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/i);
  if (domainMatch) out.domain = domainMatch[0];

  const orderMatch = m.match(/(?:\border\b|\bcommande\b|#)\s*([0-9]{3,})/i);
  if (orderMatch) out.order_id = orderMatch[1];

  const skuMatch = m.match(/\bSKU\b\s*[:#-]?\s*([A-Z0-9_-]{3,})/i);
  if (skuMatch) out.sku_or_product = skuMatch[1];
  else {
    const prodMatch = m.match(/(?:\bproduit\b|\bproduct\b)\s*[:#-]?\s*([^\n\r]{3,40})/i);
    if (prodMatch) out.sku_or_product = prodMatch[1].trim();
  }

  const pm = m.match(/\b(stripe|paypal|carte|cb|visa|mastercard|edinar|e-dinar|virement|cash|cod)\b/i);
  if (pm) out.payment_method = pm[1].toLowerCase();

  const quoted = m.match(/"([^"]{5,140})"/);
  if (quoted) out.error_message = quoted[1];
  else if (/(5\d\d|4\d\d|timeout|erreur|error|panne|failed|refus|bloqu)/i.test(m)) {
    out.error_message = m.slice(0, 220);
  }

  // Carrier/shipper names
  const carrierMatch = m.match(/\b(droppex|aramex|fedex|dhl|chronopost|rapid\s*poste|poste\s*tunisienne|ups|tnt|express\s*delivery|mylerz|yan?lidine|maystro|genex|sobflous)\b/i);
  if (carrierMatch) out.carrier = carrierMatch[1].toLowerCase();

  // Screenshot/image mentions (merchant says they'll send or reference an image)
  if (/capture|screenshot|image|photo|pièce.?jointe|pj|fichier joint|ci.?joint|voir.?(?:la|le|l')?.?(?:capture|image|photo)/i.test(m)) {
    out.has_screenshot_mention = true;
  }

  // Multiple order references (grab all 8+ digit numbers)
  const allOrderRefs = m.match(/\b\d{8,}\b/g);
  if (allOrderRefs && allOrderRefs.length > 1) {
    out.order_refs = [...new Set(allOrderRefs)].slice(0, 10);
  }

  return out;
}

/* ----------------------------- Language detection ----------------------------- */

export function detectLanguage(msg: string): "fr" | "ar" | "darija" | "en" {
  const m = (msg || "").trim();
  if (/[\u0600-\u06FF]/.test(m)) return "ar";
  if (/\b(y7el|5alas|ma5dem|matet3ada|7alit|wesh|bech|chnou|kifech|3lech|ya5i)\b/i.test(m)) return "darija";
  if (/\b(the|is|are|have|this|that|with|from|what|where|when|how|please|help)\b/i.test(m)) return "en";
  return "fr";
}

/* ----------------------------- Hard escalation ----------------------------- */

export function checkHardEscalation(message: string): { triggered: boolean; reason: string } {
  const hardPatterns: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /\b(500|502|503|504)\s*(error|erreur)?\b/i, reason: "HTTP 5xx error" },
    { pattern: /\binternal server error\b/i, reason: "Internal server error" },
    { pattern: /\bservice unavailable\b/i, reason: "Service unavailable" },
    { pattern: /\btimeout\b.*\b(error|erreur|serveur|server)\b/i, reason: "Server timeout" },
    { pattern: /\berreur\s*serveur\b/i, reason: "Server error" },
    { pattern: /\bpanne\s*(système|totale|complète|generale)?\b/i, reason: "System outage" },
  ];

  for (const { pattern, reason } of hardPatterns) {
    if (pattern.test(message)) return { triggered: true, reason };
  }

  return { triggered: false, reason: "" };
}

/* ----------------------------- Greeting / Thanks detection ----------------------------- */

export function isGreetingOnly(msg: string): boolean {
  const greetings = ["salut", "bonjour", "hello", "hi", "hey", "salam", "slm", "bsr", "bonsoir", "cc", "coucou", "wesh", "السلام", "صباح", "مرحبا"];
  const lower = msg.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;
  if (wordCount > 4) return false;
  // If message contains real content after greeting, it's NOT greeting-only
  if (wordCount > 2) {
    const hasContent = /\b(commande|produit|livraison|paiement|domaine|erreur|probl[eè]m|site|stock|aide|comment|marche pas|fonctionne|bug|bloqu|template|ssl|dns|import|activ|factur|abonn)\b/i.test(lower);
    if (hasContent) return false;
  }
  return greetings.some((g) => lower === g || lower.startsWith(g + " ") || lower.endsWith(" " + g));
}

export function isThanksOnly(msg: string): boolean {
  const lower = msg.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;
  if (wordCount > 6) return false;
  // Direct thanks
  const thanks = ["merci", "thank", "thanks", "thx", "شكرا", "choukran", "thnx"];
  if (thanks.some((t) => lower === t || lower.startsWith(t + " ") || lower.endsWith(" " + t))) return true;
  // Extended satisfaction patterns
  if (/^(merci\s+(bcp|beaucoup|bien|infiniment)|thanks?\s+(a lot|so much)|c['\u2019]est\s+(parfait|bon|r[eé]gl[eé]|r[eé]solu)|super\s*!?|nickel|top|parfait|excellent|g[eé]nial)\s*!*$/i.test(lower)) return true;
  return false;
}

/* ----------------------------- Related module check ----------------------------- */

export function areModulesRelated(module1: string, module2: string): boolean {
  const m1 = canonicalModule(module1);
  const m2 = canonicalModule(module2);

  const relatedGroups: string[][] = [
    ["shipping", "orders", "products", "inventory"],
    ["orders", "checkout", "payments"],
    ["domains", "settings", "builder"],
    ["products", "inventory", "builder"],
    ["billing", "payments", "settings"],
    ["apps", "settings", "technical"],
    ["auth", "settings", "general"],
    ["billing", "general", "auth"],
  ];

  return relatedGroups.some((group) => group.includes(m1) && group.includes(m2));
}

/**
 * Infer module from vectorize retrieval when keyword detection yielded "general".
 */
export function inferModuleFromRetrieval(
  pbCtx: RetrievalContext,
  docsCtx: RetrievalContext
): string | null {
  const moduleScores: Record<string, number> = {};

  for (const item of pbCtx.items) {
    const mod = canonicalModule(item.module);
    if (mod && mod !== "general") {
      moduleScores[mod] = (moduleScores[mod] || 0) + item.score * 2;
    }
  }

  for (const item of docsCtx.items) {
    const mod = canonicalModule(item.module);
    if (mod && mod !== "general") {
      moduleScores[mod] = (moduleScores[mod] || 0) + item.score;
    }
  }

  const entries = Object.entries(moduleScores);
  if (entries.length === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);
  const [bestMod, bestScore] = entries[0];
  const secondScore = entries.length > 1 ? entries[1][1] : 0;

  if (bestScore > 0 && (secondScore === 0 || bestScore >= secondScore * 1.3)) {
    return toCoarseModule(bestMod);
  }

  return null;
}

/* ═════════════════════════════════════════════════════════════════ */
/* PHASE 1-2: VERDICT PATTERN INFERENCE                            */
/* ═════════════════════════════════════════════════════════════════ */

/**
 * PHASE 2: Infer verdict using symptom pattern matching (no LLM required)
 *
 * ALGORITHM:
 * 1. Find matching pattern from 50+ known patterns (HTTP errors, payment, SSL, products, etc.)
 * 2. If pattern found, calculate verdict (user_side vs tiktak_side) and confidence
 * 3. Extract related playbooks and clarification questions
 * 4. Return structured diagnosis or fallback to "unclear" for LLM decision
 *
 * CONFIDENCE THRESHOLDS:
 * - tiktak_side: Uses pattern probability directly (usually 0.75-1.0)
 * - user_side: Uses pattern probability directly (usually 0.0-0.95)
 * - unclear: 0.3 (needs LLM verification)
 *
 * @param message - User's problem description
 * @returns Diagnosis with verdict, confidence, and clarification guidance
 */
export function inferVerdictUsingPatterns(message: string): {
  verdict: "user_side" | "tiktak_side" | "unclear";
  confidence: number;
  pattern_matched: boolean;
  reasoning: string;
  required_info: string[];
  fast_check: string | null;
  related_playbooks: string[];
} {
  const pattern = findVerdictPattern(message);

  if (pattern) {
    const inference = inferVerdictFromPattern(pattern);
    return {
      verdict: inference.verdict,
      confidence: inference.confidence,
      pattern_matched: true,
      reasoning: inference.reasoning,
      required_info: pattern.required_info,
      fast_check: pattern.fast_check,
      related_playbooks: pattern.related_playbooks,
    };
  }

  // No pattern match → fallback to LLM for decision
  return {
    verdict: "unclear",
    confidence: 0.3,
    pattern_matched: false,
    reasoning: "No definitive pattern match — LLM diagnosis needed",
    required_info: ["problem_description"],
    fast_check: null,
    related_playbooks: [],
  };
}
