// src/governance.ts — Deterministic governance layer (v4: decision-table, zero scoring)
//
// DESIGN: Pure boolean pattern matching → forced outputs.
// No weighted scoring. First-match-wins priority chain.
// Cost: <1ms (regex only, no I/O).
//
// DECISION TABLE (priority order):
//   P0  HTTP false-positive filter  → blocks P1 (PHASE 3 ENHANCED)
//   P1  HTTP 5xx incident           → force technical / tiktak_side / escalate
//   P2  Emotional escalation        → force general / escalate
//   P3  Site/link down (no 5xx)     → force technical / tiktak_side / escalate
//
// POST-LLM OVERRIDE:
//   If tag=http_5xx     → force category=technical, verdict=tiktak_side, escalate=true
//   If tag=emotion      → force category=general, escalate=true
//   If tag=false_positive → de-escalate if LLM escalated
//   If tag=site_down    → force category=technical, verdict=tiktak_side, escalate=true

import { checkFalsePositive } from "./supportTypes";

/* ====================================================================
   TYPES
   ==================================================================== */

export type GovTag =
  | "http_false_positive"
  | "http_5xx"
  | "emotion"
  | "site_down"
  | "http_5xx_emotion"
  | "none";

export interface GovernanceSignals {
  /** Primary classification tag — first rule that matched */
  tag: GovTag;

  /** Emotion analysis */
  emotion: {
    score: number;
    triggers: string[];
    sentiment: "frustrated" | "urgent" | "angry" | "calm";
    detected: boolean;
  };

  /** HTTP error analysis */
  httpError: {
    detected: boolean;
    falsePositive: boolean;
    codes: string[];
    reason: string;
    score: number;
  };

  /** Deterministic forced outputs from the decision table */
  force: {
    category?: string;
    verdict?: "user_side" | "tiktak_side" | "unclear";
    escalate?: boolean;
    severity?: string;
    ticket_type?: string;
    sentiment?: string;
  };

  /** Category hints for LLM prompt (informational, not authoritative) */
  categoryHints: Array<{ module: string; confidence: number; reason: string }>;

  /** Persistence detection */
  persistenceScore: number;

  /** Severity keywords score */
  severityScore: number;

  // Legacy compat fields (used by routes.ts escalation logic)
  escalationScore: number;
  forceEscalate: boolean;
  recommendEscalate: boolean;
}

/* ====================================================================
   1. HTTP 5xx PATTERNS — ordered by specificity
   ==================================================================== */

const HTTP_5XX_PATTERNS: RegExp[] = [
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
  /\b(fix|r[eé]soudre|corriger|r[eé]parer)\b.*\b(500|502|503|504)\s*(error|erreur)?\b/i,
];

/* ====================================================================
   2. HTTP FALSE-POSITIVE PATTERNS — "500" is a quantity
   ==================================================================== */

const HTTP_FALSE_POSITIVE_PATTERNS: RegExp[] = [
  /\b500\s*(produits?|articles?|commandes?|clients?|items?|r[eé]f[eé]rences?|SKU|fiches?|pages?|variantes?)\b/i,
  /\b(plan|forfait|pack|limite|capacit[eé]|jusqu['']?[aà]|maximum|max)\b.*\b500\b/i,
  /\b500\b.*\b(plan|forfait|pack|limite|capacit[eé])\b/i,
  /\b(importer|ajouter|avoir|cr[eé]er|g[eé]rer|supporter)\s+500\b/i,
  /\b500\s*(dinars?|dt|tnd|euros?|eur|dollars?|usd)\b/i,
  /\bsuffit\s+(pour\s+)?500\b/i,
];

/* ====================================================================
   3. SITE/LINK DOWN PATTERNS (no explicit 5xx code)
   ==================================================================== */

const SITE_DOWN_PATTERNS: RegExp[] = [
  /\b(site|lien|boutique|page|dashboard|tableau de bord)\b.*\bne\s+(fonctionne|marche)\s+pas\b/i,
  /\bne\s+(fonctionne|marche)\s+pas\b.*\b(site|lien|boutique|page|dashboard)\b/i,
  /\bsite\s*(crash|down|plant[eé]|plante|inaccessible|bloqu[eé]|en panne)\b/i,
  /\b(crash|plante|plant[eé])\b.*\b(site|page|boutique|dashboard)\b/i,
  /\bsite\s+ne\s+(s['']ouvre|charge|r[eé]pond|repond)\s+pas\b/i,
  /\b(lien|link)\b.*\b(ne\s+)?(fonctionne|marche|works?)\s*pas\b/i,
  /\b(fixer|fix|r[eé]soudre|corriger)\b.*\b(probl[eè]me|problem)\b.*\b(site|lien|page)\b/i,
  /\bsite\s*(ma5dimch|ma5demch|5asro|mayekhdemch|may5demch)\b/i,
  /\bsite\s+ma\s*y(7el|5dem|ekhdem)ch\b/i,
];

/* ====================================================================
   4. EMOTION PATTERNS — deterministic boolean match
   ==================================================================== */

interface EmotionPattern {
  pattern: RegExp;
  score: number;
  sentiment: "frustrated" | "urgent" | "angry";
  label: string;
}

const EMOTION_PATTERNS: EmotionPattern[] = [
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
  { pattern: /[A-ZÀ-Ú]{5,}/, score: 4, sentiment: "angry", label: "caps_shouting" },
];

/* ====================================================================
   5. SCANNERS — pure boolean + metadata extraction
   ==================================================================== */

function scanEmotions(message: string): GovernanceSignals["emotion"] {
  const triggers: string[] = [];
  let maxScore = 0;
  let dominantSentiment: "frustrated" | "urgent" | "angry" | "calm" = "calm";

  for (const ep of EMOTION_PATTERNS) {
    if (ep.pattern.test(message)) {
      triggers.push(ep.label);
      if (ep.score > maxScore) {
        maxScore = ep.score;
        dominantSentiment = ep.sentiment;
      }
    }
  }

  // Compound: 3+ moderate triggers bump score
  if (triggers.length >= 3 && maxScore < 8) {
    maxScore = Math.min(10, maxScore + triggers.length - 2);
  }

  return {
    score: maxScore,
    triggers,
    sentiment: triggers.length > 0 ? dominantSentiment : "calm",
    detected: triggers.length > 0 && maxScore >= 5,
  };
}

function scanHttpErrors(message: string): GovernanceSignals["httpError"] {
  // PHASE 3: Use enhanced false positive detection
  const fpCheck = checkFalsePositive(message);
  const isFalsePositive = fpCheck.is_false_positive;
  
  // Fallback to regex patterns if enhanced check doesn't catch it
  const hasFPPattern5xx = !isFalsePositive && HTTP_FALSE_POSITIVE_PATTERNS.some(fp => fp.test(message));
  const has5xx = /\b(500|502|503|504)\b/.test(message);

  const codes: string[] = [];
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
      if (s > maxScore) { maxScore = s; reason = p.source.slice(0, 40); }
    }
  }

  // False-positive suppression (ENHANCED in Phase 3)
  if ((isFalsePositive || hasFPPattern5xx) && (detected || has5xx)) {
    return {
      score: 0,
      detected: false,
      falsePositive: true,
      codes,
      reason: `false_positive (${fpCheck.pattern?.description || "quantity_context"}) confidence=${(fpCheck.probability * 100).toFixed(0)}%`
    };
  }

  return { score: detected ? maxScore : 0, detected, falsePositive: false, codes, reason };
}

function scanSiteDown(message: string): boolean {
  return SITE_DOWN_PATTERNS.some(p => p.test(message));
}

function detectPersistence(message: string): number {
  let score = 0;
  const durationMatch = message.match(/(\d+)\s*(jours?|semaines?|days?|weeks?)/i);
  if (durationMatch) {
    const n = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2].toLowerCase();
    score = unit.startsWith("semaine") || unit.startsWith("week")
      ? Math.min(10, n * 3) : Math.min(10, Math.ceil(n / 2));
  }
  if (/\bune\s+semaine\b/i.test(message)) score = Math.max(score, 3);
  if (/\bun\s+mois\b/i.test(message)) score = Math.max(score, 5);
  if (/\bplusieurs\s+(jours?|semaines?|mois)\b/i.test(message)) score = Math.max(score, 4);
  if (/\b(déjà|already|encore|again|plusieurs fois|multiple times)\s*(contacté|appelé|envoyé|écrit|written|called|sent)/i.test(message)) score = Math.max(score, 5);
  if (/\b(personne|nobody|no one|aucune réponse|pas de réponse|no response|no answer)\b/i.test(message)) score = Math.max(score, 4);
  if (/\b(toujours pas|still not|still no|toujours rien|encore rien)\b/i.test(message)) score = Math.max(score, 4);
  // Problem-persists patterns (user says steps didn't help)
  if (/\b(problème\s+persist|probl[eè]me\s+continu|le\s+probl[eè]me\s+est\s+toujours|toujours\s+(le\s+)?m[eê]me\s+probl[eè]me|même\s+probl[eè]me)\b/i.test(message)) score = Math.max(score, 5);
  if (/\b(tout\s+(est\s+)?v[ée]rifi[ée]|j['']ai\s+(tout\s+)?(fait|essayé|vérifié)|rien\s+n['']a?\s+(changé|marché|fonctionné))\b/i.test(message)) score = Math.max(score, 5);
  if (/\b(toujours\s+pareil|ça\s+(change|marche|fonctionne)\s+rien|même\s+chose|même\s+erreur|still\s+the\s+same)\b/i.test(message)) score = Math.max(score, 5);
  if (/\b(ça\s+persist|persist\s+encore|ne\s+marche\s+toujours\s+pas)\b/i.test(message)) score = Math.max(score, 5);
  return Math.min(10, score);
}

function detectSeverity(message: string): number {
  let score = 0;
  if (/\b(site\s*(down|bloqué|inaccessible|ne s['']ouvre pas|crash)|perte\s*(de\s*)?(données|argent|clients?)|impossible\s+de\s+(vendre|travailler|accéder))\b/i.test(message)) score = Math.max(score, 8);
  if (/\b(paiement\s*(bloqué|impossible|refusé)|commandes?\s*(bloquée?s?|perdues?)|checkout\s*(down|bloqué|cassé))\b/i.test(message)) score = Math.max(score, 6);
  if (/\b(bloqué|blocked|stuck|cassé|broken|ne fonctionne|doesn['']t work)\b/i.test(message)) score = Math.max(score, 4);
  if (/\b(marche|fonctionne)\s*pas\b/i.test(message)) score = Math.max(score, 4);
  return Math.min(10, score);
}

/* ====================================================================
   6. CATEGORY HINT RULES (informational, for LLM prompt + fallback)
   ==================================================================== */

interface CategoryRule {
  module: string;
  pattern: RegExp;
  confidence: number;
  reason: string;
}

const CATEGORY_RULES: CategoryRule[] = [
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
  { module: "general", pattern: /\bduplication\b/i, confidence: 0.7, reason: "Duplication" },
];

function generateCategoryHints(message: string): GovernanceSignals["categoryHints"] {
  const hints: GovernanceSignals["categoryHints"] = [];
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(message)) {
      hints.push({ module: rule.module, confidence: rule.confidence, reason: rule.reason });
    }
  }
  const byModule = new Map<string, { module: string; confidence: number; reason: string }>();
  for (const hint of hints) {
    const existing = byModule.get(hint.module);
    if (!existing || hint.confidence > existing.confidence) byModule.set(hint.module, hint);
  }
  return Array.from(byModule.values()).sort((a, b) => b.confidence - a.confidence);
}

/* ====================================================================
   7. MAIN: governanceScan(message) — decision table, first-match-wins
   ==================================================================== */

export function runGovernance(message: string): GovernanceSignals {
  // Run all scanners
  const emotion = scanEmotions(message);
  const httpError = scanHttpErrors(message);
  const isSiteDown = scanSiteDown(message);
  const persistenceScore = detectPersistence(message);
  const severityScore = detectSeverity(message);
  const categoryHints = generateCategoryHints(message);

  // Decision table
  let tag: GovTag = "none";
  const force: GovernanceSignals["force"] = {};

  // P0: HTTP false-positive → block HTTP rules, no forced outputs
  if (httpError.falsePositive) {
    tag = "http_false_positive";
  }
  // P1 + P2 combo: HTTP 5xx AND emotion
  else if (httpError.detected && emotion.detected) {
    tag = "http_5xx_emotion";
    force.category = "technical";
    force.verdict = "tiktak_side";
    force.escalate = true;
    force.severity = "critical";
    force.ticket_type = "incident";
    force.sentiment = emotion.sentiment;
  }
  // P1: HTTP 5xx incident (no emotion)
  else if (httpError.detected) {
    tag = "http_5xx";
    force.category = "technical";
    force.verdict = "tiktak_side";
    force.escalate = true;
    force.severity = "critical";
    force.ticket_type = "incident";
  }
  // P2: Emotional message — inform sentiment, do NOT force escalation
  else if (emotion.detected) {
    tag = "emotion";
    force.sentiment = emotion.sentiment;
    // emotion alone never triggers escalation (L0/L1 philosophy)
  }
  // P3: Site/link down without explicit 5xx
  else if (isSiteDown) {
    tag = "site_down";
    force.category = "technical";
    force.verdict = "tiktak_side";
    force.escalate = true;
    force.severity = "high";
    force.ticket_type = "bug";
  }

  // Legacy compat fields
  const forceEscalate = force.escalate === true;
  const escalationScore = forceEscalate ? 9 : (emotion.detected ? Math.min(emotion.score, 5) : 0);
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
    recommendEscalate,
  };
}

/* ====================================================================
   8. GOVERNANCE → LLM PROMPT HINTS
   ==================================================================== */

export function governanceToPromptHints(gov: GovernanceSignals): string {
  const parts: string[] = [];

  if (gov.tag === "http_5xx" || gov.tag === "http_5xx_emotion") {
    parts.push("ERREUR SERVEUR 5xx DETECTEE — INCIDENT TECHNIQUE.");
    parts.push('OBLIGATOIRE: category="technical", verdict="tiktak_side", escalate=true, ticket_type="incident", severity="critical".');
    parts.push("Reconnaitre le probleme technique et expliquer que l equipe va investiguer.");
  }

  if (gov.tag === "http_false_positive") {
    parts.push('"500" detecte mais c est une quantite, PAS une erreur serveur. NE PAS escalader pour cela. escalate=false.');
  }

  if (gov.tag === "site_down") {
    parts.push("SITE/LIEN EN PANNE DETECTE — INCIDENT TECHNIQUE.");
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
    parts.push("CONTACT REPETE (persistence: " + gov.persistenceScore + "/10) — le marchand attend depuis longtemps.");
  }

  if (gov.categoryHints.length > 0 && !gov.force.category) {
    const top = gov.categoryHints[0];
    parts.push("Categorie suggeree: " + top.module + " (" + (top.confidence * 100).toFixed(0) + "%) — " + top.reason);
  }

  if (gov.forceEscalate && gov.tag !== "http_false_positive") {
    parts.push("");
    parts.push('DIRECTIVE OBLIGATOIRE: escalate=true, verdict="tiktak_side".');
    parts.push("Commence ta reponse par reconnaitre l emotion/probleme du marchand.");
  }

  return parts.length > 0 ? "\n--- SIGNAUX GOUVERNANCE (pre-analyse automatique) ---\n" + parts.join("\n") : "";
}

/* ====================================================================
   9. POST-LLM OVERRIDE: validatePostLlm(gov, llmOutput)
   ==================================================================== */

export interface PostLlmOverrides {
  escalate?: boolean;
  verdict?: "user_side" | "tiktak_side" | "unclear";
  severity?: string;
  sentiment?: string;
  ticket_type?: string;
  category?: string;
  overrideReasons: string[];
}

/**
 * Deterministic post-LLM correction.
 *
 * R1  tag=http_5xx|http_5xx_emotion|site_down → force technical/tiktak_side/escalate
 * R2  tag=emotion → force general + escalate
 * R3  tag=http_false_positive + llm escalated + emotion < 5 → de-escalate
 * R4  Severity bump for strong emotion
 * R5  Severity bump for HTTP errors
 * R6  Sentiment correction
 * R7  Category fallback from hints
 */
export function validatePostLlm(
  gov: GovernanceSignals,
  llmOutput: {
    escalate: boolean;
    verdict: string;
    category: string;
    severity: string;
    sentiment: string;
    ticket_type: string;
  }
): PostLlmOverrides {
  const o: PostLlmOverrides = { overrideReasons: [] };

  // R1: HTTP 5xx / site-down → force technical incident
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

  // R2: Pure emotion — only correct sentiment, do NOT force escalation
  if (gov.tag === "emotion") {
    // Let LLM decide category and escalation based on actual problem
    // Only correct sentiment if LLM missed it
    if (gov.emotion.score >= 7 && llmOutput.sentiment === "calm") {
      o.sentiment = gov.emotion.sentiment;
      o.overrideReasons.push("R2_sentiment: tag=emotion score=" + gov.emotion.score + " correct sentiment");
    }
  }

  // R3: HTTP false-positive de-escalation
  if (gov.tag === "http_false_positive" && llmOutput.escalate && gov.emotion.score < 5) {
    o.escalate = false;
    o.overrideReasons.push("R3_deescalate: false_positive 500 is quantity, suppress LLM escalation");
  }

  // R4: Severity bump for strong emotion
  if (gov.emotion.score >= 7 && (llmOutput.severity === "low" || llmOutput.severity === "medium") && !o.severity) {
    o.severity = "high";
    o.overrideReasons.push("R4_severity: emotion=" + gov.emotion.score + " high");
  }

  // R5: Severity bump for HTTP errors
  if (gov.httpError.detected && !gov.httpError.falsePositive && !o.severity) {
    if (llmOutput.severity !== "critical") {
      o.severity = "high";
      o.overrideReasons.push("R5_severity: HTTP detected high");
    }
  }

  // R6: Sentiment correction
  if (gov.emotion.score >= 7 && llmOutput.sentiment === "calm") {
    o.sentiment = gov.emotion.sentiment;
    o.overrideReasons.push("R6_sentiment: emotion=" + gov.emotion.score + " " + gov.emotion.sentiment);
  }

  // R7: Category fallback from hints (only if not already set by R1/R2)
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
