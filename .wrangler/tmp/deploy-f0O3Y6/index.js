var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/types.ts
var EMBED_MODEL = "@cf/baai/bge-m3";
var CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

// shared/taxonomy.ts
var SUJETS = [
  // fallback
  "general",
  "unclear",
  // canonical modules
  "domains",
  "builder",
  "settings",
  "apps",
  "orders",
  "products",
  "inventory",
  "shipping",
  "checkout",
  "payments",
  "billing",
  "customers",
  "pos",
  "auth",
  "support",
  "notifications",
  "technical"
];
var ALIASES = {
  // domains
  "domain": "domains",
  "domains": "domains",
  "ssl": "domains",
  "dns": "domains",
  "https": "domains",
  "certificat": "domains",
  "certificate": "domains",
  "cloudflare": "domains",
  // builder
  "templates": "builder",
  "template": "builder",
  "theme": "builder",
  "themes": "builder",
  "design": "builder",
  "page": "builder",
  "pages": "builder",
  "navigation": "builder",
  "menu": "builder",
  "content": "builder",
  "contents": "builder",
  "cms": "builder",
  "seo": "builder",
  "section": "builder",
  "sections": "builder",
  "widget": "builder",
  "widgets": "builder",
  "sidebar": "builder",
  "footer": "builder",
  "header": "builder",
  "drag": "builder",
  "glisser": "builder",
  "verrouillage": "builder",
  "verrouill\xE9": "builder",
  "locked": "builder",
  "maintenance": "builder",
  "pr\xE9visualisation": "builder",
  "preview": "builder",
  "personnaliser": "builder",
  "couleur": "builder",
  "couleurs": "builder",
  "typographie": "builder",
  "favicon": "builder",
  "custom code": "builder",
  "code personnalis\xE9": "builder",
  "r\xE9seaux sociaux": "builder",
  "social": "builder",
  // apps
  "api": "apps",
  "app": "apps",
  "apps": "apps",
  "application": "apps",
  "applications": "apps",
  "modules": "apps",
  "module": "apps",
  "integration": "apps",
  "integrations": "apps",
  "webhook": "apps",
  "webhooks": "apps",
  // payments / checkout / billing
  "payment": "payments",
  "paiement": "payments",
  "payments": "payments",
  "checkout": "checkout",
  "coupon": "checkout",
  "coupons": "checkout",
  "invoice": "billing",
  "facture": "billing",
  "facturation": "billing",
  "billing": "billing",
  "subscription": "billing",
  "abonnement": "billing",
  // orders
  "order": "orders",
  "orders": "orders",
  "commande": "orders",
  // products / inventory
  "product": "products",
  "products": "products",
  "catalog": "products",
  "catalogue": "products",
  "sku": "products",
  "category": "products",
  "categories": "products",
  "collection": "products",
  "collections": "products",
  "stock": "inventory",
  "inventaire": "inventory",
  "inventory": "inventory",
  // shipping
  "shipment": "shipping",
  "shipping": "shipping",
  "delivery": "shipping",
  "livraison": "shipping",
  "expedition": "shipping",
  "exp\xE9dition": "shipping",
  "douchette": "shipping",
  "scanner": "shipping",
  "scan": "shipping",
  "barcode": "shipping",
  // customers / pos / auth / support
  "customer": "customers",
  "customers": "customers",
  "client": "customers",
  "utilisateur": "customers",
  "user": "customers",
  "compte": "customers",
  "pos": "pos",
  "caisse": "pos",
  "login": "auth",
  "connexion": "auth",
  "password": "auth",
  "mot de passe": "auth",
  "otp": "auth",
  "ticket": "support",
  "tickets": "support",
  "complaint": "support",
  "r\xE9clamation": "support",
  "complaints": "support"
};
function normalizeSujet(s) {
  const x = (s || "").toLowerCase().trim();
  if (!x) return "general";
  if (ALIASES[x]) return ALIASES[x];
  if (SUJETS.includes(x)) return x;
  return "unclear";
}
__name(normalizeSujet, "normalizeSujet");

// src/detection.ts
function canonicalModule(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "general";
  const norm = normalizeSujet(s);
  return toCoarseModule(norm);
}
__name(canonicalModule, "canonicalModule");
function toCoarseModule(x) {
  const v = String(x ?? "").trim().toLowerCase();
  if (!v || v === "unclear") return "general";
  if (v === "apps" || v === "builder" || v === "general" || v === "orders" || v === "products" || v === "settings" || v === "shipping" || v === "payments" || v === "billing" || v === "customers" || v === "pos" || v === "technical" || v === "auth" || v === "inventory" || v === "notifications") return v;
  const map = {
    // builder-ish
    "templates": "builder",
    "template": "builder",
    "content": "builder",
    "contents": "builder",
    "cms": "builder",
    "pages": "builder",
    "page": "builder",
    "navigation": "builder",
    "theme": "builder",
    "themes": "builder",
    "design": "builder",
    "seo": "builder",
    // settings-ish
    "domain": "settings",
    "domains": "settings",
    "dns": "settings",
    "ssl": "settings",
    "configuration": "settings",
    "config": "settings",
    // auth
    "auth": "auth",
    "login": "auth",
    "password": "auth",
    "mot de passe": "auth",
    "otp": "auth",
    "connexion": "auth",
    "authentification": "auth",
    "2fa": "auth",
    "d\xE9connexion": "auth",
    // notifications
    "notifications": "notifications",
    "notification": "notifications",
    "alerte": "notifications",
    "alertes": "notifications",
    "email notification": "notifications",
    "sms": "notifications",
    // payments
    "payment": "payments",
    "paiement": "payments",
    "carte": "payments",
    "transaction": "payments",
    "3ds": "payments",
    "stripe": "payments",
    // billing
    "invoice": "billing",
    "invoices": "billing",
    "facturation": "billing",
    "facture": "billing",
    "abonnement": "billing",
    "subscription": "billing",
    // orders
    "order": "orders",
    "commande": "orders",
    "orders_management": "orders",
    "checkout": "orders",
    "cart": "orders",
    "panier": "orders",
    // products
    "product": "products",
    "catalog": "products",
    "catalogue": "products",
    "sku": "products",
    "category": "products",
    "categories": "products",
    "collection": "products",
    "collections": "products",
    // inventory
    "inventory": "inventory",
    "inventaire": "inventory",
    "stock": "inventory",
    "rupture": "inventory",
    "disponibilit\xE9": "inventory",
    // shipping
    "delivery": "shipping",
    "carrier": "shipping",
    "livraison": "shipping",
    "expedition": "shipping",
    "exp\xE9dition": "shipping",
    "scanner": "shipping",
    "douchette": "shipping",
    "scan": "shipping",
    "barcode": "shipping",
    "manifeste": "shipping",
    "manifest": "shipping",
    "colis": "shipping",
    "\xE9tiquette": "shipping",
    "etiquette": "shipping",
    // customers
    "customer": "customers",
    "client": "customers",
    "clients": "customers",
    "utilisateur": "customers",
    "user": "customers",
    // apps / integrations
    "api": "apps",
    "integration": "apps",
    "integrations": "apps",
    "app": "apps",
    "application": "apps",
    "applications": "apps",
    "apps_store": "apps",
    "module": "apps",
    "modules": "apps",
    "webhook": "apps",
    "webhooks": "apps",
    "pixel": "apps",
    "facebook": "apps",
    "leads": "apps",
    "messenger": "apps",
    "tracking_automatique": "apps",
    "shipper": "apps",
    // pos
    "caisse": "pos",
    "point de vente": "pos",
    "magasin": "pos",
    "terminal": "pos",
    // technical
    "technical": "technical",
    "bug": "technical",
    "incident": "technical",
    "crash": "technical",
    "panne": "technical",
    // support → general
    "support": "general",
    "ticket": "general",
    "tickets": "general",
    "complaint": "general",
    "r\xE9clamation": "general"
  };
  return map[v] ?? "general";
}
__name(toCoarseModule, "toCoarseModule");
function detectPreferredModule(message, history) {
  const lowerMsg = message.toLowerCase();
  const moduleKeywords = {
    orders: {
      keywords: [
        "commande",
        "order",
        "commandes",
        "orders",
        "annuler commande",
        "annuler",
        "annulation",
        "remboursement",
        "rembourser",
        "suivi commande",
        "confirmer commande",
        "\xE9tat commande",
        "num\xE9ro de commande",
        "panier",
        "cart",
        "checkout",
        "code promo",
        "coupon",
        "validation commande",
        "confirmation de commande",
        "section commande",
        "section commandes",
        "report\xE9",
        "report\xE9e",
        "commande report\xE9e",
        "commandes report\xE9es",
        "lcommande",
        "tet3ada",
        "matet3adech",
        "mayet3adech",
        "ntab3ou",
        "ntaba3"
      ],
      weight: 1.8
    },
    builder: {
      keywords: [
        "template",
        "templates",
        "th\xE8me",
        "theme",
        "design",
        "menu",
        "navigation",
        "contenu",
        "content",
        "cms",
        "seo",
        "website builder",
        "mise en page",
        "en-t\xEAte",
        "header",
        "footer",
        "pied de page",
        "banni\xE8re",
        "banner",
        "banniere",
        "slider",
        "section",
        "bloc",
        "block",
        "\xE9diteur",
        "editeur",
        "personnaliser",
        "page d'accueil",
        "accueil",
        "homepage",
        "couleur",
        "color",
        "police",
        "font",
        "fond",
        "arri\xE8re-plan",
        "background",
        "logo",
        "favicon",
        "image de couverture",
        "galerie",
        "carousel",
        "popup",
        "pop-up",
        "bouton",
        "button",
        "formulaire",
        "responsive",
        "css",
        "style",
        "apparence",
        "visuel",
        "look",
        "affichage",
        "ajouter section",
        "modifier section",
        "supprimer section",
        "modifier la page",
        "cr\xE9er une page",
        "cr\xE9er page",
        "nouvelle page",
        "ajouter une page",
        "ajouter page",
        "supprimer la page",
        "modifier le contenu",
        "modifier contenu",
        "modifier le texte",
        "modifier texte",
        "sous-menu",
        "sous menu",
        "lien hypertexte",
        "ne s'affiche pas correctement",
        "mal affich\xE9",
        "affichage cass\xE9",
        "largeur",
        "taille",
        "responsive",
        "mobile",
        "upsell",
        "cross-sell",
        "landing page",
        "landing",
        "social media",
        "r\xE9seaux sociaux",
        "instagram",
        "lien instagram",
        "video banniere",
        "vid\xE9o banni\xE8re",
        "image cliquable",
        "site ralenti",
        "titre",
        "bande",
        "mod\xE8le",
        "ldesign",
        "lpage"
      ],
      weight: 2
    },
    products: {
      keywords: [
        "produit",
        "product",
        "produits",
        "products",
        "sku",
        "r\xE9f\xE9rence",
        "reference",
        "catalogue",
        "catalog",
        "variant",
        "variante",
        "collection",
        "cat\xE9gorie",
        "categorie",
        "category",
        "import produit",
        "export produit",
        "image produit",
        "photo produit",
        "prix produit",
        "ajouter produit",
        "modifier produit",
        "supprimer produit",
        "fiche produit",
        "page produit",
        "ne s'affiche pas",
        "ne s'affichent pas",
        "n'apparait pas",
        "n'apparaissent pas",
        "lproduit",
        "tsawer",
        "ma ytla3ch",
        "maytla3ch",
        "ma ybanch",
        "maybanch",
        "yetl3ouli",
        "metetla3"
      ],
      weight: 1.7
    },
    payments: {
      keywords: [
        "paiement",
        "payment",
        "carte bancaire",
        "carte",
        "cb",
        "visa",
        "mastercard",
        "refus\xE9 paiement",
        "refuse",
        "transaction",
        "3ds",
        "stripe",
        "gateway",
        "passerelle",
        "tpe en ligne",
        "lpaiement",
        "5alas",
        "5alast",
        "n5ales",
        "carta",
        "flouss",
        "mat3adech"
      ],
      weight: 1.7
    },
    settings: {
      keywords: [
        "domaine",
        "domain",
        "dns",
        "ssl",
        "https",
        "certificat",
        "certificate",
        "cloudflare",
        "nameserver",
        "ns",
        "erreur 403",
        "erreur 404",
        "err_",
        "net::err",
        "hors ligne",
        "param\xE8tres du site",
        "configurer le site",
        "r\xE9glages du site",
        "langue du site",
        "configuration",
        "param\xE8tres",
        "lsite",
        "yatla3li"
      ],
      weight: 1.5
    },
    shipping: {
      keywords: [
        "livraison",
        "shipping",
        "livreur",
        "exp\xE9dition",
        "expedition",
        "colis",
        "manifeste",
        "manifest",
        "\xE9tiquette",
        "etiquette",
        "douchette",
        "scanner",
        "scan",
        "barcode",
        "suivi colis",
        "transporteur",
        "carrier",
        "retour colis",
        "ramassage",
        "bon de livraison",
        "bordereau",
        "llivraison",
        "ma wsltch",
        "mawsltch"
      ],
      weight: 1.6
    },
    billing: {
      keywords: [
        "facturation",
        "billing",
        "facture",
        "invoice",
        "factures",
        "abonnement",
        "subscription",
        "plan",
        "forfait",
        "renouvellement",
        "upgrade",
        "downgrade",
        "lfacture"
      ],
      weight: 1.5
    },
    pos: {
      keywords: [
        "pos",
        "caisse",
        "caiss",
        "point de vente",
        "magasin",
        "terminal",
        "vente en magasin",
        "caisse enregistreuse",
        "session caisse",
        "session de vente",
        "tva",
        "total tva",
        "ticket de caisse",
        "bon de caisse",
        "vente physique",
        "vente en boutique",
        "boutique physique",
        "personnel",
        "gestion personnel",
        "gestion des personnels",
        "co\xFBt marchandise",
        "cout marchandise",
        "facture pos",
        "factures pos",
        "facture de notre pos",
        "lcaisse",
        "lmagasin"
      ],
      weight: 1.6
    },
    customers: {
      keywords: [
        "fiche client",
        "compte client",
        "profil client",
        "liste client",
        "customer",
        "customers",
        "gestion client",
        "gestion des clients",
        "utilisateur",
        "user",
        "profil",
        "compte utilisateur",
        "donn\xE9es client",
        "supprimer client",
        "modifier client"
      ],
      weight: 1.3
    },
    apps: {
      keywords: [
        "api",
        "endpoint",
        "webhook",
        "integration",
        "int\xE9gration",
        "developpeur",
        "developer",
        "modules",
        "module",
        "application",
        "applications",
        "facebook pixel",
        "pixel",
        "leads facebook",
        "pixel facebook",
        "tracking automatique",
        "conversion pixel",
        "shipper",
        "first delivery"
      ],
      weight: 1.2
    },
    technical: {
      keywords: [
        "erreur 500",
        "error 500",
        "erreur 502",
        "error 502",
        "erreur 503",
        "erreur 504",
        "error 504",
        "gateway timeout",
        "internal server error",
        "site crash",
        "crash",
        "bug",
        "site down",
        "site ne fonctionne pas",
        "site ne marche pas",
        "page blanche",
        "page vide",
        "panne",
        "plante",
        "ne charge pas",
        "ne s'affiche pas",
        "serveur",
        "server error",
        "500 error",
        "502 error",
        "503 error",
        "504 error",
        "timeout",
        "ne r\xE9pond pas",
        "ne repond pas",
        "site plant\xE9",
        "site plante",
        "erreur serveur",
        "erreur technique",
        "probl\xE8me technique",
        "probleme technique",
        "lsite ma5dimch",
        "site ma5demch",
        "lsite 5asro",
        "bug technique"
      ],
      weight: 2
    },
    auth: {
      keywords: [
        "login",
        "connexion",
        "mot de passe",
        "password",
        "otp",
        "mot de pass",
        "authentification",
        "2fa",
        "d\xE9connexion",
        "deconnexion",
        "d\xE9connect\xE9",
        "deconnecte",
        "connecter",
        "se connecter",
        "me connecter",
        "pas connecter",
        "acc\xE8s",
        "acces",
        "acc\xE9der",
        "acceder",
        "identifiant",
        "identifiants",
        "r\xE9initialiser mot de passe",
        "reset password",
        "forgot password",
        "oubli\xE9 mot de passe",
        "session expir\xE9e",
        "session expiree",
        "code otp",
        "v\xE9rification otp",
        "verification otp",
        "llogin",
        "lpassword",
        "lconnexion"
      ],
      weight: 1.8
    },
    inventory: {
      keywords: [
        "stock",
        "inventaire",
        "inventory",
        "quantit\xE9",
        "quantite",
        "disponibilit\xE9",
        "disponibilite",
        "rupture de stock",
        "rupture",
        "en stock",
        "hors stock",
        "out of stock",
        "mise \xE0 jour stock",
        "maj stock",
        "stock disponible",
        "gestion stock",
        "gestion des stocks",
        "niveau de stock",
        "niveaux de stock",
        "ajuster stock",
        "ajustement stock",
        "stock n\xE9gatif",
        "stock negatif",
        "synchroniser stock",
        "sync stock",
        "lstock",
        "linventaire"
      ],
      weight: 1.6
    },
    notifications: {
      keywords: [
        "notification",
        "notifications",
        "email notification",
        "sms",
        "alerte",
        "alertes",
        "webhook",
        "email automatique",
        "mail automatique",
        "notification email",
        "notification sms",
        "notification push",
        "envoyer notification",
        "configurer notification",
        "d\xE9sactiver notification",
        "desactiver notification",
        "activer notification",
        "param\xE8tres notification",
        "notification commande",
        "notification client",
        "email de confirmation",
        "email confirmation",
        "mail de confirmation",
        "lnotification",
        "lnotifications"
      ],
      weight: 1.4
    },
    general: {
      keywords: [
        "activer mon compte",
        "activation boutique",
        "activation compte",
        "activer boutique",
        "cr\xE9er boutique",
        "nouvelle boutique",
        "ouvrir boutique",
        "cree boutique",
        "cree nouveau boutique",
        "changer nom boutique",
        "changement nom",
        "nom de boutique",
        "nom boutique",
        "nom de la boutique",
        "changer le nom",
        "changer email",
        "modifier email",
        "v\xE9rification email",
        "verification email",
        "changer l'email",
        "team",
        "\xE9quipe",
        "capacit\xE9 pack",
        "pack",
        "liaison",
        "demande de liaison",
        "confirmation de la liaison",
        "retard de confirmation",
        "compte bloqu\xE9",
        "compte bloquer",
        "compte bloqu",
        "blocked",
        "duplication",
        "dupliquer",
        "duplication du site",
        "hallt boutique",
        "halit boutique",
        "7alit boutique",
        "n7el boutique"
      ],
      weight: 1
    }
  };
  const scores = {};
  for (const [module, cfg] of Object.entries(moduleKeywords)) {
    let score = 0;
    for (const kw of cfg.keywords) {
      if (kw && lowerMsg.includes(kw)) score += cfg.weight;
    }
    if (score > 0) scores[module] = score;
  }
  const recentHistory = history.slice(-4);
  for (let i = 0; i < recentHistory.length; i++) {
    const msg = recentHistory[i];
    const lowerHist = msg.content.toLowerCase();
    const decay = 0.2 * (1 - i / Math.max(1, recentHistory.length));
    for (const [module, cfg] of Object.entries(moduleKeywords)) {
      for (const kw of cfg.keywords) {
        if (kw && lowerHist.includes(kw)) {
          scores[module] = (scores[module] || 0) + cfg.weight * decay;
        }
      }
    }
  }
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
__name(detectPreferredModule, "detectPreferredModule");
function extractEntities(message) {
  const m = message || "";
  const out = {};
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
  const carrierMatch = m.match(/\b(droppex|aramex|fedex|dhl|chronopost|rapid\s*poste|poste\s*tunisienne|ups|tnt|express\s*delivery|mylerz|yan?lidine|maystro|genex|sobflous)\b/i);
  if (carrierMatch) out.carrier = carrierMatch[1].toLowerCase();
  if (/capture|screenshot|image|photo|pièce.?jointe|pj|fichier joint|ci.?joint|voir.?(?:la|le|l')?.?(?:capture|image|photo)/i.test(m)) {
    out.has_screenshot_mention = true;
  }
  const allOrderRefs = m.match(/\b\d{8,}\b/g);
  if (allOrderRefs && allOrderRefs.length > 1) {
    out.order_refs = [...new Set(allOrderRefs)].slice(0, 10);
  }
  return out;
}
__name(extractEntities, "extractEntities");
function detectLanguage(msg) {
  const m = (msg || "").trim();
  if (/[\u0600-\u06FF]/.test(m)) return "ar";
  if (/\b(y7el|5alas|ma5dem|matet3ada|7alit|wesh|bech|chnou|kifech|3lech|ya5i)\b/i.test(m)) return "darija";
  if (/\b(the|is|are|have|this|that|with|from|what|where|when|how|please|help)\b/i.test(m)) return "en";
  return "fr";
}
__name(detectLanguage, "detectLanguage");
function checkHardEscalation(message) {
  const hardPatterns = [
    { pattern: /\b(500|502|503|504)\s*(error|erreur)?\b/i, reason: "HTTP 5xx error" },
    { pattern: /\binternal server error\b/i, reason: "Internal server error" },
    { pattern: /\bservice unavailable\b/i, reason: "Service unavailable" },
    { pattern: /\btimeout\b.*\b(error|erreur|serveur|server)\b/i, reason: "Server timeout" },
    { pattern: /\berreur\s*serveur\b/i, reason: "Server error" },
    { pattern: /\bpanne\s*(système|totale|complète|generale)?\b/i, reason: "System outage" }
  ];
  for (const { pattern, reason } of hardPatterns) {
    if (pattern.test(message)) return { triggered: true, reason };
  }
  return { triggered: false, reason: "" };
}
__name(checkHardEscalation, "checkHardEscalation");
function isGreetingOnly(msg) {
  const greetings = ["salut", "bonjour", "hello", "hi", "hey", "salam", "slm", "bsr", "bonsoir", "cc", "coucou", "wesh", "\u0627\u0644\u0633\u0644\u0627\u0645", "\u0635\u0628\u0627\u062D", "\u0645\u0631\u062D\u0628\u0627"];
  const lower = msg.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;
  if (wordCount > 4) return false;
  if (wordCount > 2) {
    const hasContent = /\b(commande|produit|livraison|paiement|domaine|erreur|probl[eè]m|site|stock|aide|comment|marche pas|fonctionne|bug|bloqu|template|ssl|dns|import|activ|factur|abonn)\b/i.test(lower);
    if (hasContent) return false;
  }
  return greetings.some((g) => lower === g || lower.startsWith(g + " ") || lower.endsWith(" " + g));
}
__name(isGreetingOnly, "isGreetingOnly");
function isThanksOnly(msg) {
  const lower = msg.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;
  if (wordCount > 6) return false;
  const thanks = ["merci", "thank", "thanks", "thx", "\u0634\u0643\u0631\u0627", "choukran", "thnx"];
  if (thanks.some((t) => lower === t || lower.startsWith(t + " ") || lower.endsWith(" " + t))) return true;
  if (/^(merci\s+(bcp|beaucoup|bien|infiniment)|thanks?\s+(a lot|so much)|c['\u2019]est\s+(parfait|bon|r[eé]gl[eé]|r[eé]solu)|super\s*!?|nickel|top|parfait|excellent|g[eé]nial)\s*!*$/i.test(lower)) return true;
  return false;
}
__name(isThanksOnly, "isThanksOnly");
function areModulesRelated(module1, module2) {
  const m1 = canonicalModule(module1);
  const m2 = canonicalModule(module2);
  const relatedGroups = [
    ["shipping", "orders", "products", "inventory"],
    ["orders", "checkout", "payments"],
    ["domains", "settings", "builder"],
    ["products", "inventory", "builder"],
    ["billing", "payments", "settings"],
    ["apps", "settings", "technical"]
  ];
  return relatedGroups.some((group) => group.includes(m1) && group.includes(m2));
}
__name(areModulesRelated, "areModulesRelated");
function inferModuleFromRetrieval(pbCtx, docsCtx) {
  const moduleScores = {};
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
__name(inferModuleFromRetrieval, "inferModuleFromRetrieval");

// src/helpers.ts
function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-internal-secret",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");
function preflight(req) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
__name(preflight, "preflight");
function text(req, body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(req) }
  });
}
__name(text, "text");
function json(req, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) }
  });
}
__name(json, "json");
function clamp01(v) {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
__name(clamp01, "clamp01");
async function safeReadJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
__name(safeReadJson, "safeReadJson");
function toStr(x) {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}
__name(toStr, "toStr");
var DASH_BASE = "https://app.tiktak.pro";
var ROUTE_BY_CONTEXT = {
  orders: "/orders",
  products: "/products",
  builder: "/builder",
  settings: "/settings",
  shipping: "/shipping",
  payments: "/payments",
  billing: "/billing",
  pos: "/pos",
  apps: "/apps-store",
  customers: "/customers"
};
function routeFor(context, subRoute) {
  const base = ROUTE_BY_CONTEXT[context];
  if (!base) return null;
  return subRoute ? `${DASH_BASE}${base}/${subRoute}` : `${DASH_BASE}${base}`;
}
__name(routeFor, "routeFor");
function fallbackUiLink(context, _category) {
  const route = ROUTE_BY_CONTEXT[context];
  if (!route) return null;
  return { label: "Ouvrir l'\xE9cran TikTak", route: `${DASH_BASE}${route}` };
}
__name(fallbackUiLink, "fallbackUiLink");
function extractJsonBlock(raw) {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const obj = raw.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  return null;
}
__name(extractJsonBlock, "extractJsonBlock");
function mergeFollowupIntoQuery(message, state) {
  if (!state?.waiting_for || !state?.original_question) {
    return { merged: message, isFollowup: false };
  }
  return {
    merged: `${state.original_question}
[R\xE9ponse: ${message}]`,
    isFollowup: true
  };
}
__name(mergeFollowupIntoQuery, "mergeFollowupIntoQuery");
function setWaitingState(prev, waitingFor, originalQuestion) {
  return {
    waiting_for: waitingFor,
    original_question: originalQuestion,
    clarify_count: (prev?.clarify_count ?? 0) + 1
  };
}
__name(setWaitingState, "setWaitingState");
function augmentSignals(base, extras = {}) {
  const urgent = extras.message ? /\b(urgent|asap|immediately|critique|bloqué|stuck|immédiatement)\b/i.test(extras.message) : false;
  if (urgent && base.severity === "low") {
    base.severity = "medium";
  }
  return base;
}
__name(augmentSignals, "augmentSignals");
function normalizeSupportResponse(data) {
  const raw = data && typeof data === "object" ? data : {};
  const modeRaw = toStr(raw?.mode || "");
  const mode = modeRaw === "solve" || modeRaw === "escalate" || modeRaw === "clarify" ? modeRaw : raw?.verdict === "tiktak_side" ? "escalate" : raw?.verdict === "user_side" ? "solve" : "clarify";
  const confidence = typeof raw?.confidence === "number" ? clamp01(raw.confidence) : 0;
  const contextRaw = toStr(raw?.context ?? raw?.preferredModule ?? raw?.category ?? raw?.signals?.preferredModule ?? "");
  const preferredModule = toCoarseModule(raw?.preferredModule ?? raw?.signals?.preferredModule ?? contextRaw ?? raw?.category);
  const context = preferredModule;
  const ui = raw?.ui ?? null;
  const actions = Array.isArray(raw?.actions) ? raw.actions : [];
  const questions = Array.isArray(raw?.questions) ? raw.questions.map((q) => toStr(q)) : [];
  let answer = typeof raw?.answer === "string" ? raw.answer : "";
  if (!answer && questions.length) {
    const cleaned = questions.map((q) => q.trim()).filter(Boolean);
    if (cleaned.length) answer = "J'ai besoin de pr\xE9ciser :\n- " + cleaned.join("\n- ");
  }
  if (!answer && mode === "escalate") {
    answer = "Je propose d'escalader ce probl\xE8me \xE0 l'\xE9quipe support TikTak PRO.";
  }
  const cat = toStr(raw?.category ?? "").toLowerCase();
  const incidentCategory = ["incident", "outage", "api_down", "backend_error", "permission_issue", "bug_confirmed"].includes(cat);
  const incident = Boolean(raw?.signals?.incident ?? incidentCategory);
  const rawSignals = raw?.signals ?? {};
  const out = {
    mode,
    answer,
    signals: {
      confidence: Number(confidence.toFixed(2)),
      preferredModule,
      incident,
      severity: typeof rawSignals.severity === "string" ? rawSignals.severity : void 0,
      category: typeof rawSignals.category === "string" ? rawSignals.category : void 0,
      sentiment: typeof rawSignals.sentiment === "string" ? rawSignals.sentiment : void 0,
      escalation_recommended: typeof rawSignals.escalation_recommended === "boolean" ? rawSignals.escalation_recommended : void 0,
      strategy: typeof rawSignals.strategy === "string" ? rawSignals.strategy : void 0,
      strategy_reason: typeof rawSignals.strategy_reason === "string" ? rawSignals.strategy_reason : void 0
    },
    context,
    ui,
    actions
  };
  if (Array.isArray(raw?.evidence)) out.evidence = raw.evidence;
  if (typeof raw?.next_question === "string") out.next_question = raw.next_question;
  if (typeof raw?.escalate === "boolean") out.escalate = raw.escalate;
  if (typeof raw?.verdict === "string") out.verdict = raw.verdict;
  if (typeof raw?.category === "string") out.category = raw.category;
  if (raw?.state) out.state = raw.state;
  if (typeof raw?.ticket_type === "string") out.ticket_type = raw.ticket_type;
  if (typeof raw?.sentiment === "string") out.sentiment = raw.sentiment;
  if (typeof raw?.severity === "string") out.severity = raw.severity;
  if (typeof raw?.detected_language === "string") out.detected_language = raw.detected_language;
  if (typeof raw?.processing_time_ms === "number") out.processing_time_ms = raw.processing_time_ms;
  out.preferredModule = preferredModule;
  out.detected_module = out.context;
  if (!out.ui && out.mode === "solve") out.ui = fallbackUiLink(out.context, out.category);
  return out;
}
__name(normalizeSupportResponse, "normalizeSupportResponse");

// src/prompt.ts
function empathyBlock(turnCount, sentiment) {
  if (turnCount < 1) return "";
  if (sentiment !== "frustrated" && sentiment !== "urgent") return "";
  if (sentiment === "frustrated") {
    return `
EMPATHIE (le marchand semble frustr\xE9):
- Commence par reconna\xEEtre l'\xE9motion: "Je comprends ta frustration\u2026", "Je suis d\xE9sol\xE9 pour ce d\xE9sagr\xE9ment\u2026"
- Montre que tu prends le probl\xE8me au s\xE9rieux: "On va r\xE9soudre \xE7a ensemble"
- Ne minimise jamais le probl\xE8me du marchand`;
  }
  return `
EMPATHIE (situation urgente):
- Montre de la r\xE9activit\xE9: "Je comprends l'urgence\u2026", "On s'en occupe tout de suite"
- Priorise la solution la plus rapide
- Si escalade n\xE9cessaire, rassure: "Je transf\xE8re imm\xE9diatement \xE0 l'\xE9quipe technique"`;
}
__name(empathyBlock, "empathyBlock");
function getSystemPrompt(opts) {
  const empathy = empathyBlock(opts?.turnCount ?? 0, opts?.sentiment);
  return `Tu es l'assistant IA de TikTak PRO. Objectif: r\xE9soudre la majorit\xE9 des demandes L0/L1 (le marchand applique tes \xE9tapes). Escalade = dernier recours.

PERSONNALIT\xC9: Tu es un vrai coll\xE8gue, pas un robot. Professionnel mais naturel. Tu tutoies. Tu r\xE9agis comme un humain: si le probl\xE8me est simple tu vas droit au but, si c'est complexe tu montres que tu comprends la difficult\xE9.

=== LANGUE ===
- Par d\xE9faut: r\xE9pondre en FRAN\xC7AIS.
- Si le marchand \xE9crit en arabe standard: tu peux r\xE9pondre en arabe standard.
- Tu comprends darija/arabizi (ex: "mayhbch", "yekhdm", "ki ndir") MAIS tu ne produis PAS de phrases en darija/arabizi.
  Exception: salutations tr\xE8s courtes ("Aaslema") autoris\xE9es si le marchand \xE9crit en darija.
- Tu peux citer un message d'erreur EXACT du marchand (code, texte) m\xEAme s'il est en arabe/darija, pour confirmer le diagnostic.
- INTERDIT: "je vais supposer que\u2026" \u2192 dis directement ce que tu comprends ou pose une question claire.

=== INDICES DE ROUTAGE (PRIORIT\xC9 ABSOLUE) ===
Si le bloc INDICES DE ROUTAGE contient FORCE_CATEGORY, PREFERRED_CATEGORY, FORCE_ESCALATE ou FORCE_VERDICT \u2192 respecte-les dans ton JSON, sans discussion.

MODULES (champ "category"):
- orders: Commandes, suivi, annulations, codes promo, coupons, checkout, bordereau, confirmation, panier
- products: Produits, catalogue, variants, cat\xE9gories, images, import produits, fiche produit, page produit
- builder: Templates, design, sections, banni\xE8res, SEO, pages, header/footer, apparence, logo, couleurs, CSS
- settings: Domaines, DNS, SSL, certificat, langue, configuration site, nom de domaine
- shipping: Livraison, transporteurs, synchronisation livreurs, colis, tracking, ramassage, bordereau livraison, exp\xE9dition
- payments: Paiement en ligne, Stripe, Konnect, carte bancaire, activation paiement, transaction, eDinar
- billing: Factures TikTak, abonnement, forfait, renouvellement, plan, commissions
- pos: Point de vente, caisse enregistreuse, TVA, ticket de caisse, personnel, vente boutique
- apps: Int\xE9grations, API, Shopify, Facebook Pixel, webhooks, modules tiers, shipper
- customers: Gestion clients, profils utilisateurs, r\xE9clamations
- technical: Erreurs serveur 5xx (500, 502, 503, 504), gateway timeout, site crash, panne, bug technique
- auth: Login, mot de passe, OTP, 2FA, d\xE9connexion, session expir\xE9e, r\xE9initialiser mot de passe
- inventory: Stock, inventaire, rupture de stock, gestion des stocks, synchronisation stock
- notifications: Notifications email/SMS, alertes, emails automatiques, notification commande
- general: Activation boutique, changement email/nom, duplication site, liaison, \xE9quipe/team, pack

=== PHASES DE CONVERSATION ===
Le bloc \xC9TAT CONVERSATION dans les INDICES DE ROUTAGE te dit la phase actuelle, les \xE9tapes d\xE9j\xE0 donn\xE9es, les donn\xE9es fournies, et ce que le marchand affirme. RESPECTE-LE.

PHASE GREETING (1er message):
- Si "comment faire X ?" ou demande claire \u2192 r\xE9ponds directement (2-3 \xE9tapes)
- Si probl\xE8me vague \u2192 pose 1 question cibl\xE9e (verdict="unclear", next_question)
- Jamais de solution g\xE9n\xE9rique sans comprendre le probl\xE8me

PHASE DIAGNOSE (questions pos\xE9es, pas encore de solution):
- Pose 1 question pr\xE9cise et DIFF\xC9RENTE des pr\xE9c\xE9dentes.
- Si la question est "comment faire X ?" (type=question), tu n'as PAS besoin de diagnostiquer. Donne directement les \xE9tapes.
- Si le marchand donne un d\xE9tail ou r\xE9pond oui/non \u2192 passe IMMI\xC9DIATEMENT en PRESCRIBE

PHASE PRESCRIBE (diagnostic fait, on donne des \xE9tapes):
- Le marchand a r\xE9pondu \xE0 ta question. DONNE 2-3 \xE9tapes CONCR\xC8TES. PAS de nouvelles questions.
- Utilise la base de connaissances + les donn\xE9es fournies par le marchand.
- Si le marchand a fourni des r\xE9f\xE9rences/num\xE9ros, utilise-les dans ta r\xE9ponse.

PHASE FOLLOWUP (le marchand revient apr\xE8s tes \xE9tapes):
- Lis le bloc \xC9TAPES D\xC9J\xC0 DONN\xC9ES. NE R\xC9P\xC8TE AUCUNE.
- Si "\xE7a marche pas" / "persiste" \u2192 propose une ALTERNATIVE (diff\xE9rente route, autre v\xE9rification)
- Si "tout v\xE9rifi\xE9" \u2192 pose 1 question d'approfondissement hyper cibl\xE9e

PHASE EXHAUSTED (3+ \xE9changes, rien ne marche):
- Propose 1 dernier diagnostic cibl\xE9 (ex: "envoie-moi une capture de X")
- OU escalade directement (escalate=true, verdict="tiktak_side")

CHANGEMENT DE SUJET:
- Si le bloc \xC9TAT CONVERSATION mentionne "CHANGEMENT DE SUJET", le marchand parle d'un NOUVEAU probl\xE8me.
- Traite le nouveau sujet comme un nouveau ticket. Oublie les \xE9tapes/questions du sujet pr\xE9c\xE9dent.
- R\xE9ponds naturellement: "Pas de souci, on passe \xE0 [nouveau sujet]."

R\xC8GLES CL\xC9S:
- 2-3 \xE9tapes MAX par r\xE9ponse
- Ne redemande JAMAIS une info d\xE9j\xE0 donn\xE9e (v\xE9rifie DONN\xC9ES D\xC9J\xC0 FOURNIES)
- Ne redonne JAMAIS une \xE9tape d\xE9j\xE0 donn\xE9e
- Si le marchand r\xE9pond "oui"/"non"/"ok" = il a r\xE9pondu \xE0 ta question, AVANCE
- Si le bloc \xC9TAT CONVERSATION dit DIRECTIVE \u2192 suis-la imp\xE9rativement
=== STYLE (answer) ===
- VARIE tes accus\xE9s de r\xE9ception. Alterne entre: "Je vois !", "Bien re\xE7u", "Compris", "OK je regarde", "C'est not\xE9", "Parfait, je vais t'aider avec \xE7a". NE R\xC9P\xC8TE PAS la m\xEAme ouverture 2 fois de suite.
- \xC9tapes num\xE9rot\xE9es 1..3, **Gras** pour menus/boutons
- Concis: 2-4 phrases si simple, \xE9tapes num\xE9rot\xE9es si proc\xE9dure
- Terminer par suivi VARI\xC9: "Dis-moi si \xE7a fonctionne !", "Tiens-moi au courant", "H\xE9site pas si tu bloques", "Tu me dis ?"
- Apr\xE8s une solution, tu PEUX ajouter 1 conseil proactif court: "\u{1F4A1} Astuce: tu peux aussi..." (seulement si pertinent)
- JAMAIS inventer de fonctionnalit\xE9s \u2014 UNIQUEMENT la base de connaissances fournie
- Ne mentionne JAMAIS: playbook, documentation, docs, guide, base de connaissances. TU es la source.
- Emojis: 1-2 max (pas plus)
- Quand le marchand donne un d\xE9tail sp\xE9cifique (r\xE9f\xE9rence, URL, nom de domaine), UTILISE-LE dans ta r\xE9ponse pour montrer que tu as lu
- Si le marchand change de sujet, r\xE9ponds au NOUVEAU sujet sans r\xE9f\xE9rencer l'ancien
${empathy}
=== ESCALADE ===
escalade (verdict="tiktak_side", escalate=true) uniquement si:
- Incident TikTak confirm\xE9 (5xx / crash / API down / fonction cass\xE9e)
- OU toutes solutions \xE9puis\xE9es, marchand a tout essay\xE9, plus aucune alternative
- OU n\xE9cessite acc\xE8s backend/serveur

La frustration/urgence influence le TON, pas la d\xE9cision d'escalade.

=== FORMAT JSON STRICT (rien avant/apr\xE8s) ===
{"verdict":"...","confidence":0.0-1.0,"category":"module","ticket_type":"...","sentiment":"...","severity":"...","detected_language":"...","answer":"...","next_question":"..." ou null,"escalate":boolean,"evidence":[],"actions":[]}

TICKET_TYPE: "bug" (fonctionnalit\xE9 cass\xE9e) | "question" (comment faire X) | "demand" (activation/modification) | "incident" (urgence: site down, 5xx, paiement bloqu\xE9)
SENTIMENT: "calm" | "frustrated" | "urgent" | "satisfied"
SEVERITY: "low" (pas d'impact) | "medium" (contournable) | "high" (bloque fonctionnalit\xE9) | "critical" (site down/perte donn\xE9es)
DETECTED_LANGUAGE: "fr" | "ar" | "darija" | "en"

R\xC8GLES FINALES:
- verdict="unclear" \u2192 next_question obligatoire (1 seule question pr\xE9cise)
- verdict != "unclear" \u2192 next_question=null
- Historique: ne redemande pas, ne redonne pas. Si \xE9chec \u2192 ALTERNATIVE ou escalade.
- Si DONN\xC9ES D\xC9J\xC0 FOURNIES liste des r\xE9f\xE9rences/URLs, UTILISE-les. Ne les redemande pas.
- Si le marchand r\xE9pond "oui"/"non" \u2192 ta question pr\xE9c\xE9dente EST r\xE9pondue. Passe aux \xE9tapes.`;
}
__name(getSystemPrompt, "getSystemPrompt");
function buildLlmMessages(currentMessage, history, knowledgeContext, routingHints, opts) {
  const systemPrompt = getSystemPrompt(opts);
  const msgs = [
    { role: "system", content: systemPrompt }
  ];
  const recentHistory = history.slice(-12);
  for (const msg of recentHistory) {
    msgs.push({ role: msg.role, content: msg.content.slice(0, 400) });
  }
  const hintsBlock = routingHints ? `
--- INDICES DE ROUTAGE ---
${routingHints}
` : "";
  const userContent = `${currentMessage}${hintsBlock}
--- BASE DE CONNAISSANCES ---
${knowledgeContext}

R\xE9ponds UNIQUEMENT en JSON valide.`;
  msgs.push({ role: "user", content: userContent });
  msgs.push({ role: "assistant", content: "{" });
  return msgs;
}
__name(buildLlmMessages, "buildLlmMessages");

// src/rag.ts
async function embedText(env, text2) {
  try {
    const result = await env.AI.run(EMBED_MODEL, { text: text2 });
    if (result?.data?.[0]) return result.data[0];
    return null;
  } catch {
    return null;
  }
}
__name(embedText, "embedText");
async function smartFetchContext(env, index, vector, tenantId, preferredModule, maxResults, contextType) {
  const results = await index.query(vector, {
    topK: maxResults * 3,
    filter: { tenant_id: tenantId },
    returnMetadata: "all"
  });
  const matches = results?.matches || [];
  const scoredMatches = matches.map((match) => {
    let score = match.score || 0;
    const itemModuleRaw = toStr(match.metadata?.module || "");
    const itemModule = canonicalModule(itemModuleRaw);
    const pref = canonicalModule(preferredModule);
    if (itemModule === pref) {
      score *= 1.5;
    } else if (areModulesRelated(itemModule, pref)) {
      score *= 1.2;
    }
    return { ...match, adjustedScore: score };
  });
  scoredMatches.sort((a, b) => (b.adjustedScore || 0) - (a.adjustedScore || 0));
  const seen = /* @__PURE__ */ new Set();
  const uniqueMatches = scoredMatches.filter((m) => {
    const key = `${m.metadata?.module}-${m.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const topMatches = uniqueMatches.slice(0, maxResults);
  const scores = topMatches.map((m) => m.adjustedScore || 0);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const topScore = scores.length ? Math.max(...scores) : 0;
  const items = [];
  if (contextType === "playbook") {
    for (const match of topMatches) {
      const r2Key = toStr(match.metadata?.r2_key || "");
      if (!r2Key) continue;
      try {
        const obj = await env.TIKTAK_DOCS.get(r2Key);
        if (!obj) continue;
        const raw = await obj.text();
        const parsed = JSON.parse(raw);
        items.push({
          id: match.id,
          text: formatPlaybookForContext(parsed.playbook),
          score: match.adjustedScore || 0,
          module: toStr(match.metadata?.module || "")
        });
      } catch {
        continue;
      }
    }
  } else {
    for (const match of topMatches) {
      items.push({
        id: match.id,
        text: toStr(match.metadata?.text || ""),
        score: match.adjustedScore || 0,
        module: toStr(match.metadata?.module || "")
      });
    }
  }
  const text2 = items.map((item) => item.text).join("\n\n---\n\n");
  return { text: text2, items, matches: topMatches, avgScore, topScore };
}
__name(smartFetchContext, "smartFetchContext");
function formatPlaybookForContext(playbook) {
  const parts = [];
  parts.push(`[PLAYBOOK: ${playbook.title || playbook.id}]`);
  if (playbook.scope) parts.push(`Module: ${playbook.scope}`);
  if (playbook.description) parts.push(`Description: ${playbook.description}`);
  if (playbook.triggers && playbook.triggers.length > 0) {
    parts.push(`Mots-cl\xE9s: ${playbook.triggers.slice(0, 8).join(", ")}`);
  }
  if (playbook.scanner_setup) {
    parts.push(`
Configuration Scanner:`);
    for (const [key, value] of Object.entries(playbook.scanner_setup)) {
      parts.push(`- ${key}: ${value}`);
    }
  }
  if (playbook.common_errors && playbook.common_errors.length > 0) {
    parts.push(`
Erreurs Fr\xE9quentes:`);
    for (const err of playbook.common_errors.slice(0, 4)) {
      parts.push(`\u2022 Sympt\xF4me: ${err.symptom}`);
      parts.push(`  Cause: ${err.cause}`);
      parts.push(`  Solution: ${err.solution}`);
    }
  }
  if (playbook.diagnostic_checklist) {
    parts.push(`
Diagnostic: ${JSON.stringify(playbook.diagnostic_checklist)}`);
  }
  parts.push(`
\xC9tapes (${playbook.steps.length}):`);
  for (let i = 0; i < Math.min(playbook.steps.length, 6); i++) {
    const step = playbook.steps[i];
    parts.push(`${i + 1}. [${step.kind.toUpperCase()}]`);
    if (step.title) parts.push(`   ${step.title}`);
    switch (step.kind) {
      case "ask":
        parts.push(`   Q: ${step.question.slice(0, 150)}`);
        break;
      case "solve":
        parts.push(`   ${step.response.slice(0, 250)}`);
        if (step.common_errors && step.common_errors.length > 0) {
          parts.push(`   Erreurs: ${step.common_errors.slice(0, 3).join(", ")}`);
        }
        if (step.common_fixes && step.common_fixes.length > 0) {
          parts.push(`   Solutions: ${step.common_fixes.slice(0, 3).join(", ")}`);
        }
        break;
      case "escalate":
        parts.push(`   Raison: ${step.reason}`);
        break;
    }
  }
  if (playbook.best_practices && playbook.best_practices.length > 0) {
    parts.push(`
Bonnes Pratiques:`);
    playbook.best_practices.slice(0, 3).forEach((p) => parts.push(`- ${p}`));
  }
  return parts.join("\n");
}
__name(formatPlaybookForContext, "formatPlaybookForContext");
function gatherEvidence(modelEvidence, playbookContext, docsContext, maxEvidence = 6) {
  const evidenceMap = /* @__PURE__ */ new Map();
  if (Array.isArray(modelEvidence)) {
    for (const e of modelEvidence) {
      if (!e?.id || !e?.snippet) continue;
      const source = e?.source === "playbook" ? "playbook" : "doc";
      const key = `${source}-${e.id}`;
      evidenceMap.set(key, {
        source,
        id: toStr(e.id),
        snippet: toStr(e.snippet).slice(0, 250),
        score: 1
      });
    }
  }
  for (const item of playbookContext.items.slice(0, 3)) {
    const key = `playbook-${item.id}`;
    if (!evidenceMap.has(key)) {
      const snippet = item.text.split("\n").slice(0, 5).join(" ").slice(0, 250);
      evidenceMap.set(key, { source: "playbook", id: item.id, snippet, score: item.score });
    }
  }
  for (const match of docsContext.matches.slice(0, 3)) {
    const id = toStr(match?.id || "");
    const key = `doc-${id}`;
    if (!evidenceMap.has(key)) {
      const snippet = `Module: ${toStr(match?.metadata?.module || "")} | Score: ${(match?.score * 100).toFixed(0)}%`;
      evidenceMap.set(key, { source: "doc", id, snippet, score: match?.score || 0 });
    }
  }
  const allEvidence = Array.from(evidenceMap.values());
  allEvidence.sort((a, b) => b.score - a.score);
  return allEvidence.slice(0, maxEvidence);
}
__name(gatherEvidence, "gatherEvidence");
function buildKnowledgeContext(preferredModule, playbookContext, docsContext) {
  const parts = [];
  parts.push(`[Module d\xE9tect\xE9: ${preferredModule}]`);
  if (playbookContext.text.trim()) {
    parts.push("\n--- PLAYBOOKS TikTak PRO ---");
    parts.push(playbookContext.text);
  }
  if (docsContext.text.trim()) {
    parts.push("\n--- DOCUMENTATION TikTak PRO ---");
    parts.push(docsContext.text);
  }
  return parts.join("\n");
}
__name(buildKnowledgeContext, "buildKnowledgeContext");
function computeConfidence(opts) {
  const { llmConfidence, topVectorizeScore, keywordScore, answerLength } = opts;
  const vecNorm = clamp01(topVectorizeScore);
  const kwNorm = clamp01(Math.min(keywordScore / 5, 1));
  const lenNorm = clamp01(answerLength > 200 ? 1 : answerLength > 50 ? 0.7 : answerLength > 10 ? 0.4 : 0);
  const composite = llmConfidence * 0.4 + vecNorm * 0.3 + kwNorm * 0.15 + lenNorm * 0.15;
  return clamp01(Number(composite.toFixed(2)));
}
__name(computeConfidence, "computeConfidence");

// src/governance.ts
var HTTP_5XX_PATTERNS = [
  /\b(erreur|error)\s*(5\d\d)\b/i,
  /\b(5\d\d)\s*(error|erreur)\b/i,
  /\binternal\s*server\s*error\b/i,
  /\b(erreur|error)\s*interne\s*(du\s*)?(serveur)?\b/i,
  /\bgateway\s*timeout\b/i,
  /\bbad\s*gateway\b/i,
  /\bservice\s*unavailable\b/i,
  /\berreur\s*serveur\b/i,
  /\bserver\s*error\b/i,
  /\bpanne\s*(syst[eè]me|totale|compl[eè]te|generale|g[eé]n[eé]rale|serveur)?\b/i,
  /\b(affiche|montre|donne|appara[iî]t|renvoie|retourne)\s*['"]?\s*(erreur\s*)?(500|502|503|504)\b/i,
  /\b(500|502|503|504)\b.*\b(quand|when|lorsque|ki|lors)\b/i,
  /\byodher\b.*\b(erreur|error)\s*(5\d\d)\b/i,
  /\byatla3\b.*\b(erreur|error)\s*(5\d\d)\b/i,
  /\bfih\b.*\b(erreur|error)\s*(5\d\d)\b/i,
  /\btatla3\b.*\b(erreur|error)\s*(5\d\d)\b/i,
  /\b50[0234]\s*(error|erreur)\b/i,
  /\btimeout\b.*\b(serveur|server)\b/i,
  /\b(serveur|server)\b.*\btimeout\b/i,
  /\b(fix|r[eé]soudre|corriger|r[eé]parer)\b.*\b(500|502|503|504)\s*(error|erreur)?\b/i
];
var HTTP_FALSE_POSITIVE_PATTERNS = [
  /\b500\s*(produits?|articles?|commandes?|clients?|items?|r[eé]f[eé]rences?|SKU|fiches?|pages?|variantes?)\b/i,
  /\b(plan|forfait|pack|limite|capacit[eé]|jusqu['']?[aà]|maximum|max)\b.*\b500\b/i,
  /\b500\b.*\b(plan|forfait|pack|limite|capacit[eé])\b/i,
  /\b(importer|ajouter|avoir|cr[eé]er|g[eé]rer|supporter)\s+500\b/i,
  /\b500\s*(dinars?|dt|tnd|euros?|eur|dollars?|usd)\b/i,
  /\bsuffit\s+(pour\s+)?500\b/i
];
var SITE_DOWN_PATTERNS = [
  /\b(site|lien|boutique|page|dashboard|tableau de bord)\b.*\bne\s+(fonctionne|marche)\s+pas\b/i,
  /\bne\s+(fonctionne|marche)\s+pas\b.*\b(site|lien|boutique|page|dashboard)\b/i,
  /\bsite\s*(crash|down|plant[eé]|plante|inaccessible|bloqu[eé]|en panne)\b/i,
  /\b(crash|plante|plant[eé])\b.*\b(site|page|boutique|dashboard)\b/i,
  /\bsite\s+ne\s+(s['']ouvre|charge|r[eé]pond|repond)\s+pas\b/i,
  /\b(lien|link)\b.*\b(ne\s+)?(fonctionne|marche|works?)\s*pas\b/i,
  /\b(fixer|fix|r[eé]soudre|corriger)\b.*\b(probl[eè]me|problem)\b.*\b(site|lien|page)\b/i,
  /\bsite\s*(ma5dimch|ma5demch|5asro|mayekhdemch|may5demch)\b/i,
  /\bsite\s+ma\s*y(7el|5dem|ekhdem)ch\b/i
];
var EMOTION_PATTERNS = [
  // -- ANGER / DEMAND ESCALATION --
  { pattern: /\b(je veux|je demande|je souhaite)\s+(parler|voir|contacter)\s+([aà])?\s*(un|le|la|au)\s*(responsable|manager|superviseur|directeur|sup[eé]rieur)/i, score: 10, sentiment: "angry", label: "demand_manager_fr" },
  { pattern: /\bparler\s+([aà])\s+(un\s*)?(responsable|manager|superviseur|directeur)/i, score: 10, sentiment: "angry", label: "speak_manager_fr" },
  { pattern: /\b(speak|talk)\s+to\s+a?\s*(manager|supervisor|boss|director|someone in charge)/i, score: 10, sentiment: "angry", label: "demand_manager_en" },
  { pattern: /\b(want|need)\s+to\s+(speak|talk)\s+to\s+a?\s*(manager|supervisor|person|human)/i, score: 10, sentiment: "angry", label: "demand_human_en" },
  { pattern: /\binacceptable\b|\bscandale\b|\bscandaleux\b|\bhonteux\b|\bhonte\b|\bimpossible de travailler\b/i, score: 9, sentiment: "angry", label: "outrage_fr" },
  { pattern: /\bunacceptable\b|\bscandalous\b|\boutrageous\b|\bdisgusting\b|\bshame\b/i, score: 9, sentiment: "angry", label: "outrage_en" },
  // -- FRUSTRATION --
  { pattern: /\b(tr[eè]s|vraiment|extr[eê]mement|trop)\s+(d[eé][çc]u|m[eé]content|frustr[eé]|f[aâ]ch[eé]|furieux|en col[eè]re)/i, score: 8, sentiment: "frustrated", label: "strong_frustration_fr" },
  { pattern: /\b(je suis|j['']en ai|on est)\s+(d[eé][çc]u|m[eé]content|frustr[eé]|f[aâ]ch[eé]|furieux|en col[eè]re|ras le bol|marre)/i, score: 8, sentiment: "frustrated", label: "frustration_expr_fr" },
  { pattern: /\bj['']en ai marre\b|\bras[- ]le[- ]bol\b|\bje n['']en peux plus\b/i, score: 8, sentiment: "frustrated", label: "fed_up_fr" },
  { pattern: /\bmon (business|commerce|boutique|site|magasin) ne (marche|fonctionne) plus\b/i, score: 8, sentiment: "urgent", label: "business_down_fr" },
  { pattern: /\b(very|extremely|really|so)\s+(disappointed|frustrated|angry|upset|unhappy)/i, score: 8, sentiment: "frustrated", label: "strong_frustration_en" },
  { pattern: /\bI['']m (fed up|done|sick of|tired of)\b/i, score: 8, sentiment: "frustrated", label: "fed_up_en" },
  { pattern: /\b([çc]a|ca|c['']est|cest)\s+(ne marche|marche) pas\b.*!/i, score: 7, sentiment: "frustrated", label: "doesnt_work_fr" },
  { pattern: /\b[çc]a fait\s+(\d+|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(jours?|semaines?|heures?|mois)\b/i, score: 7, sentiment: "frustrated", label: "time_waiting_fr" },
  { pattern: /\bdepuis\s+(\d+|une?|deux|trois)\s*(jours?|semaines?|heures?|mois)\b/i, score: 7, sentiment: "frustrated", label: "since_duration_fr" },
  { pattern: /\b(\d+|une?|deux|trois)\s*(jours?|days?|semaines?|weeks?)\s*(sans|without|et|w|no)\s*(r[eé]ponse|response|answer|nouvelle|rien)/i, score: 7, sentiment: "frustrated", label: "days_no_response" },
  { pattern: /\bsemaine\b.*\b(contacte|contact|appel|[eé]cri|envo)/i, score: 7, sentiment: "frustrated", label: "week_contacting_fr" },
  { pattern: /\bpersonne\s*(ne)?\s*(r[eé]pond|repond|aide|m['']aide)\b/i, score: 7, sentiment: "frustrated", label: "nobody_answers_fr" },
  { pattern: /\b(le support|support)\s+(est\s+)?(nul|horrible|inutile|catastrophique|mauvais|inexistant)\b/i, score: 8, sentiment: "frustrated", label: "support_is_bad_fr" },
  { pattern: /\bremboursez[- ]?moi\b/i, score: 8, sentiment: "angry", label: "refund_demand_fr" },
  // -- ARABIZI / DARIJA --
  { pattern: /\b7abset\b|\b7abit\b|\b7a9et\b|\bze3ma\b.*\bma\b.*\bch\b/i, score: 8, sentiment: "frustrated", label: "fed_up_arabizi" },
  { pattern: /\bma\s*jawb(ni|ouni|nech|ounech|nich)\b|\bma\s*jaw[bw](ni|ouni)\b/i, score: 7, sentiment: "frustrated", label: "no_answer_arabizi" },
  { pattern: /\b7ata\s*wa7ed\s*ma\s*jaw[bw]/i, score: 8, sentiment: "frustrated", label: "nobody_answered_arabizi" },
  { pattern: /\bel\s*7keya\b|\bhel\s*7keya\b|\b7keyet\b/i, score: 6, sentiment: "frustrated", label: "this_situation_arabizi" },
  { pattern: /\bbarcha\s*(wa9t|wakt)\b|\bbezzaf\b|\byeser\b/i, score: 6, sentiment: "frustrated", label: "too_long_arabizi" },
  { pattern: /\bnheb\s*n(7ki|kellem)\s*(m3a|ma3)\s*(responsable|chef|manager)/i, score: 10, sentiment: "angry", label: "demand_manager_arabizi" },
  { pattern: /\bmech\s*normal\b|\bmech\s*ma39oul\b/i, score: 7, sentiment: "frustrated", label: "not_normal_arabizi" },
  { pattern: /\btaw\b.*\bjours?\b.*\bma\b.*\bjaw[bw]/i, score: 7, sentiment: "frustrated", label: "days_no_answer_arabizi" },
  { pattern: /\b3awnouni\b/i, score: 7, sentiment: "urgent", label: "help_me_arabizi" },
  { pattern: /\bbrabi\b/i, score: 6, sentiment: "urgent", label: "please_arabizi" },
  // -- ARABIC --
  { pattern: /أريد\s*(التحدث|الكلام|التكلم)\s*(مع|إلى)\s*(مسؤول|مدير)/i, score: 10, sentiment: "angry", label: "demand_manager_ar" },
  { pattern: /مستاء|محبط|غاضب|زعلان/i, score: 8, sentiment: "frustrated", label: "frustrated_ar" },
  { pattern: /غير مقبول|فضيحة|عار/i, score: 9, sentiment: "angry", label: "outrage_ar" },
  // -- URGENCY INDICATORS --
  { pattern: /\baide[zr]?[- ]?moi\b.*!/i, score: 7, sentiment: "urgent", label: "help_me_urgent_fr" },
  { pattern: /\bpriez?\s+d['']intervenir\b/i, score: 8, sentiment: "urgent", label: "please_intervene_fr" },
  { pattern: /\bIMMÉDIATEMENT\b|\bTOUT DE SUITE\b|\bURGENT\b/, score: 9, sentiment: "urgent", label: "caps_urgency_fr" },
  { pattern: /\burgent(e|ly|ement)?\b/i, score: 6, sentiment: "urgent", label: "urgent_keyword" },
  { pattern: /\b(help|please|asap)\b.*!/i, score: 6, sentiment: "urgent", label: "help_urgent_en" },
  { pattern: /!{2,}/, score: 5, sentiment: "frustrated", label: "multiple_exclamations" },
  { pattern: /[A-ZÀ-Ú]{5,}/, score: 4, sentiment: "angry", label: "caps_shouting" }
];
function scanEmotions(message) {
  const triggers = [];
  let maxScore = 0;
  let dominantSentiment = "calm";
  for (const ep of EMOTION_PATTERNS) {
    if (ep.pattern.test(message)) {
      triggers.push(ep.label);
      if (ep.score > maxScore) {
        maxScore = ep.score;
        dominantSentiment = ep.sentiment;
      }
    }
  }
  if (triggers.length >= 3 && maxScore < 8) {
    maxScore = Math.min(10, maxScore + triggers.length - 2);
  }
  return {
    score: maxScore,
    triggers,
    sentiment: triggers.length > 0 ? dominantSentiment : "calm",
    detected: triggers.length > 0 && maxScore >= 5
  };
}
__name(scanEmotions, "scanEmotions");
function scanHttpErrors(message) {
  const isFalsePositive = HTTP_FALSE_POSITIVE_PATTERNS.some((fp) => fp.test(message));
  const has5xx = /\b(500|502|503|504)\b/.test(message);
  const codes = [];
  let detected = false;
  let reason = "";
  let maxScore = 0;
  for (const p of HTTP_5XX_PATTERNS) {
    if (p.test(message)) {
      detected = true;
      const codeMatch = message.match(/\b(5\d\d)\b/);
      if (codeMatch && !codes.includes(codeMatch[1])) codes.push(codeMatch[1]);
      const isNamed = /internal|gateway|panne|serveur|server/.test(p.source);
      const s = isNamed ? 9 : 8;
      if (s > maxScore) {
        maxScore = s;
        reason = p.source.slice(0, 40);
      }
    }
  }
  if (isFalsePositive && (detected || has5xx)) {
    return { score: 0, detected: false, falsePositive: true, codes, reason: `false_positive: ${reason || "quantity_context"}` };
  }
  return { score: detected ? maxScore : 0, detected, falsePositive: false, codes, reason };
}
__name(scanHttpErrors, "scanHttpErrors");
function scanSiteDown(message) {
  return SITE_DOWN_PATTERNS.some((p) => p.test(message));
}
__name(scanSiteDown, "scanSiteDown");
function detectPersistence(message) {
  let score = 0;
  const durationMatch = message.match(/(\d+)\s*(jours?|semaines?|days?|weeks?)/i);
  if (durationMatch) {
    const n = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2].toLowerCase();
    score = unit.startsWith("semaine") || unit.startsWith("week") ? Math.min(10, n * 3) : Math.min(10, Math.ceil(n / 2));
  }
  if (/\bune\s+semaine\b/i.test(message)) score = Math.max(score, 3);
  if (/\bun\s+mois\b/i.test(message)) score = Math.max(score, 5);
  if (/\bplusieurs\s+(jours?|semaines?|mois)\b/i.test(message)) score = Math.max(score, 4);
  if (/\b(déjà|already|encore|again|plusieurs fois|multiple times)\s*(contacté|appelé|envoyé|écrit|written|called|sent)/i.test(message)) score = Math.max(score, 5);
  if (/\b(personne|nobody|no one|aucune réponse|pas de réponse|no response|no answer)\b/i.test(message)) score = Math.max(score, 4);
  if (/\b(toujours pas|still not|still no|toujours rien|encore rien)\b/i.test(message)) score = Math.max(score, 4);
  if (/\b(problème\s+persist|probl[eè]me\s+continu|le\s+probl[eè]me\s+est\s+toujours|toujours\s+(le\s+)?m[eê]me\s+probl[eè]me|même\s+probl[eè]me)\b/i.test(message)) score = Math.max(score, 5);
  if (/\b(tout\s+(est\s+)?v[ée]rifi[ée]|j['']ai\s+(tout\s+)?(fait|essayé|vérifié)|rien\s+n['']a?\s+(changé|marché|fonctionné))\b/i.test(message)) score = Math.max(score, 5);
  if (/\b(toujours\s+pareil|ça\s+(change|marche|fonctionne)\s+rien|même\s+chose|même\s+erreur|still\s+the\s+same)\b/i.test(message)) score = Math.max(score, 5);
  if (/\b(ça\s+persist|persist\s+encore|ne\s+marche\s+toujours\s+pas)\b/i.test(message)) score = Math.max(score, 5);
  return Math.min(10, score);
}
__name(detectPersistence, "detectPersistence");
function detectSeverity(message) {
  let score = 0;
  if (/\b(site\s*(down|bloqué|inaccessible|ne s['']ouvre pas|crash)|perte\s*(de\s*)?(données|argent|clients?)|impossible\s+de\s+(vendre|travailler|accéder))\b/i.test(message)) score = Math.max(score, 8);
  if (/\b(paiement\s*(bloqué|impossible|refusé)|commandes?\s*(bloquée?s?|perdues?)|checkout\s*(down|bloqué|cassé))\b/i.test(message)) score = Math.max(score, 6);
  if (/\b(bloqué|blocked|stuck|cassé|broken|ne fonctionne|doesn['']t work)\b/i.test(message)) score = Math.max(score, 4);
  if (/\b(marche|fonctionne)\s*pas\b/i.test(message)) score = Math.max(score, 4);
  return Math.min(10, score);
}
__name(detectSeverity, "detectSeverity");
var CATEGORY_RULES = [
  // --- technical (highest confidence — server errors / crashes) ---
  { module: "technical", pattern: /\b(erreur|error)\s*(500|502|503|504|5\d\d)\b/i, confidence: 0.95, reason: "HTTP 5xx error" },
  { module: "technical", pattern: /\binternal\s*server\s*error\b/i, confidence: 0.95, reason: "Internal server error" },
  { module: "technical", pattern: /\bgateway\s*(timeout|error)\b/i, confidence: 0.95, reason: "Gateway error" },
  { module: "technical", pattern: /\bbad\s*gateway\b/i, confidence: 0.95, reason: "Bad gateway" },
  { module: "technical", pattern: /\bpanne\b/i, confidence: 0.8, reason: "System outage" },
  { module: "technical", pattern: /\bsite\s*(crash|down|plant[eé])\b/i, confidence: 0.85, reason: "Site down/crash" },
  { module: "technical", pattern: /\b(dashboard|tableau de bord|back.?office)\b.*\b(erreur|error|5\d\d)\b/i, confidence: 0.9, reason: "Dashboard error" },
  { module: "technical", pattern: /\bpage\s*(blanche|vide)\b/i, confidence: 0.8, reason: "Blank page" },
  { module: "technical", pattern: /\bbug\s*(technique)?\b/i, confidence: 0.75, reason: "Bug report" },
  { module: "technical", pattern: /\bprobl[eè]me\s*technique\b/i, confidence: 0.85, reason: "Technical problem" },
  { module: "technical", pattern: /\b(site|lien|boutique)\b.*\b(ne|pas)\b.*\b(fonctionne|marche|charge|ouvre|r[eé]pond)\b/i, confidence: 0.8, reason: "Site not working" },
  { module: "technical", pattern: /\b(ne\s+charge\s+pas|ne\s+s[''']?affiche\s+pas|ne\s+r[eé]pond\s+pas)\b/i, confidence: 0.75, reason: "Page not loading" },
  // --- orders ---
  { module: "orders", pattern: /\b(commande|order)s?\b.*\b(annul|cancel|rembours|refund|bloqu|stuck|report[eé]e?|perdue?)\b/i, confidence: 0.85, reason: "Order issue" },
  { module: "orders", pattern: /\b(annul|cancel|rembours|refund|bloqu)\b.*\b(commande|order)s?\b/i, confidence: 0.85, reason: "Order action" },
  { module: "orders", pattern: /\b(suivi|tracking)\s*(commande|order|colis)\b/i, confidence: 0.8, reason: "Order tracking" },
  { module: "orders", pattern: /\b(confirmer|valider|modifier|changer)\s*(la\s+)?commande\b/i, confidence: 0.8, reason: "Order modification" },
  { module: "orders", pattern: /\b(état|status|statut)\s*(de\s+)?(la\s+)?commande\b/i, confidence: 0.8, reason: "Order status" },
  { module: "orders", pattern: /\bnum[eé]ro\s*(de\s+)?commande\b/i, confidence: 0.8, reason: "Order number" },
  { module: "orders", pattern: /\b(panier|cart)\b/i, confidence: 0.7, reason: "Cart" },
  { module: "orders", pattern: /\bcheckout\b/i, confidence: 0.7, reason: "Checkout" },
  { module: "orders", pattern: /\bcode\s*promo\b/i, confidence: 0.75, reason: "Promo code" },
  // --- products ---
  { module: "products", pattern: /\b(produit|product)s?\b.*\b(ajout|cr[eé]|modif|supprim|import|export|image|photo|prix|fiche|page)/i, confidence: 0.8, reason: "Product management" },
  { module: "products", pattern: /\b(ajout|cr[eé]|modif|supprim|import|export)\w*\b.*\b(produit|product)s?\b/i, confidence: 0.8, reason: "Product action" },
  { module: "products", pattern: /\b(variante?|variant|collection|cat[eé]gorie|catalogue|catalog)\b/i, confidence: 0.7, reason: "Product catalog" },
  { module: "products", pattern: /\bsku\b/i, confidence: 0.75, reason: "SKU reference" },
  { module: "products", pattern: /\bfiche\s*produit\b/i, confidence: 0.85, reason: "Product page" },
  // --- shipping ---
  { module: "shipping", pattern: /\b(livraison|shipping|exp[eé]dition|expedition)\b/i, confidence: 0.8, reason: "Shipping" },
  { module: "shipping", pattern: /\b(colis|manifeste|manifest|[eé]tiquette|etiquette|bordereau)\b/i, confidence: 0.8, reason: "Shipment label/manifest" },
  { module: "shipping", pattern: /\b(transporteur|carrier|livreur)\b/i, confidence: 0.8, reason: "Carrier" },
  { module: "shipping", pattern: /\b(douchette|scanner|scan|barcode)\b/i, confidence: 0.75, reason: "Scan device" },
  { module: "shipping", pattern: /\b(retour|return)\s*(colis|produit|commande)\b/i, confidence: 0.75, reason: "Return shipment" },
  { module: "shipping", pattern: /\b(ramassage|pickup|collecte)\b/i, confidence: 0.7, reason: "Pickup" },
  { module: "shipping", pattern: /\b(poids|weight)\b.*\b(colis|bordereau)\b/i, confidence: 0.8, reason: "Package weight" },
  // --- payments ---
  { module: "payments", pattern: /\b(paiement|payment)\b.*\b(erreur|error|refus[eé]?|[eé]chec|fail|bloqu)\b/i, confidence: 0.8, reason: "Payment error" },
  { module: "payments", pattern: /\b(erreur|error|refus|[eé]chec|fail)\b.*\b(paiement|payment|checkout)\b/i, confidence: 0.8, reason: "Error in payment" },
  { module: "payments", pattern: /\b(carte\s*(bancaire)?|visa|mastercard|cb|stripe|tpe)\b/i, confidence: 0.75, reason: "Payment method" },
  { module: "payments", pattern: /\b(transaction|passerelle|gateway)\b.*\b(paiement|payment)?\b/i, confidence: 0.7, reason: "Payment gateway" },
  { module: "payments", pattern: /\b3ds\b/i, confidence: 0.8, reason: "3DS payment" },
  // --- billing ---
  { module: "billing", pattern: /\b(facturation|facture|invoice)s?\b/i, confidence: 0.8, reason: "Billing/invoice" },
  { module: "billing", pattern: /\b(plan|forfait|abonnement|subscription)\b/i, confidence: 0.7, reason: "Plan/subscription" },
  { module: "billing", pattern: /\b(renouvellement|upgrade|downgrade)\b/i, confidence: 0.75, reason: "Plan change" },
  { module: "billing", pattern: /\b(facture|\u0641\u0627\u062a\u0648\u0631\u0629)\s*(mensuelle|شهرية)?\b/i, confidence: 0.8, reason: "Invoice inquiry" },
  // --- settings ---
  { module: "settings", pattern: /\b(domaine|domain)s?\b/i, confidence: 0.75, reason: "Domain" },
  { module: "settings", pattern: /\b(dns|ssl|https|certificat|certificate|cloudflare|nameserver)\b/i, confidence: 0.8, reason: "DNS/SSL" },
  { module: "settings", pattern: /\b(param[eè]tres?|configuration|r[eé]glages?)\s*(du\s+)?(site|boutique)?\b/i, confidence: 0.7, reason: "Site settings" },
  { module: "settings", pattern: /\berreur\s*(403|404)\b/i, confidence: 0.8, reason: "HTTP 4xx error" },
  { module: "settings", pattern: /\blangue\s*(du\s+)?site\b/i, confidence: 0.75, reason: "Site language" },
  // --- builder ---
  { module: "builder", pattern: /\b(template|th[eè]me|theme|design|mise en page|layout)\b/i, confidence: 0.75, reason: "Site design" },
  { module: "builder", pattern: /\b(header|footer|en-t[eê]te|pied de page|banni[eè]re|banner|slider)\b/i, confidence: 0.8, reason: "Page element" },
  { module: "builder", pattern: /\b(section|bloc|block|popup|bouton|button|formulaire)\b/i, confidence: 0.7, reason: "Page block" },
  { module: "builder", pattern: /\b(page d[''']accueil|homepage|accueil)\b/i, confidence: 0.7, reason: "Homepage" },
  { module: "builder", pattern: /\b(logo|favicon|couleur|color|police|font|css|style)\b/i, confidence: 0.7, reason: "Visual styling" },
  { module: "builder", pattern: /\b(modifier|ajouter|supprimer|cr[eé]er)\s*(la\s+|une\s+)?page\b/i, confidence: 0.8, reason: "Page editing" },
  { module: "builder", pattern: /\b(contenu|content|cms|seo)\b/i, confidence: 0.65, reason: "Content/CMS" },
  // --- customers ---
  { module: "customers", pattern: /\b(fiche|compte|profil|liste|gestion)\s*(de\s+|des\s+|du\s+)?(client|clients|customer|customers)\b/i, confidence: 0.8, reason: "Customer management" },
  { module: "customers", pattern: /\b(client|customer)s?\b.*\b(supprim|modif|ajout|cr[eé]|import|export|donn[eé]es)\b/i, confidence: 0.75, reason: "Customer action" },
  { module: "customers", pattern: /\b(utilisateur|user)s?\b.*\b(profil|compte|gestion)\b/i, confidence: 0.7, reason: "User profile" },
  // --- pos ---
  { module: "pos", pattern: /\b(pos|caisse|point\s*de\s*vente|terminal\s*de\s*vente)\b/i, confidence: 0.85, reason: "POS terminal" },
  { module: "pos", pattern: /\b(vente\s*(en\s+)?(magasin|boutique\s*physique)|magasin)\b/i, confidence: 0.75, reason: "In-store sale" },
  { module: "pos", pattern: /\b(session\s*caisse|ticket\s*de\s*caisse|bon\s*de\s*caisse)\b/i, confidence: 0.85, reason: "POS session/receipt" },
  { module: "pos", pattern: /\bfacture\s*pos\b/i, confidence: 0.9, reason: "POS invoice" },
  // --- auth ---
  { module: "auth", pattern: /\b(login|connexion|se\s+connecter|me\s+connecter)\b/i, confidence: 0.8, reason: "Login" },
  { module: "auth", pattern: /\b(mot\s*de\s*passe|password)\b/i, confidence: 0.85, reason: "Password" },
  { module: "auth", pattern: /\b(otp|2fa|authentification|v[eé]rification)\b/i, confidence: 0.85, reason: "Auth verification" },
  { module: "auth", pattern: /\b(d[eé]connexion|d[eé]connect[eé]|session\s*expir[eé]e?)\b/i, confidence: 0.8, reason: "Session/logout" },
  { module: "auth", pattern: /\b(r[eé]initialiser|reset|oubli[eé]?)\s*(mot\s*de\s*passe|password)\b/i, confidence: 0.85, reason: "Password reset" },
  { module: "auth", pattern: /\bacc[eè]s\b.*\b(refus|bloqu|interdit|denied)\b/i, confidence: 0.8, reason: "Access denied" },
  // --- inventory ---
  { module: "inventory", pattern: /\b(stock|inventaire|inventory)\b/i, confidence: 0.8, reason: "Inventory" },
  { module: "inventory", pattern: /\b(rupture\s*(de\s*)?stock|hors\s*stock|out\s*of\s*stock)\b/i, confidence: 0.85, reason: "Out of stock" },
  { module: "inventory", pattern: /\b(quantit[eé]|disponibilit[eé]|stock\s*n[eé]gatif)\b/i, confidence: 0.75, reason: "Stock quantity" },
  { module: "inventory", pattern: /\b(gestion|mise\s*[aà]\s*jour|sync|synchronis)\b.*\bstock\b/i, confidence: 0.8, reason: "Stock management" },
  // --- notifications ---
  { module: "notifications", pattern: /\bnotification(s)?\b/i, confidence: 0.8, reason: "Notification" },
  { module: "notifications", pattern: /\b(email|mail)\s*(automatique|de\s*confirmation|notification)\b/i, confidence: 0.8, reason: "Email notification" },
  { module: "notifications", pattern: /\b(alerte|alertes)\b/i, confidence: 0.7, reason: "Alert" },
  { module: "notifications", pattern: /\bsms\b/i, confidence: 0.7, reason: "SMS" },
  { module: "notifications", pattern: /\b(notification|alerte)\s*(commande|client|push)\b/i, confidence: 0.8, reason: "Order/client notification" },
  // --- apps ---
  { module: "apps", pattern: /\b(api|endpoint|webhook)s?\b/i, confidence: 0.75, reason: "API/webhook" },
  { module: "apps", pattern: /\b(int[eé]gration|integration)s?\b/i, confidence: 0.7, reason: "Integration" },
  { module: "apps", pattern: /\b(module|modules|application|applications)\b/i, confidence: 0.65, reason: "App/module" },
  { module: "apps", pattern: /\b(facebook\s*pixel|pixel|leads\s*facebook|tracking\s*automatique)\b/i, confidence: 0.8, reason: "Facebook/tracking pixel" },
  { module: "apps", pattern: /\b(shipper|first\s*delivery)\b/i, confidence: 0.75, reason: "Shipper integration" },
  // --- general (complaints/frustration — low confidence) ---
  { module: "general", pattern: /\b(tr[eè]s\s*d[eé][cç]u|m[eé]content|furieux|inacceptable|scandale|scandaleux|honteux)\b/i, confidence: 0.7, reason: "Complaint/frustration" },
  { module: "general", pattern: /\b(responsable|manager|superviseur)\b/i, confidence: 0.6, reason: "Escalation demand" },
  { module: "general", pattern: /\bremboursez\b/i, confidence: 0.7, reason: "Refund demand" },
  { module: "general", pattern: /\b(activ|cr[eé])\b.*\b(compte|boutique)\b/i, confidence: 0.7, reason: "Account/shop activation" },
  { module: "general", pattern: /\b(changer|modifier)\s*(le\s+)?nom\s*(de\s+)?(la\s+)?boutique\b/i, confidence: 0.7, reason: "Shop name change" },
  { module: "general", pattern: /\bcompte\s*bloqu[eé]\b/i, confidence: 0.75, reason: "Blocked account" },
  { module: "general", pattern: /\bduplication\b/i, confidence: 0.7, reason: "Duplication" }
];
function generateCategoryHints(message) {
  const hints = [];
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(message)) {
      hints.push({ module: rule.module, confidence: rule.confidence, reason: rule.reason });
    }
  }
  const byModule = /* @__PURE__ */ new Map();
  for (const hint of hints) {
    const existing = byModule.get(hint.module);
    if (!existing || hint.confidence > existing.confidence) byModule.set(hint.module, hint);
  }
  return Array.from(byModule.values()).sort((a, b) => b.confidence - a.confidence);
}
__name(generateCategoryHints, "generateCategoryHints");
function runGovernance(message) {
  const emotion = scanEmotions(message);
  const httpError = scanHttpErrors(message);
  const isSiteDown = scanSiteDown(message);
  const persistenceScore = detectPersistence(message);
  const severityScore = detectSeverity(message);
  const categoryHints = generateCategoryHints(message);
  let tag = "none";
  const force = {};
  if (httpError.falsePositive) {
    tag = "http_false_positive";
  } else if (httpError.detected && emotion.detected) {
    tag = "http_5xx_emotion";
    force.category = "technical";
    force.verdict = "tiktak_side";
    force.escalate = true;
    force.severity = "critical";
    force.ticket_type = "incident";
    force.sentiment = emotion.sentiment;
  } else if (httpError.detected) {
    tag = "http_5xx";
    force.category = "technical";
    force.verdict = "tiktak_side";
    force.escalate = true;
    force.severity = "critical";
    force.ticket_type = "incident";
  } else if (emotion.detected) {
    tag = "emotion";
    force.sentiment = emotion.sentiment;
  } else if (isSiteDown) {
    tag = "site_down";
    force.category = "technical";
    force.verdict = "tiktak_side";
    force.escalate = true;
    force.severity = "high";
    force.ticket_type = "bug";
  }
  const forceEscalate = force.escalate === true;
  const escalationScore = forceEscalate ? 9 : emotion.detected ? Math.min(emotion.score, 5) : 0;
  const recommendEscalate = forceEscalate || httpError.detected || isSiteDown;
  return {
    tag,
    emotion,
    httpError,
    force,
    categoryHints,
    persistenceScore,
    severityScore,
    escalationScore,
    forceEscalate,
    recommendEscalate
  };
}
__name(runGovernance, "runGovernance");
function governanceToPromptHints(gov) {
  const parts = [];
  if (gov.tag === "http_5xx" || gov.tag === "http_5xx_emotion") {
    parts.push("ERREUR SERVEUR 5xx DETECTEE \u2014 INCIDENT TECHNIQUE.");
    parts.push('OBLIGATOIRE: category="technical", verdict="tiktak_side", escalate=true, ticket_type="incident", severity="critical".');
    parts.push("Reconnaitre le probleme technique et expliquer que l equipe va investiguer.");
  }
  if (gov.tag === "http_false_positive") {
    parts.push('"500" detecte mais c est une quantite, PAS une erreur serveur. NE PAS escalader pour cela. escalate=false.');
  }
  if (gov.tag === "site_down") {
    parts.push("SITE/LIEN EN PANNE DETECTE \u2014 INCIDENT TECHNIQUE.");
    parts.push('OBLIGATOIRE: category="technical", verdict="tiktak_side", escalate=true.');
  }
  if (gov.emotion.detected) {
    parts.push("EMOTION DETECTEE (sentiment: " + gov.emotion.sentiment + ", triggers: " + gov.emotion.triggers.join(", ") + ")");
    if (gov.tag === "emotion") {
      parts.push("Le marchand est frustre/en colere. Commence par reconnaitre son emotion PUIS aide-le.");
      parts.push("NE PAS escalader juste pour l emotion. Pose des questions pour comprendre le probleme.");
    }
  }
  if (gov.persistenceScore >= 4) {
    parts.push("CONTACT REPETE (persistence: " + gov.persistenceScore + "/10) \u2014 le marchand attend depuis longtemps.");
  }
  if (gov.categoryHints.length > 0 && !gov.force.category) {
    const top = gov.categoryHints[0];
    parts.push("Categorie suggeree: " + top.module + " (" + (top.confidence * 100).toFixed(0) + "%) \u2014 " + top.reason);
  }
  if (gov.forceEscalate && gov.tag !== "http_false_positive") {
    parts.push("");
    parts.push('DIRECTIVE OBLIGATOIRE: escalate=true, verdict="tiktak_side".');
    parts.push("Commence ta reponse par reconnaitre l emotion/probleme du marchand.");
  }
  return parts.length > 0 ? "\n--- SIGNAUX GOUVERNANCE (pre-analyse automatique) ---\n" + parts.join("\n") : "";
}
__name(governanceToPromptHints, "governanceToPromptHints");
function validatePostLlm(gov, llmOutput) {
  const o = { overrideReasons: [] };
  if (gov.tag === "http_5xx" || gov.tag === "http_5xx_emotion" || gov.tag === "site_down") {
    if (llmOutput.category !== "technical") {
      o.category = "technical";
      o.overrideReasons.push("R1_category: tag=" + gov.tag + " force technical (was " + llmOutput.category + ")");
    }
    if (llmOutput.verdict !== "tiktak_side") {
      o.verdict = "tiktak_side";
      o.overrideReasons.push("R1_verdict: tag=" + gov.tag + " force tiktak_side");
    }
    if (!llmOutput.escalate) {
      o.escalate = true;
      o.overrideReasons.push("R1_escalate: tag=" + gov.tag + " force escalate=true");
    }
    if (llmOutput.severity !== "critical" && llmOutput.severity !== "high") {
      o.severity = gov.tag === "site_down" ? "high" : "critical";
      o.overrideReasons.push("R1_severity: " + o.severity);
    }
    if (gov.tag !== "site_down" && llmOutput.ticket_type !== "incident") {
      o.ticket_type = "incident";
      o.overrideReasons.push("R1_ticket_type: incident");
    }
  }
  if (gov.tag === "emotion") {
    if (gov.emotion.score >= 7 && llmOutput.sentiment === "calm") {
      o.sentiment = gov.emotion.sentiment;
      o.overrideReasons.push("R2_sentiment: tag=emotion score=" + gov.emotion.score + " correct sentiment");
    }
  }
  if (gov.tag === "http_false_positive" && llmOutput.escalate && gov.emotion.score < 5) {
    o.escalate = false;
    o.overrideReasons.push("R3_deescalate: false_positive 500 is quantity, suppress LLM escalation");
  }
  if (gov.emotion.score >= 7 && (llmOutput.severity === "low" || llmOutput.severity === "medium") && !o.severity) {
    o.severity = "high";
    o.overrideReasons.push("R4_severity: emotion=" + gov.emotion.score + " high");
  }
  if (gov.httpError.detected && !gov.httpError.falsePositive && !o.severity) {
    if (llmOutput.severity !== "critical") {
      o.severity = "high";
      o.overrideReasons.push("R5_severity: HTTP detected high");
    }
  }
  if (gov.emotion.score >= 7 && llmOutput.sentiment === "calm") {
    o.sentiment = gov.emotion.sentiment;
    o.overrideReasons.push("R6_sentiment: emotion=" + gov.emotion.score + " " + gov.emotion.sentiment);
  }
  if (!o.category && gov.categoryHints.length > 0) {
    const topHint = gov.categoryHints[0];
    if (topHint.confidence >= 0.7 && topHint.module !== llmOutput.category) {
      const isLlmGeneric = llmOutput.category === "general" || llmOutput.category === "unclear";
      if (isLlmGeneric) {
        o.category = topHint.module;
        o.overrideReasons.push("R7_category: hint=" + topHint.module + "(" + (topHint.confidence * 100).toFixed(0) + "%) vs llm=" + llmOutput.category);
      }
    }
  }
  return o;
}
__name(validatePostLlm, "validatePostLlm");

// src/vision.ts
async function analyzeScreenshot(_env, _imageInput) {
  return null;
}
__name(analyzeScreenshot, "analyzeScreenshot");
function visionToContext(analysis) {
  const parts = [];
  if (analysis.description) {
    parts.push(`[Capture d'\xE9cran] ${analysis.description}`);
  }
  if (analysis.detectedError) {
    parts.push(`Erreur d\xE9tect\xE9e: ${analysis.detectedError}`);
  }
  if (analysis.detectedModule) {
    parts.push(`Module probable: ${analysis.detectedModule}`);
  }
  return parts.join("\n");
}
__name(visionToContext, "visionToContext");

// src/routes.ts
function inferRagTopModule(pbCtx, docsCtx) {
  const moduleScores = {};
  for (const item of pbCtx.items) {
    const mod = canonicalModule(item.module);
    if (mod && mod !== "general") moduleScores[mod] = (moduleScores[mod] || 0) + item.score * 2;
  }
  for (const item of docsCtx.items) {
    const mod = canonicalModule(item.module);
    if (mod && mod !== "general") moduleScores[mod] = (moduleScores[mod] || 0) + item.score;
  }
  const entries = Object.entries(moduleScores);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return toCoarseModule(entries[0][0]);
}
__name(inferRagTopModule, "inferRagTopModule");
function chatJson(req, data, status = 200) {
  return json(req, normalizeSupportResponse(data), status);
}
__name(chatJson, "chatJson");
function normText(s) {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "").trim();
}
__name(normText, "normText");
function cheapSim(a, b) {
  const A = new Set(normText(a).split(" ").filter(Boolean));
  const B = new Set(normText(b).split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}
__name(cheapSim, "cheapSim");
function analyzeConversationState(history, currentModule) {
  const assistantMsgs = history.filter((h) => h.role === "assistant").map((h) => String(h.content || ""));
  const userMsgs = history.filter((h) => h.role === "user").map((h) => String(h.content || ""));
  const turnCount = assistantMsgs.length;
  const stepsGiven = [];
  for (const msg of assistantMsgs) {
    const stepMatches = msg.match(/\d+[\.\)]\s*\*?\*?[^*\n]{10,80}/g);
    if (stepMatches) {
      for (const s of stepMatches) {
        const cleaned = s.replace(/^\d+[\.\)]\s*\*?\*?/, "").trim().slice(0, 80);
        if (cleaned.length > 10 && !stepsGiven.some((ex) => cheapSim(ex, cleaned) > 0.6)) {
          stepsGiven.push(cleaned);
        }
      }
    }
  }
  const questionsAsked = [];
  for (const msg of assistantMsgs) {
    const qMatches = msg.match(/[^\n.!]{10,100}\?/g);
    if (qMatches) {
      for (const q of qMatches.slice(0, 3)) {
        const cleaned = q.trim().slice(0, 100);
        if (!questionsAsked.some((ex) => cheapSim(ex, cleaned) > 0.5)) {
          questionsAsked.push(cleaned);
        }
      }
    }
  }
  const dataProvided = [];
  const seenTypes = /* @__PURE__ */ new Set();
  for (const msg of userMsgs) {
    const orderRefs = msg.match(/\b\d{8,}\b/g);
    if (orderRefs && !seenTypes.has("refs")) {
      seenTypes.add("refs");
      const refs = [...new Set(orderRefs)].slice(0, 5);
      dataProvided.push("refs commandes: " + refs.join(", "));
    }
    if (/https?:\/\/|www\.\S+/i.test(msg) && !seenTypes.has("url")) {
      seenTypes.add("url");
      dataProvided.push("URL fournie");
    }
    const errorCodes = msg.match(/\b(?:erreur|error|code)\s*:?\s*\d{3}\b/i);
    if (errorCodes && !seenTypes.has("err")) {
      seenTypes.add("err");
      dataProvided.push("code erreur: " + errorCodes[0]);
    }
    const domainMatch = msg.match(/\b[\w-]+\.(tn|com|net|org|fr|shop|store)\b/i);
    if (domainMatch && !seenTypes.has("domain")) {
      seenTypes.add("domain");
      dataProvided.push("domaine: " + domainMatch[0]);
    }
    const carrierMatch = msg.match(/\b(droppex|aramex|fedex|dhl|chronopost|rapid\s*poste|poste\s*tunisienne|ups|tnt|express\s*delivery|mylerz|yan?lidine|maystro|genex|sobflous)\b/i);
    if (carrierMatch && !seenTypes.has("carrier")) {
      seenTypes.add("carrier");
      dataProvided.push("transporteur: " + carrierMatch[1]);
    }
    if (/capture|screenshot|image|photo|pi\u00e8ce.?jointe|ci.?joint/i.test(msg) && !seenTypes.has("screenshot")) {
      seenTypes.add("screenshot");
      dataProvided.push("capture d'\xE9cran mentionn\xE9e");
    }
  }
  const merchantClaims = [];
  for (const msg of userMsgs) {
    const m = msg.toLowerCase();
    if (/tout\s+(est\s+)?v[e\u00e9]rifi[e\u00e9]|j['\u2019]ai\s+(tout\s+)?(fait|essay\u00e9|v\u00e9rifi\u00e9)/i.test(m)) merchantClaims.push("dit avoir tout v\xE9rifi\xE9");
    if (/persist|toujours\s+pareil|m\u00eame\s+probl[e\u00e8]|\u00e7a\s+change\s+rien|marche\s+toujours\s+pas/i.test(m)) merchantClaims.push("probl\xE8me persiste");
    if (/d\u00e9j\u00e0\s+(fait|essay\u00e9|test\u00e9)|j['\u2019]ai\s+d\u00e9j\u00e0/i.test(m)) merchantClaims.push("dit avoir d\xE9j\xE0 essay\xE9");
    if (/\u00e7a\s+(a\s+)?march[\u00e9e]|c['\u2019]est\s+bon|r\u00e9solu|r\u00e9gl\u00e9|merci.*marche/i.test(m)) merchantClaims.push("probl\xE8me r\xE9solu");
    if (/erreur|error|code\s+\d{3}|message\s+d['\u2019]erreur/i.test(m)) merchantClaims.push("a fourni un message d'erreur");
    if (/https?:\/\/|\.tn|\.com|www\./i.test(m)) merchantClaims.push("a fourni une URL");
  }
  let lastQuestion = null;
  if (assistantMsgs.length > 0) {
    const last = assistantMsgs[assistantMsgs.length - 1];
    const lastQ = last.match(/[^\n.!]{10,100}\?\s*$/m);
    if (lastQ) lastQuestion = lastQ[0].trim();
  }
  let questionAnswered = false;
  if (questionsAsked.length > 0 && userMsgs.length > assistantMsgs.length - 1 && userMsgs.length > 0) {
    const lastUserMsg = userMsgs[userMsgs.length - 1].trim().toLowerCase();
    if (/^(oui|non|ok|d'accord|exact|c'est (?:\u00e7a|ca|bon)|weh|la|ouais|ah?\s*oui|nn|nope|yep|yes|no|si|bien s\u00fbr|absolument|pas encore|pas du tout|voil\u00e0)\b/i.test(lastUserMsg) || lastUserMsg.length < 20) {
      questionAnswered = true;
    }
    if (!questionAnswered && dataProvided.length > 0 && lastUserMsg.length > 5) {
      questionAnswered = true;
    }
  }
  let topicShifted2 = false;
  if (userMsgs.length >= 2) {
    const prevMsg = userMsgs[userMsgs.length - 2].toLowerCase();
    const currMsg = userMsgs[userMsgs.length - 1].toLowerCase();
    const topicKeywords = {
      orders: /commande|order|bordereau|confirmation|annul/i,
      products: /produit|catalogue|variante|cat[eé]gorie|image|import/i,
      shipping: /livraison|colis|transporteur|tracking|exp[eé]di/i,
      settings: /domaine|dns|ssl|certificat|param[eè]tr/i,
      payments: /paiement|stripe|carte|konnect|edinar|transaction/i,
      builder: /template|design|section|banni[eè]re|header|footer|page/i,
      billing: /facture|abonnement|forfait|renouvellement/i
    };
    let prevTopic = "";
    let currTopic = "";
    for (const [topic, re] of Object.entries(topicKeywords)) {
      if (re.test(prevMsg)) prevTopic = topic;
      if (re.test(currMsg)) currTopic = topic;
    }
    if (currTopic && prevTopic && currTopic !== prevTopic) {
      topicShifted2 = true;
    }
  }
  let phase;
  if (turnCount === 0 || topicShifted2) {
    phase = topicShifted2 ? "greeting" : "greeting";
  } else if (turnCount >= 3 && [...new Set(merchantClaims)].includes("probl\xE8me persiste")) {
    phase = "exhausted";
  } else if (stepsGiven.length > 0 && merchantClaims.some((c) => c.includes("persiste") || c.includes("tout v\xE9rifi\xE9"))) {
    phase = "followup";
  } else if (questionAnswered && questionsAsked.length > 0) {
    phase = "prescribe";
  } else if (stepsGiven.length > 0) {
    phase = "prescribe";
  } else if (turnCount >= 3 && stepsGiven.length === 0) {
    phase = turnCount >= 4 ? "exhausted" : "prescribe";
  } else if (turnCount <= 2 && stepsGiven.length === 0) {
    phase = "diagnose";
  } else {
    phase = "diagnose";
  }
  return {
    phase,
    module: currentModule,
    turnCount,
    stepsGiven: stepsGiven.slice(-6),
    merchantClaims: [...new Set(merchantClaims)],
    questionsAsked: questionsAsked.slice(-4),
    dataProvided: [...new Set(dataProvided)],
    lastQuestion,
    questionAnswered,
    topicShifted: topicShifted2
  };
}
__name(analyzeConversationState, "analyzeConversationState");
function buildHistoryStateSummary(history, currentModule) {
  if (history.length === 0) return "";
  const state = analyzeConversationState(history, currentModule);
  if (state.turnCount === 0) return "";
  const lines = [];
  lines.push(`--- \xC9TAT CONVERSATION (phase: ${state.phase.toUpperCase()}) ---`);
  lines.push(`Module: ${state.module} | R\xE9ponses donn\xE9es: ${state.turnCount}`);
  if (state.dataProvided.length > 0) {
    lines.push(`DONN\xC9ES D\xC9J\xC0 FOURNIES PAR LE MARCHAND (NE PAS REDEMANDER):`);
    state.dataProvided.forEach((d) => lines.push(`  - ${d}`));
  }
  if (state.stepsGiven.length > 0) {
    lines.push(`\xC9TAPES D\xC9J\xC0 DONN\xC9ES (NE PAS R\xC9P\xC9TER):`);
    state.stepsGiven.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  }
  if (state.questionsAsked.length > 0) {
    lines.push(`QUESTIONS D\xC9J\xC0 POS\xC9ES (NE PAS REDEMANDER):`);
    state.questionsAsked.forEach((q) => lines.push(`  - ${q}`));
  }
  if (state.merchantClaims.length > 0) {
    lines.push(`LE MARCHAND AFFIRME: ${state.merchantClaims.join(", ")}`);
  }
  if (topicShifted) {
    lines.push(`\u26A0\uFE0F CHANGEMENT DE SUJET D\xC9TECT\xC9. Le marchand parle d'un NOUVEAU probl\xE8me. R\xE9ponds au nouveau sujet, pas \xE0 l'ancien.`);
  }
  if (state.questionAnswered) {
    lines.push(`!! LE MARCHAND A R\xC9PONDU \xC0 TA DERNI\xC8RE QUESTION. NE LA REPOSE PAS. Utilise sa r\xE9ponse et AVANCE vers la solution. !!`);
  }
  switch (state.phase) {
    case "diagnose":
      lines.push(`DIRECTIVE: Phase DIAGNOSTIC. Pose 1 question cibl\xE9e DIFF\xC9RENTE des pr\xE9c\xE9dentes.`);
      break;
    case "prescribe":
      if (state.questionAnswered) {
        lines.push(`DIRECTIVE: Phase PRESCRIPTION. Le marchand a r\xE9pondu \xE0 ta question. DONNE 2-3 \xC9TAPES CONCR\xC8TES maintenant. PAS de nouvelles questions.`);
      } else {
        lines.push(`DIRECTIVE: Phase PRESCRIPTION. Assez d'infos. Donne 2-3 nouvelles \xE9tapes concr\xE8tes.`);
      }
      break;
    case "followup":
      lines.push(`DIRECTIVE: Le marchand revient apr\xE8s tes \xE9tapes. NE R\xC9P\xC8TE RIEN. Propose une ALTERNATIVE ou 1 question d'approfondissement.`);
      break;
    case "exhausted":
      lines.push(`DIRECTIVE: Plusieurs tentatives sans succ\xE8s. Dernier diagnostic cibl\xE9 OU escalade (escalate=true, verdict="tiktak_side").`);
      break;
  }
  if (state.lastQuestion) {
    lines.push(`TA DERNI\xC8RE QUESTION: "${state.lastQuestion.slice(0, 100)}"`);
    if (state.questionAnswered) {
      lines.push(`Le marchand a r\xE9pondu. AVANCE. Ne repose pas.`);
    } else {
      lines.push(`Si le marchand y a r\xE9pondu, utilise sa r\xE9ponse et ne la repose pas.`);
    }
  }
  return "\n" + lines.join("\n");
}
__name(buildHistoryStateSummary, "buildHistoryStateSummary");
var BANNED_TERMS_RE = /\b(playbook|documentation|docs|notre guide|consulter le guide|consulter la doc|dans la documentation)\b/i;
async function runStructuredChat(env, currentMessage, history, knowledgeContext, routingHints, maxTokens = 900, opts) {
  const messages = buildLlmMessages(currentMessage, history, knowledgeContext, routingHints, opts);
  try {
    const result = await env.AI.run(CHAT_MODEL, {
      messages,
      max_tokens: maxTokens,
      temperature: 0.3
    });
    let content = (result?.response || "").trim();
    if (!content) return {};
    if (!content.startsWith("{")) content = "{" + content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        try {
          let truncated = jsonMatch[0];
          truncated = truncated.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, "");
          if (!truncated.endsWith("}")) truncated += "}";
          return JSON.parse(truncated);
        } catch {
        }
      }
    }
    const answerFieldMatch = content.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (answerFieldMatch) {
      const extractedAnswer = answerFieldMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
      const verdictMatch = content.match(/"verdict"\s*:\s*"([^"]+)"/);
      const confMatch = content.match(/"confidence"\s*:\s*([\d.]+)/);
      const catMatch = content.match(/"category"\s*:\s*"([^"]+)"/);
      const escMatch = content.match(/"escalate"\s*:\s*(true|false)/);
      return {
        verdict: verdictMatch?.[1] || "user_side",
        confidence: confMatch ? parseFloat(confMatch[1]) : 0.7,
        category: catMatch?.[1] || "general",
        answer: extractedAnswer,
        next_question: null,
        escalate: escMatch?.[1] === "true" || false,
        evidence: [],
        actions: []
      };
    }
    console.log("[LLM] No valid JSON, extracting plain text:", content.slice(0, 200));
    const plainAnswer = content.replace(/^[{\s"]*/, "").replace(/[}\s"]*$/, "").trim();
    if (plainAnswer.length > 10) {
      return {
        verdict: "user_side",
        confidence: 0.65,
        category: "general",
        answer: plainAnswer,
        next_question: null,
        escalate: false,
        evidence: [],
        actions: []
      };
    }
    console.error("No usable AI response:", content.slice(0, 200));
    return {};
  } catch (e) {
    console.error("AI error:", e);
    return {};
  }
}
__name(runStructuredChat, "runStructuredChat");
function processLlmDiagnosis(opts) {
  const { diag, message, originalMessage, preferredModule, keywordScore, pbCtx, docsCtx, state, t0, governance, history, entities } = opts;
  const llmCategory = toCoarseModule(diag?.category || preferredModule || "general");
  const verdictRaw = toStr(diag?.verdict || "unclear");
  const llmVerdict = ["user_side", "tiktak_side", "unclear"].includes(verdictRaw) ? verdictRaw : "unclear";
  const rawLlmConfidence = clamp01(typeof diag?.confidence === "number" ? diag.confidence : 0.5);
  const llmEscalate = diag?.escalate === true;
  const llmAnswer = typeof diag?.answer === "string" ? diag.answer : "";
  const llmNextQuestion = typeof diag?.next_question === "string" && diag.next_question.trim() ? diag.next_question.trim() : null;
  const VALID_TICKET_TYPES = ["bug", "question", "demand", "incident"];
  const llmTicketType = VALID_TICKET_TYPES.includes(diag?.ticket_type) ? diag.ticket_type : "question";
  const VALID_SENTIMENTS = ["calm", "frustrated", "urgent", "satisfied"];
  const llmSentiment = VALID_SENTIMENTS.includes(diag?.sentiment) ? diag.sentiment : "calm";
  const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
  const llmSeverity = VALID_SEVERITIES.includes(diag?.severity) ? diag.severity : "low";
  const llmLanguage = ["fr", "ar", "darija", "en"].includes(diag?.detected_language) ? diag.detected_language : detectLanguage(message);
  const llmConfidence = computeConfidence({
    llmConfidence: rawLlmConfidence,
    topVectorizeScore: Math.max(pbCtx.topScore, docsCtx.topScore),
    keywordScore,
    answerLength: llmAnswer.length
  });
  const hardEsc = checkHardEscalation(message);
  let govOverrides = { overrideReasons: [] };
  if (governance) {
    govOverrides = validatePostLlm(governance, {
      escalate: llmEscalate,
      verdict: llmVerdict,
      category: llmCategory,
      severity: llmSeverity,
      sentiment: llmSentiment,
      ticket_type: llmTicketType
    });
  }
  const govExplicitDeescalate = govOverrides.escalate === false;
  const finalEscalate = govExplicitDeescalate ? false : (govOverrides.escalate ?? false) || llmEscalate || hardEsc.triggered || (governance?.forceEscalate ?? false);
  let finalVerdict = govOverrides.verdict ?? (finalEscalate ? "tiktak_side" : llmVerdict);
  let mode;
  let finalAnswer = llmAnswer;
  let nextQuestion = null;
  if (finalVerdict === "unclear") {
    mode = "clarify";
    nextQuestion = llmNextQuestion || "Peux-tu me donner plus de d\xE9tails ? (message d'erreur, URL ou capture d'\xE9cran)";
    if (!finalAnswer || finalAnswer.length < 10) {
      finalAnswer = "Je veux bien t'aider ! Pour te donner la bonne solution, j'ai besoin d'une petite pr\xE9cision.";
    }
  } else if (finalEscalate) {
    mode = "escalate";
    nextQuestion = null;
    if (!finalAnswer || finalAnswer.length < 15) {
      finalAnswer = "Je comprends la situation \u2014 \xE7a n\xE9cessite l'intervention de notre \xE9quipe technique. Je transf\xE8re ton dossier \u{1F4E7}";
    }
  } else {
    mode = "solve";
    nextQuestion = null;
    if (!finalAnswer || finalAnswer.length < 10) {
      finalAnswer = "Peux-tu reformuler ta question pour que je puisse mieux t'aider ?";
      mode = "clarify";
      finalVerdict = "unclear";
      nextQuestion = "Quel est exactement le probl\xE8me que tu rencontres ?";
    }
  }
  if (mode === "solve" && !finalEscalate) {
    const isVague = message.length < 20 || /\b(ça marche pas|ne marche pas|fonctionne pas|persiste|tous est verifi|tout est verifi|toujours pareil|ne s['’]ouvre pas|marche pas|khdem|ma5dem|maykhdemch)\b/i.test(message);
    const hasEntity = Boolean(
      entities?.domain || entities?.order_id || entities?.error_message || entities?.payment_method || entities?.url
    );
    const priorAssistantCount = history.filter((h) => h.role === "assistant").length;
    if (isVague && !hasEntity && priorAssistantCount === 0 && finalVerdict !== "tiktak_side") {
      mode = "clarify";
      finalVerdict = "unclear";
      nextQuestion = llmNextQuestion || "Tu peux pr\xE9ciser : sur quelle page, quel message exact tu vois, et depuis quand ?";
      if (!finalAnswer || nextQuestion && cheapSim(finalAnswer, nextQuestion) > 0.5) {
        finalAnswer = "Ok \u{1F44D} Pour te guider sans tourner en rond, j'ai besoin d'un d\xE9tail pr\xE9cis.";
      }
    }
  }
  if (mode === "solve" || mode === "clarify") {
    let isRepeat = false;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "assistant") {
        const prevText = String(history[i].content || "");
        if (prevText.length > 30 && cheapSim(finalAnswer, prevText) >= 0.55) {
          isRepeat = true;
          break;
        }
      }
    }
    if (!isRepeat) {
      const newQuestions = finalAnswer.match(/[^\n.!]{10,100}\?/g);
      if (newQuestions) {
        const prevQuestions = [];
        for (const h of history) {
          if (h.role === "assistant") {
            const qs = String(h.content || "").match(/[^\n.!]{10,100}\?/g);
            if (qs) prevQuestions.push(...qs.map((q) => q.trim()).slice(0, 3));
          }
        }
        for (const nq of newQuestions) {
          for (const pq of prevQuestions) {
            if (cheapSim(nq.trim(), pq) >= 0.45) {
              isRepeat = true;
              break;
            }
          }
          if (isRepeat) break;
        }
      }
    }
    if (isRepeat) {
      const convState = analyzeConversationState(history, preferredModule);
      const hasRefs = convState.dataProvided.some((d) => d.includes("refs") || d.includes("commande"));
      const hasUrl = convState.dataProvided.some((d) => d.includes("URL"));
      const qAnswered = convState.questionAnswered;
      if (qAnswered || convState.turnCount >= 3) {
        mode = "solve";
        finalVerdict = "user_side";
        nextQuestion = null;
        if (convState.module === "orders" || convState.module === "shipping") {
          finalAnswer = "D'accord ! Voici ce que tu peux faire :\n1. Va dans **Commandes** sur ton dashboard TikTak\n2. V\xE9rifie le statut de synchronisation avec le transporteur\n3. Si le statut est bloqu\xE9, clique sur **Resynchroniser** ou contacte le transporteur pour confirmer la livraison\n\nDis-moi si \xE7a fonctionne !";
        } else if (convState.module === "settings") {
          finalAnswer = "Voici les \xE9tapes :\n1. Va dans **Param\xE8tres > Domaines** sur ton dashboard\n2. V\xE9rifie que les DNS pointent correctement (CNAME ou A record)\n3. Si SSL, clique sur **Reg\xE9n\xE9rer le certificat**\n\nTiens-moi au courant !";
        } else if (convState.module === "products") {
          finalAnswer = "Voici ce que je te propose :\n1. Va dans **Produits** sur ton dashboard\n2. Ouvre le produit concern\xE9 et v\xE9rifie les champs obligatoires (titre, prix, stock)\n3. Sauvegarde et rafra\xEEchis la page\n\nDis-moi ce que tu vois !";
        } else {
          finalAnswer = "Bien re\xE7u, voici les \xE9tapes \xE0 suivre :\n1. V\xE9rifie dans ton **Dashboard TikTak** la section concern\xE9e\n2. Teste en mode navigation priv\xE9e (Ctrl+Shift+N)\n3. Si le probl\xE8me persiste, envoie-moi une capture d'\xE9cran\n\nTiens-moi au courant !";
        }
      } else {
        mode = "clarify";
        finalVerdict = "unclear";
        const mod = preferredModule;
        if (mod === "orders") {
          if (hasRefs) {
            nextQuestion = "Quel statut exact vois-tu pour ces commandes dans TikTak ? (ex: en attente, annul\xE9e, erreur sync)";
          } else {
            nextQuestion = "Tu peux me donner le num\xE9ro de commande + ce que tu vois exactement (erreur, statut) ?";
          }
        } else if (mod === "settings") {
          nextQuestion = hasUrl ? "Quel message d'erreur exact vois-tu ? (ex: SSL 525/526, page blanche, site introuvable)" : "Tu peux m'envoyer le nom exact du domaine + le message affich\xE9 ?";
        } else if (mod === "shipping") {
          nextQuestion = hasRefs ? "Quel transporteur utilises-tu et quel statut vois-tu dans TikTak vs chez le livreur ?" : "Quel transporteur + quel num\xE9ro de commande / colis ? Qu'est-ce que tu vois exactement ?";
        } else if (mod === "technical") {
          nextQuestion = "Quel est le code exact (500/504/etc) + sur quelle page ? C'est intermittent ou permanent ?";
        } else if (mod === "products") {
          nextQuestion = "Quel produit exactement ? Tu peux m'envoyer le SKU ou le nom + le message d'erreur ?";
        } else if (mod === "payments" || mod === "billing") {
          nextQuestion = "Quel moyen de paiement (Stripe/PayPal/e-Dinar/COD) ? Le montant + message d'erreur exact ?";
        } else {
          nextQuestion = "Donne-moi une pr\xE9cision (message d'erreur / capture / depuis quand) pour cibler la solution.";
        }
        finalAnswer = "Je veux cibler la solution sans tourner en rond. J'ai besoin d'une derni\xE8re pr\xE9cision :";
      }
    }
  }
  if (BANNED_TERMS_RE.test(finalAnswer)) {
    finalAnswer = finalAnswer.split("\n").filter((l) => !BANNED_TERMS_RE.test(l)).join("\n").trim() || "Je te donne directement les \xE9tapes. Dis-moi ce que tu vois exactement (message d'erreur / page) et on continue.";
  }
  if (finalAnswer.length > 60) {
    const words = finalAnswer.split(/\s+/);
    let degenerated = false;
    outer: for (let len = 3; len <= 6; len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const ngram = words.slice(i, i + len).join(" ").toLowerCase();
        let count = 0;
        for (let j = 0; j <= words.length - len; j++) {
          if (words.slice(j, j + len).join(" ").toLowerCase() === ngram) count++;
        }
        if (count >= 3) {
          degenerated = true;
          break outer;
        }
      }
    }
    if (!degenerated && /\{["\s]*verdict|"category"\s*:|"confidence"\s*:/.test(finalAnswer)) {
      degenerated = true;
    }
    if (!degenerated) {
      const freq = {};
      for (const w of words) {
        const lw = w.toLowerCase().replace(/[^\p{L}]/gu, "");
        if (lw.length > 3) freq[lw] = (freq[lw] || 0) + 1;
      }
      for (const [, count] of Object.entries(freq)) {
        if (count >= 4 && count / words.length > 0.15) {
          degenerated = true;
          break;
        }
      }
    }
    if (degenerated) {
      console.warn("[GUARDRAIL-4] Degenerated LLM output detected, using fallback");
      finalAnswer = "Je comprends ta demande. Peux-tu me d\xE9crire le probl\xE8me en d\xE9tail (message d'erreur exact, page concern\xE9e) pour que je te donne la solution adapt\xE9e ?";
      mode = "clarify";
      finalVerdict = "unclear";
      nextQuestion = "D\xE9cris-moi exactement ce que tu vois : quel message d'erreur, sur quelle page, et depuis quand ?";
    }
  }
  let finalModule;
  if (govOverrides.category) {
    finalModule = govOverrides.category;
  } else if (keywordScore >= 3 && preferredModule !== "general") {
    finalModule = preferredModule;
  } else {
    const ragTopScore = Math.max(pbCtx.topScore, docsCtx.topScore);
    const ragModule = inferRagTopModule(pbCtx, docsCtx);
    if (ragTopScore >= 0.75 && ragModule && ragModule !== "general") {
      if (llmCategory === ragModule || llmCategory === "general" || ragTopScore >= 0.85) {
        finalModule = ragModule;
      } else {
        finalModule = keywordScore > 0 && preferredModule === llmCategory ? llmCategory : ragModule;
      }
    } else if (keywordScore > 0 && preferredModule !== "general") {
      if (llmCategory === "general" || llmCategory === preferredModule) {
        finalModule = preferredModule;
      } else {
        finalModule = llmCategory;
      }
    } else {
      finalModule = llmCategory;
    }
    if (finalModule === "general" && governance && governance.categoryHints.length > 0 && governance.categoryHints[0].confidence >= 0.7) {
      finalModule = governance.categoryHints[0].module;
    }
    if (keywordScore === 0 && preferredModule === "general" && (!governance || governance.categoryHints.length === 0) && finalModule !== "general" && ragTopScore < 0.75) {
      finalModule = "general";
    }
  }
  const evidence = gatherEvidence(diag?.evidence || [], pbCtx, docsCtx, 6);
  const finalSeverity = govOverrides.severity ?? (hardEsc.triggered ? "critical" : llmSeverity);
  const finalSentiment = govOverrides.sentiment ?? llmSentiment;
  const signals = augmentSignals(
    {
      confidence: llmConfidence,
      preferredModule: finalModule,
      incident: finalEscalate,
      severity: finalSeverity,
      category: finalModule,
      sentiment: finalSentiment,
      escalation_recommended: finalEscalate
    },
    { message }
  );
  const actions = Array.isArray(diag?.actions) ? diag.actions : [];
  let responseState = state;
  if (mode === "clarify" && nextQuestion) {
    const wf = llmCategory === "settings" ? "domain" : "error_message";
    responseState = setWaitingState(state, wf, originalMessage);
  }
  return {
    mode,
    category: finalModule,
    verdict: finalVerdict,
    confidence: llmConfidence,
    answer: finalAnswer,
    next_question: nextQuestion,
    escalate: finalEscalate,
    ticket_type: govOverrides.ticket_type ?? llmTicketType,
    sentiment: finalSentiment,
    severity: finalSeverity,
    detected_language: llmLanguage,
    processing_time_ms: Date.now() - t0,
    evidence,
    signals,
    context: finalModule,
    preferredModule: finalModule,
    actions,
    state: responseState
  };
}
__name(processLlmDiagnosis, "processLlmDiagnosis");
async function runRagPipeline(env, message, history, tenantId) {
  const governance = runGovernance(message);
  const detection = detectPreferredModule(message, history);
  let preferredModule = canonicalModule(detection.module);
  const keywordScore = detection.score;
  if (preferredModule === "general" && governance.categoryHints.length > 0) {
    const topHint = governance.categoryHints[0];
    if (topHint.confidence >= 0.7) {
      preferredModule = topHint.module;
    }
  }
  const modulePrefix = preferredModule !== "general" ? `MODULE=${preferredModule}
` : "";
  const pbQuery = `${modulePrefix}${message}
${history.slice(-5).map((h) => `${h.role}: ${h.content}`).join("\n")}`.trim();
  const docsQuery = `${message}
${history.slice(-6).map((h) => `${h.role}: ${h.content}`).join("\n")}`.trim();
  const [pbVec, docsVec] = await Promise.all([embedText(env, pbQuery), embedText(env, docsQuery)]);
  if (!pbVec || !docsVec) return null;
  const [pbCtx, docsCtx] = await Promise.all([
    smartFetchContext(env, env.TIKTAK_PLAYBOOKS, pbVec, tenantId, preferredModule, 4, "playbook"),
    smartFetchContext(env, env.TIKTAK_KB, docsVec, tenantId, preferredModule, 7, "doc")
  ]);
  if (preferredModule === "general" && keywordScore === 0) {
    const inferred = inferModuleFromRetrieval(pbCtx, docsCtx);
    if (inferred && inferred !== "general") preferredModule = inferred;
  }
  const entities = extractEntities(message);
  const hintParts = [];
  if (keywordScore > 0) hintParts.push(`Mots-cl\xE9s \u2192 ${preferredModule} (score: ${keywordScore.toFixed(1)})`);
  if (entities.domain) hintParts.push(`Domaine: ${entities.domain}`);
  if (entities.order_id) hintParts.push(`Commande #${entities.order_id}`);
  if (entities.error_message) hintParts.push(`Erreur: "${entities.error_message.slice(0, 100)}"`);
  if (entities.payment_method) hintParts.push(`Paiement: ${entities.payment_method}`);
  const govHints = governanceToPromptHints(governance);
  const routingHints = (hintParts.length ? hintParts.join(" | ") : "") + govHints;
  const knowledgeContext = buildKnowledgeContext(preferredModule, pbCtx, docsCtx);
  return { preferredModule, keywordScore, pbCtx, docsCtx, routingHints, knowledgeContext, governance, entities };
}
__name(runRagPipeline, "runRagPipeline");
async function handleIngest(req, env) {
  const secret = req.headers.get("x-internal-secret");
  if (secret !== env.INTERNAL_SHARED_SECRET) {
    return json(req, { error: "unauthorized" }, 403);
  }
  const payload = await safeReadJson(req);
  if (!payload) return json(req, { error: "invalid_json" }, 400);
  const kind = toStr(payload.kind);
  if (kind === "playbooks" && Array.isArray(payload.items)) {
    let stored = 0;
    let upserted = 0;
    for (const item of payload.items) {
      const vec = await embedText(env, item.text);
      if (!vec) continue;
      const r2Key = `playbooks/${item.tenant_id}/${item.playbook_id}.json`;
      await env.TIKTAK_DOCS.put(r2Key, JSON.stringify(item));
      stored++;
      const vecId = `${item.tenant_id}:pb:${item.playbook_id}`;
      await env.TIKTAK_PLAYBOOKS.upsert([
        {
          id: vecId,
          values: vec,
          metadata: {
            tenant_id: item.tenant_id,
            kind: "playbook",
            playbook_id: item.playbook_id,
            module: item.module,
            r2_key: r2Key
          }
        }
      ]);
      upserted++;
    }
    return json(req, { ok: true, stored, upserted });
  }
  if (kind === "docs" && Array.isArray(payload.items)) {
    let upserted = 0;
    for (const item of payload.items) {
      const vec = await embedText(env, item.text);
      if (!vec) continue;
      const vecId = `${item.tenant_id}:doc:${item.doc_id}:${item.chunk_id}`;
      await env.TIKTAK_KB.upsert([
        {
          id: vecId,
          values: vec,
          metadata: {
            tenant_id: item.tenant_id,
            kind: "doc",
            doc_id: item.doc_id,
            chunk_id: item.chunk_id,
            module: item.module,
            text: item.text.slice(0, 500)
          }
        }
      ]);
      upserted++;
    }
    return json(req, { ok: true, upserted });
  }
  const tenantId = toStr(payload.tenant_id);
  if (kind === "playbook") {
    const item = payload;
    const vec = await embedText(env, item.text);
    if (!vec) return json(req, { error: "embedding_failed" }, 500);
    const r2Key = `playbooks/${tenantId}/${item.playbook_id}.json`;
    await env.TIKTAK_DOCS.put(r2Key, JSON.stringify(item));
    const vecId = `${tenantId}:pb:${item.playbook_id}`;
    await env.TIKTAK_PLAYBOOKS.upsert([
      {
        id: vecId,
        values: vec,
        metadata: {
          tenant_id: tenantId,
          kind: "playbook",
          playbook_id: item.playbook_id,
          module: item.module,
          r2_key: r2Key
        }
      }
    ]);
    return json(req, { ok: true, id: vecId, r2_key: r2Key });
  }
  if (kind === "doc") {
    const item = payload;
    const vec = await embedText(env, item.text);
    if (!vec) return json(req, { error: "embedding_failed" }, 500);
    const vecId = `${tenantId}:doc:${item.doc_id}:${item.chunk_id}`;
    await env.TIKTAK_KB.upsert([
      {
        id: vecId,
        values: vec,
        metadata: {
          tenant_id: tenantId,
          kind: "doc",
          doc_id: item.doc_id,
          chunk_id: item.chunk_id,
          module: item.module,
          text: item.text.slice(0, 500)
        }
      }
    ]);
    return json(req, { ok: true, id: vecId });
  }
  return json(req, { error: "unknown_kind" }, 400);
}
__name(handleIngest, "handleIngest");
async function handleChat(req, env, debug = false) {
  const payload = await safeReadJson(req);
  if (!payload) return chatJson(req, { error: "invalid_json" }, 400);
  const t0 = Date.now();
  const tenantId = toStr(payload.tenant_id || "tiktak_pro");
  const state = (payload && typeof payload === "object" ? payload.state : null) || null;
  const originalMessage = toStr(payload.message || "").trim();
  let message = originalMessage;
  const mergedFollowup = mergeFollowupIntoQuery(message, state);
  message = mergedFollowup.merged;
  const history = Array.isArray(payload.history) ? payload.history : [];
  const imageInput = toStr(payload.image || payload.image_url || "").trim();
  if (!message && !imageInput) {
    return chatJson(req, { error: "empty_message" }, 400);
  }
  let visionAnalysis = null;
  if (imageInput) {
    visionAnalysis = await analyzeScreenshot(env, imageInput);
    if (visionAnalysis) {
      const visionContext = visionToContext(visionAnalysis);
      message = message ? `${message}

${visionContext}` : `Le marchand a envoy\xE9 une capture d'\xE9cran.

${visionContext}`;
    }
  }
  if (isGreetingOnly(message)) {
    return chatJson(req, {
      mode: "solve",
      verdict: "user_side",
      category: "general",
      ticket_type: "question",
      sentiment: "calm",
      severity: "low",
      detected_language: detectLanguage(message),
      confidence: 1,
      answer: "Salut \u{1F44B} Je suis ton assistant TikTak PRO. D\xE9cris-moi ton probl\xE8me et je t'aide \xE0 le r\xE9soudre ! Si tu as un message d'erreur ou une URL, partage-les pour un diagnostic plus rapide.",
      next_question: null,
      escalate: false,
      evidence: [],
      signals: { confidence: 1, severity: "low", category: "general", sentiment: "calm", escalation_recommended: false },
      processing_time_ms: Date.now() - t0
    });
  }
  if (isThanksOnly(message)) {
    return chatJson(req, {
      mode: "solve",
      verdict: "user_side",
      category: "general",
      ticket_type: "question",
      sentiment: "satisfied",
      severity: "low",
      detected_language: detectLanguage(message),
      confidence: 1,
      answer: "Avec plaisir \u{1F60A} N'h\xE9site pas si tu as d'autres questions, je suis l\xE0 pour t'aider !",
      next_question: null,
      escalate: false,
      evidence: [],
      signals: { confidence: 1, severity: "low", category: "general", sentiment: "satisfied", escalation_recommended: false },
      processing_time_ms: Date.now() - t0
    });
  }
  const rag = await runRagPipeline(env, message, history, tenantId);
  if (!rag) return chatJson(req, { error: "embedding_failed" }, 500);
  const { preferredModule, keywordScore, pbCtx, docsCtx, routingHints: baseRoutingHints, knowledgeContext, governance, entities } = rag;
  const stateSummary = buildHistoryStateSummary(history, preferredModule);
  const routingHints = baseRoutingHints + stateSummary;
  if (debug) {
    return json(req, {
      debug: true,
      tenantId,
      preferredModule,
      message,
      governance: {
        escalationScore: governance.escalationScore,
        forceEscalate: governance.forceEscalate,
        emotion: governance.emotion,
        httpError: governance.httpError,
        categoryHints: governance.categoryHints
      },
      playbooks: {
        count: pbCtx.items.length,
        avgScore: pbCtx.avgScore.toFixed(2),
        topScore: pbCtx.topScore.toFixed(2),
        items: pbCtx.items.map((i) => ({ id: i.id, score: i.score.toFixed(2), module: i.module }))
      },
      docs: {
        count: docsCtx.items.length,
        avgScore: docsCtx.avgScore.toFixed(2),
        topScore: docsCtx.topScore.toFixed(2),
        items: docsCtx.matches.slice(0, 7).map((m) => ({
          id: m.id,
          score: (m.score * 100).toFixed(0) + "%",
          module: m.metadata?.module
        }))
      }
    });
  }
  const turnCount = history.filter((h) => h.role === "user").length;
  const lastSentiment = governance.emotion.score >= 5 ? governance.emotion.sentiment : void 0;
  const diag = await runStructuredChat(env, message, history, knowledgeContext, routingHints, 900, {
    turnCount,
    sentiment: lastSentiment
  });
  const result = processLlmDiagnosis({
    diag,
    message,
    originalMessage,
    preferredModule,
    keywordScore,
    pbCtx,
    docsCtx,
    state,
    t0,
    governance,
    history,
    entities
  });
  return chatJson(req, result);
}
__name(handleChat, "handleChat");
async function handleChatStream(req, env) {
  const payload = await safeReadJson(req);
  if (!payload) {
    return new Response('data: {"error":"invalid_json"}\n\n', {
      status: 400,
      headers: { "Content-Type": "text/event-stream", ...corsHeaders(req) }
    });
  }
  const t0 = Date.now();
  const tenantId = toStr(payload.tenant_id || "tiktak_pro");
  const state = (payload && typeof payload === "object" ? payload.state : null) || null;
  const originalMessage = toStr(payload.message || "").trim();
  let message = originalMessage;
  const mergedFollowup = mergeFollowupIntoQuery(message, state);
  message = mergedFollowup.merged;
  const history = Array.isArray(payload.history) ? payload.history : [];
  const imageInput = toStr(payload.image || payload.image_url || "").trim();
  if (!message && !imageInput) {
    return new Response('data: {"error":"empty_message"}\n\n', {
      status: 400,
      headers: { "Content-Type": "text/event-stream", ...corsHeaders(req) }
    });
  }
  if (imageInput) {
    const visionResult = await analyzeScreenshot(env, imageInput);
    if (visionResult) {
      const visionContext = visionToContext(visionResult);
      message = message ? `${message}

${visionContext}` : `Le marchand a envoy\xE9 une capture d'\xE9cran.

${visionContext}`;
    }
  }
  if (isGreetingOnly(message) || isThanksOnly(message)) {
    const full = isGreetingOnly(message) ? normalizeSupportResponse({
      mode: "solve",
      verdict: "user_side",
      category: "general",
      ticket_type: "question",
      sentiment: "calm",
      severity: "low",
      detected_language: detectLanguage(message),
      confidence: 1,
      answer: "Salut \u{1F44B} Je suis ton assistant TikTak PRO. D\xE9cris-moi ton probl\xE8me et je t'aide \xE0 le r\xE9soudre !",
      escalate: false,
      evidence: [],
      processing_time_ms: Date.now() - t0
    }) : normalizeSupportResponse({
      mode: "solve",
      verdict: "user_side",
      category: "general",
      ticket_type: "question",
      sentiment: "satisfied",
      severity: "low",
      detected_language: detectLanguage(message),
      confidence: 1,
      answer: "Avec plaisir \u{1F60A} N'h\xE9site pas si tu as d'autres questions !",
      escalate: false,
      evidence: [],
      processing_time_ms: Date.now() - t0
    });
    const body = `event: done
data: ${JSON.stringify(full)}

`;
    return new Response(body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...corsHeaders(req) }
    });
  }
  const rag = await runRagPipeline(env, message, history, tenantId);
  if (!rag) {
    return new Response('event: done\ndata: {"error":"embedding_failed"}\n\n', {
      status: 500,
      headers: { "Content-Type": "text/event-stream", ...corsHeaders(req) }
    });
  }
  const { preferredModule, keywordScore, pbCtx, docsCtx, routingHints: baseStreamHints, knowledgeContext, governance, entities } = rag;
  const streamStateSummary = buildHistoryStateSummary(history, preferredModule);
  const routingHints = baseStreamHints + streamStateSummary;
  const turnCount = history.filter((h) => h.role === "user").length;
  const streamSentiment = governance.emotion.score >= 5 ? governance.emotion.sentiment : void 0;
  const messages = buildLlmMessages(message, history, knowledgeContext, routingHints, { turnCount, sentiment: streamSentiment });
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  (async () => {
    let fullContent = "";
    try {
      const stream = await env.AI.run(CHAT_MODEL, {
        messages,
        max_tokens: 900,
        temperature: 0.3,
        stream: true
      });
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = typeof value === "string" ? value : decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payloadStr = line.slice(6).trim();
          if (payloadStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payloadStr);
            const token = parsed.response || "";
            if (token) {
              fullContent += token;
              await writer.write(encoder.encode(`event: token
data: ${JSON.stringify({ t: token })}

`));
            }
          } catch {
          }
        }
      }
    } catch (e) {
      console.error("Stream error:", e);
    }
    if (!fullContent.startsWith("{")) fullContent = "{" + fullContent;
    let diag = {};
    try {
      const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) diag = JSON.parse(jsonMatch[0]);
    } catch {
      try {
        let truncated = fullContent.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, "");
        if (!truncated.endsWith("}")) truncated += "}";
        diag = JSON.parse(truncated);
      } catch {
        const answerMatch = fullContent.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (answerMatch) {
          diag = { answer: answerMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n"), verdict: "user_side" };
        }
      }
    }
    const result = processLlmDiagnosis({
      diag,
      message,
      originalMessage,
      preferredModule,
      keywordScore,
      pbCtx,
      docsCtx,
      state,
      t0,
      governance,
      history,
      entities
    });
    const donePayload = normalizeSupportResponse(result);
    await writer.write(encoder.encode(`event: done
data: ${JSON.stringify(donePayload)}

`));
    await writer.close();
  })();
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...corsHeaders(req)
    }
  });
}
__name(handleChatStream, "handleChatStream");

// src/index.ts
var RATE_LIMIT_WINDOW_MS = 6e4;
var RATE_LIMIT_MAX = 30;
var ipBuckets = /* @__PURE__ */ new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  let bucket = ipBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    ipBuckets.set(ip, bucket);
  }
  bucket.count++;
  if (ipBuckets.size > 500) {
    for (const [key, b] of ipBuckets) {
      if (now >= b.resetAt) ipBuckets.delete(key);
    }
  }
  return {
    allowed: bucket.count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - bucket.count)
  };
}
__name(checkRateLimit, "checkRateLimit");
var index_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return preflight(req);
    if (url.pathname === "/health") {
      return json(req, {
        ok: true,
        version: "3.0-modular",
        models: { chat: CHAT_MODEL, embed: EMBED_MODEL },
        bindings: {
          ai: !!env.AI,
          docs_kb: !!env.TIKTAK_KB,
          playbooks: !!env.TIKTAK_PLAYBOOKS,
          r2: !!env.TIKTAK_DOCS
        }
      });
    }
    if (url.pathname === "/admin/ingest" && req.method === "POST") {
      try {
        return await handleIngest(req, env);
      } catch (e) {
        return json(req, { error: "ingest_exception", message: toStr(e?.message || e) }, 500);
      }
    }
    if (url.pathname === "/chat" || url.pathname === "/chat/stream") {
      const clientIp = req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "unknown";
      const rateCheck = checkRateLimit(clientIp);
      if (!rateCheck.allowed) {
        return json(req, {
          error: "rate_limit_exceeded",
          message: "Trop de requ\xEAtes. R\xE9essaie dans une minute.",
          retry_after_seconds: 60
        }, 429);
      }
    }
    if (url.pathname === "/chat") {
      const debug = url.searchParams.get("debug") === "1";
      try {
        return await handleChat(req, env, debug);
      } catch (e) {
        console.error("chat_exception:", e?.message || e);
        return json(req, { error: "chat_exception", message: toStr(e?.message || e) }, 500);
      }
    }
    if (url.pathname === "/chat/stream") {
      try {
        return await handleChatStream(req, env);
      } catch (e) {
        console.error("stream_exception:", e?.message || e);
        return new Response(
          `event: done
data: ${JSON.stringify({ error: "stream_exception", message: toStr(e?.message || e) })}

`,
          { status: 500, headers: { "Content-Type": "text/event-stream", ...corsHeaders(req) } }
        );
      }
    }
    return text(req, "Not found", 404);
  }
};
export {
  augmentSignals,
  canonicalModule,
  checkHardEscalation,
  clamp01,
  index_default as default,
  detectLanguage,
  detectPreferredModule,
  extractEntities,
  extractJsonBlock,
  governanceToPromptHints,
  isGreetingOnly,
  isThanksOnly,
  normalizeSupportResponse,
  routeFor,
  runGovernance,
  toCoarseModule,
  validatePostLlm
};
//# sourceMappingURL=index.js.map
