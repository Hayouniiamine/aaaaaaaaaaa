// src/verdictPatterns.ts — Structured verdict inference patterns (Phase 1-2)
// Maps symptom → user_side/tiktak_side probability, with required info for clarification
// Grounded in real playbook data + error codes

export interface VerdictPattern {
    id: string;
    symptoms: string[];                    // ["not showing", "disappeared"]
    error_patterns: RegExp[];              // [/502/, /gateway_timeout/]
    user_side_probability: number;         // 0-1
    tiktak_side_probability: number;       // 0-1
    required_info: string[];               // ["product_status", "admin_logs"]
    fast_check: string | null;             // quick verification Q
    related_playbooks: string[];           // ["playbook-products", "playbook-builder"]
    category: string;                      // "products", "payments", etc.
    common_mistakes?: string[];            // common user errors to warn about
    escalation_condition?: string;         // when to escalate despite high user_side prob
}

/**
 * VERDICT PATTERNS — Master decision table
 * Grounded in: playbook triggers, error codes, TikTak bugs, common support patterns
 * 
 * RULE: If symptom matches, use this pattern FIRST. LLM picks up from there.
 * PRIORITY: Most specific patterns first (error codes), then symptom patterns
 */
export const VERDICT_PATTERNS: VerdictPattern[] = [
    // ═════════════════════════════════════════════════════════════════
    // SPECIAL: HTTP ERRORS (deterministic escalation)
    // ═════════════════════════════════════════════════════════════════
    {
        id: "HP_500_INCIDENT",
        symptoms: ["erreur 500", "error 500", "internal server", "500 error"],
        error_patterns: [/\b500\b/],
        user_side_probability: 0.0,
        tiktak_side_probability: 1.0,
        required_info: [],
        fast_check: null,
        related_playbooks: ["playbook-site-errors"],
        category: "technical",
        escalation_condition: "immediate",
    },
    {
        id: "HP_502_INCIDENT",
        symptoms: ["erreur 502", "error 502", "bad gateway", "502", "gateway error"],
        error_patterns: [/\b502\b/, /bad.*gateway/i, /gateway.*error/i],
        user_side_probability: 0.0,
        tiktak_side_probability: 1.0,
        required_info: [],
        fast_check: null,
        related_playbooks: ["playbook-site-errors"],
        category: "technical",
        escalation_condition: "immediate",
    },
    {
        id: "HP_503_INCIDENT",
        symptoms: ["erreur 503", "error 503", "service unavailable", "503", "temporarily unavailable"],
        error_patterns: [/\b503\b/, /service.*unavailable/i],
        user_side_probability: 0.0,
        tiktak_side_probability: 1.0,
        required_info: [],
        fast_check: null,
        related_playbooks: ["playbook-site-errors"],
        category: "technical",
        escalation_condition: "immediate",
    },
    {
        id: "HP_504_INCIDENT",
        symptoms: ["erreur 504", "error 504", "gateway timeout", "504", "timeout"],
        error_patterns: [/\b504\b/, /gateway.*timeout/i, /timeout/i],
        user_side_probability: 0.0,
        tiktak_side_probability: 1.0,
        required_info: [],
        fast_check: null,
        related_playbooks: ["playbook-site-errors"],
        category: "technical",
        escalation_condition: "immediate",
    },

    // ═════════════════════════════════════════════════════════════════
    // PRODUCTS — Most common support issues
    // ═════════════════════════════════════════════════════════════════
    {
        id: "HP_PRODUCT_NOT_VISIBLE",
        symptoms: ["produit invisible", "produit ne s'affiche pas", "produit absent", "produit n'apparait pas", "produit manquant"],
        error_patterns: [/produit.*(?:ne [sp]affiche|invisible|absent|manquant)/i],
        user_side_probability: 0.92,  // 92% chance = user didn't publish
        tiktak_side_probability: 0.05, // 5% = image bug
        required_info: ["product_status", "product_category"],
        fast_check: "Le produit est-il en statut 'Publié' dans votre tableau de bord ?",
        related_playbooks: ["playbook-products", "playbook-products-core", "playbook-builder"],
        category: "products",
        common_mistakes: ["oubli publication", "mauvaise catégorie sélectionnée", "inventaire à 0"],
    },
    {
        id: "HP_PRODUCT_IMPORT_FAIL",
        symptoms: ["impossible importer", "import ne marche pas", "import échoué", "fichier refusé", "csv refusé"],
        error_patterns: [/import.*(?:fail|error|échou|refus)/i],
        user_side_probability: 0.88,  // File format issue
        tiktak_side_probability: 0.08,
        required_info: ["import_format", "error_message", "file_size"],
        fast_check: "Quel format utilisez-vous (Excel/CSV) ? Et le message d'erreur exact ?",
        related_playbooks: ["playbook-products-import"],
        category: "products",
        common_mistakes: ["mauvais encodage UTF-8", "colonnes manquantes", "SKU doublons", "fichier >1000 lignes"],
    },
    {
        id: "HP_PRODUCT_PRICE_ISSUE",
        symptoms: ["prix incorrect", "prix ne s'affiche pas", "prix manquant", "tarif peut", "prix visible"],
        error_patterns: [/prix.*(?:incorrect|ne [sp]affiche|absent|manquant)/i],
        user_side_probability: 0.85,
        tiktak_side_probability: 0.1,
        required_info: ["product_sku", "expected_price", "displayed_price"],
        fast_check: "Pouvez-vous envoyer le SKU du produit et le prix attendu ?",
        related_playbooks: ["playbook-products", "playbook-products-core"],
        category: "products",
    },

    // ═════════════════════════════════════════════════════════════════
    // ORDERS & CHECKOUT
    // ═════════════════════════════════════════════════════════════════
    {
        id: "HP_ORDER_NOT_RECEIVED",
        symptoms: ["commande pas reçue", "client n'a pas reçu", "order not received", "commande introuvable"],
        error_patterns: [/commande.*(?:pas reçu|introuvable|manquante)/i],
        user_side_probability: 0.70,  // Could be: unconfirmed, customer didn't check email, payment issue
        tiktak_side_probability: 0.20,  // Could be: order processing bug
        required_info: ["order_id", "customer_email", "order_date"],
        fast_check: "Pouvez-vous envoyer le numéro de commande exact ?",
        related_playbooks: ["playbook-order-management", "playbook-payment"],
        category: "orders",
        common_mistakes: ["numéro de commande incorrect", "commande pas confirmée", "paiement en attente"],
    },
    {
        id: "HP_CHECKOUT_HANG",
        symptoms: ["checkout ne marche pas", "checkout bloqué", "impossible finaliser commande", "checkout plantée"],
        error_patterns: [/checkout.*(?:ne marche|bloqué|hang|plantée|timeout)/i],
        user_side_probability: 0.30,  // Likely TikTak bug or infrastructure
        tiktak_side_probability: 0.65,
        required_info: ["browser_type", "error_message"],
        fast_check: "Quel navigateur ? Avez-vous un message d'erreur ?",
        related_playbooks: ["playbook-checkout-cart", "playbook-payment"],
        category: "orders",
        escalation_condition: "persistent",  // If persists >2 attempts
    },

    // ═════════════════════════════════════════════════════════════════
    // PAYMENTS
    // ═════════════════════════════════════════════════════════════════
    {
        id: "HP_PAYMENT_DECLINED",
        symptoms: ["paiement refusé", "carte refusée", "transaction refusée", "payment declined", "paiement bloqué"],
        error_patterns: [/(?:paiement|payment|transaction).*refusé/i],
        user_side_probability: 0.60,  // Card issue, billing address, etc.
        tiktak_side_probability: 0.30,  // Gateway issue
        required_info: ["card_type", "error_code"],
        fast_check: "Essayez avec une autre carte ou navigateur. C'est encore refusé ?",
        related_playbooks: ["playbook-payment", "playbook-payment-activation"],
        category: "payments",
        common_mistakes: ["adresse facturation incorrecte", "expiration carte", "3DS timeout"],
    },
    {
        id: "HP_PAYMENT_STRIPE_NOT_ACTIVE",
        symptoms: ["stripe pas activé", "paiement pas disponible", "impossible configurer stripe", "no payment option"],
        error_patterns: [/stripe.*not.*active|paiement.*not.*available/i],
        user_side_probability: 0.95,  // User hasn't activated Stripe
        tiktak_side_probability: 0.02,
        required_info: ["stripe_status"],
        fast_check: "Allez dans Paramètres > Paiements. Stripe est-il activé ?",
        related_playbooks: ["playbook-payment", "playbook-payment-activation"],
        category: "payments",
        common_mistakes: ["oubli de cliquer 'Activer'", "création compte Stripe"],
    },

    // ═════════════════════════════════════════════════════════════════
    // DOMAIN / SSL / DNS
    // ═════════════════════════════════════════════════════════════════
    {
        id: "HP_SSL_ERROR",
        symptoms: ["erreur ssl", "certificat", "https pas valide", "ssl refused", "certificate error"],
        error_patterns: [/ssl.*error|certificate.*error|https.*not.*valid/i],
        user_side_probability: 0.60,  // DNS not pointed, ordering issue
        tiktak_side_probability: 0.30,  // Certificate generation delay
        required_info: ["domain_name", "nameserver_status"],
        fast_check: "Vérifiez que vos nameservers pointent bien vers TikTak (Namecheap/Godaddy).",
        related_playbooks: ["playbook-domains", "playbook-ssl", "playbook-manage-domains-ssl"],
        category: "settings",
        common_mistakes: ["nameservers pas à jour", "domaine expiré", "CNAME incorrect"],
    },
    {
        id: "HP_DNS_NOT_RESOLVED",
        symptoms: ["site inaccessible", "domain not resolving", "dns ne fonctionne pas", "domaine ne fonctionne pas"],
        error_patterns: [/(?:dns|domain).*not.*resolv|site.*inaccessible/i],
        user_side_probability: 0.90,  // Nameservers not updated
        tiktak_side_probability: 0.05,
        required_info: ["domain_name", "current_nameservers"],
        fast_check: "Pouvez-vous vérifier les nameservers dans votre registrar (Namecheap, Godaddy) ?",
        related_playbooks: ["playbook-domains"],
        category: "settings",
    },

    // ═════════════════════════════════════════════════════════════════
    // SHIPPING / LOGISTICS
    // ═════════════════════════════════════════════════════════════════
    {
        id: "HP_SHIPPING_RATE_ISSUE",
        symptoms: ["frais livraison incorrects", "tarif livraison ne s'affiche pas", "shipping rate wrong"],
        error_patterns: [/(?:frais|tarif).*livraison.*(?:incorrect|absent)/i],
        user_side_probability: 0.85,
        tiktak_side_probability: 0.1,
        required_info: ["carrier_name", "zone_name", "expected_rate"],
        fast_check: "Quel transporteur ? Et quelle zone géographique ?",
        related_playbooks: ["playbook-shipping", "playbook-shipping-fees"],
        category: "shipping",
    },
    {
        id: "HP_CARRIER_INTEGRATION_FAIL",
        symptoms: ["courrier pas synchronisé", "shipper ne marche pas", "carrier integration broken"],
        error_patterns: [/carrier.*(?:not|sync|broken|integration.*fail)/i],
        user_side_probability: 0.30,
        tiktak_side_probability: 0.65,
        required_info: ["carrier_name", "error_message"],
        fast_check: "Quel courrier (DHL, FedEx, etc) ? Error message ?",
        related_playbooks: ["playbook-carrier-integration"],
        category: "shipping",
        escalation_condition: "persistent",
    },

    // ═════════════════════════════════════════════════════════════════
    // BUILDER / DESIGN / CONTENT
    // ═════════════════════════════════════════════════════════════════
    {
        id: "HP_BUILDER_FROZEN",
        symptoms: ["builder bloqué", "builder ne répond pas", "page blanche builder", "builder crashed"],
        error_patterns: [/builder.*(?:frozen|locked|blank|crashed|ne répond)/i],
        user_side_probability: 0.20,
        tiktak_side_probability: 0.75,
        required_info: ["browser_type", "exact_action"],
        fast_check: "Vider cache du navigateur. Essayer un autre navigateur. Ça marche ?",
        related_playbooks: ["playbook-builder", "playbook-builder-advanced"],
        category: "builder",
        escalation_condition: "persistent_after_cache_clear",
    },
    {
        id: "HP_PAGE_NOT_VISIBLE",
        symptoms: ["page invisible", "page ne s'affiche pas", "page introuvable", "page blanche"],
        error_patterns: [/page.*(?:invisible|ne [sp]affiche|introuvable|blanche)/i],
        user_side_probability: 0.80,  // User didn't publish / set visibility
        tiktak_side_probability: 0.1,
        required_info: ["page_name", "page_status"],
        fast_check: "La page est-elle en statut 'Publié' ?",
        related_playbooks: ["playbook-builder"],
        category: "builder",
    },

    // ═════════════════════════════════════════════════════════════════
    // AUTH / LOGIN / SECURITY
    // ═════════════════════════════════════════════════════════════════
    {
        id: "HP_LOGIN_FAILED",
        symptoms: ["impossible se connecter", "login ne marche pas", "wrong password", "cannot login"],
        error_patterns: [/(?:login|connexion).*(?:fail|wrong|impossible)/i],
        user_side_probability: 0.88,
        tiktak_side_probability: 0.08,
        required_info: ["email_used"],
        fast_check: "Avez-vous saisi le bon email et mot de passe ? Essayez 'Mot de passe oublié'.",
        related_playbooks: ["playbook-auth"],
        category: "auth",
        common_mistakes: ["mauvais email", "capslock accidentel", "compte non confirmé"],
    },
    {
        id: "HP_2FA_ISSUE",
        symptoms: ["code otp ne arrive pas", "2fa ne fonctionne pas", "authentication code expired"],
        error_patterns: [/(?:otp|2fa|authentication.*code).*(?:not.*arrive|fail|expired)/i],
        user_side_probability: 0.70,
        tiktak_side_probability: 0.20,
        required_info: ["phone_number_last_4"],
        fast_check: "Avez-vous reçu le code SMS ? Vérifiez spam.",
        related_playbooks: ["playbook-auth"],
        category: "auth",
        escalation_condition: "multiple_failures",
    },

    // ═════════════════════════════════════════════════════════════════
    // INVENTORY / STOCK
    // ═════════════════════════════════════════════════════════════════
    {
        id: "HP_STOCK_SYNC_FAIL",
        symptoms: ["stock pas mis à jour", "stock incorrecte", "sync fail", "stock non synchronisé"],
        error_patterns: [/stock.*(?:not.*sync|incorrect|not.*update)/i],
        user_side_probability: 0.60,
        tiktak_side_probability: 0.30,
        required_info: ["product_sku", "expected_qty", "displayed_qty"],
        fast_check: "Quel produit (SKU) ? Depuis quand c'est incorrect ?",
        related_playbooks: ["playbook-stock-inventory"],
        category: "inventory",
    },

    // ═════════════════════════════════════════════════════════════════
    // FALLBACK PATTERNS (lower specificity)
    // ═════════════════════════════════════════════════════════════════
    {
        id: "HP_FEATURE_NOT_FOUND",
        symptoms: ["fonction pas trouvée", "option manquante", "where is feature", "can't find"],
        error_patterns: [/(?:fonction|option|feature).*(?:manquante|not.*found|introuvable)/i],
        user_side_probability: 0.95,  // User doesn't know where it is
        tiktak_side_probability: 0.02,
        required_info: ["feature_name", "context_location"],
        fast_check: "C'est dans quelle section ? Et vous cherchez quoi exactement ?",
        related_playbooks: [],
        category: "general",
        common_mistakes: ["cherche à la mauvaise place", "option déplacée dans nouvelle version"],
    },
    {
        id: "HP_ACCOUNT_ERROR",
        symptoms: ["compte bloqué", "accès refusé", "not authorized", "forbidden"],
        error_patterns: [/(?:account|compte).*(?:blocked|forbidden|unauthorized)/i],
        user_side_probability: 0.50,
        tiktak_side_probability: 0.40,
        required_info: ["account_email"],
        fast_check: "Avez-vous accès à d'autres boutiques ? Ou c'est juste celle-ci ?",
        related_playbooks: ["playbook-auth"],
        category: "auth",
        escalation_condition: "always",  // Always need human review
    },
];

/**
 * Find matching verdict pattern for a message
 *
 * ALGORITHM: Try error code patterns FIRST (most specific), then symptom patterns
 * Returns: VerdictPattern if match found, else null (requires LLM decision)
 */
export function findVerdictPattern(message: string): VerdictPattern | null {
    const lowerMsg = message.toLowerCase();

    // Try exact error code patterns first (most specific)
    for (const pattern of VERDICT_PATTERNS) {
        for (const regex of pattern.error_patterns) {
            if (regex.test(lowerMsg)) return pattern;
        }
    }

    // Then try symptom patterns
    for (const pattern of VERDICT_PATTERNS) {
        for (const symptom of pattern.symptoms) {
            if (lowerMsg.includes(symptom.toLowerCase())) return pattern;
        }
    }

    return null;
}

/**
 * Infer verdict from pattern with confidence scoring
 *
 * THRESHOLDS: user_side (>0.8) | tiktak_side (>0.6) | unclear (<0.6 needs LLM)
 * Returns: {verdict, confidence, reasoning} structured diagnosis
 */
export function inferVerdictFromPattern(pattern: VerdictPattern): {
    verdict: "user_side" | "tiktak_side" | "unclear";
    confidence: number;
    reasoning: string;
} {
    const max = Math.max(pattern.user_side_probability, pattern.tiktak_side_probability);

    if (pattern.user_side_probability > 0.8) {
        return {
            verdict: "user_side",
            confidence: pattern.user_side_probability,
            reasoning: `Pattern analysis: ${pattern.user_side_probability * 100}% likely user configuration`,
        };
    }

    if (pattern.tiktak_side_probability > 0.6) {
        return {
            verdict: "tiktak_side",
            confidence: pattern.tiktak_side_probability,
            reasoning: `Pattern analysis: ${pattern.tiktak_side_probability * 100}% likely TikTak issue`,
        };
    }

    if (max > 0.3) {
        return {
            verdict: "unclear",
            confidence: max,
            reasoning: "Pattern suggests further diagnostic needed",
        };
    }

    return {
        verdict: "unclear",
        confidence: 0.3,
        reasoning: "No clear pattern match",
    };
}
