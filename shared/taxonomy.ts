// shared/taxonomy.ts
// Canonical routing subjects used across the worker.
// Keep this list in sync with playbook "scope" values and routing evaluation labels.
//
// IMPORTANT:
// - Only CANONICAL modules live in SUJETS.
// - Aliases are accepted as input via normalizeSujet(), but output is always canonical.

export const SUJETS = [
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
  "technical",
] as const;

export type Sujet = typeof SUJETS[number];

// Ticket type: keep it flexible but documented
export const KNOWN_TICKET_TYPES = ["l0", "l1", "bug", "howto", "request", "unknown"] as const;
export type TicketType = string;

// Aliases → canonical
const ALIASES: Record<string, Sujet> = {
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
  "landing page": "builder",
  "landing": "builder",
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
  "verrouillé": "builder",
  "locked": "builder",
  "maintenance": "builder",
  "prévisualisation": "builder",
  "preview": "builder",
  "personnaliser": "builder",
  "couleur": "builder",
  "couleurs": "builder",
  "typographie": "builder",
  "favicon": "builder",
  "custom code": "builder",
  "code personnalisé": "builder",
  "réseaux sociaux": "builder",
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
  "forfait": "billing",
  "renouvellement": "billing",
  "plan": "billing",
  "upgrade": "billing",
  "downgrade": "billing",

  // orders
  "order": "orders",
  "orders": "orders",
  "commande": "orders",
  "échange": "orders",
  "echange": "orders",
  "exchange": "orders",

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
  "expédition": "shipping",
  "douchette": "shipping",
  "scanner": "shipping",
  "scan": "shipping",
  "barcode": "shipping",
  "frais de livraison": "shipping",
  "livraison gratuite": "shipping",

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
  "2fa": "auth",
  "session expirée": "auth",
  "accès refusé": "auth",
  "identifiant": "auth",
  "réinitialiser mot de passe": "auth",

  "ticket": "support",
  "tickets": "support",
  "complaint": "support",
  "réclamation": "support",
  "complaints": "support",
};

export function normalizeSujet(s: string): Sujet {
  const x = (s || "").toLowerCase().trim();

  if (!x) return "general";
  if (ALIASES[x]) return ALIASES[x];

  if ((SUJETS as readonly string[]).includes(x)) return x as Sujet;
  return "unclear";
}
