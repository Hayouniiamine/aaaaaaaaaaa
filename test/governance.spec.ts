import { describe, it, expect } from 'vitest';
import {
  runGovernance,
  governanceToPromptHints,
  validatePostLlm,
} from '../src/governance';

/* ====================================================================
   GOVERNANCE LAYER TESTS — Deterministic Decision Table (v4)
   Tests updated to match the zero-scoring, first-match-wins model.
   ==================================================================== */

/* ------------------------------------------------------------------ */
/*  1. Emotion Scanner                                                 */
/* ------------------------------------------------------------------ */
describe('Governance — Emotion Scanner', () => {
  it('detects French manager demand (score 10)', () => {
    const gov = runGovernance("JE VEUX PARLER À UN RESPONSABLE IMMÉDIATEMENT!");
    expect(gov.emotion.score).toBeGreaterThanOrEqual(9);
    expect(gov.emotion.sentiment).toBe("angry");
    expect(gov.emotion.detected).toBe(true);
    expect(gov.tag).toBe("emotion");
    // Emotion alone no longer forces escalation
    expect(gov.forceEscalate).toBe(false);
  });

  it('detects French frustration expressions', () => {
    const gov = runGovernance("Je suis très déçu de votre service!");
    expect(gov.emotion.score).toBeGreaterThanOrEqual(7);
    expect(gov.emotion.sentiment).toBe("frustrated");
    expect(gov.emotion.detected).toBe(true);
  });

  it('detects English frustration', () => {
    const gov = runGovernance("I'm extremely frustrated with this platform!");
    expect(gov.emotion.detected).toBe(true);
    expect(gov.emotion.sentiment).toBe("frustrated");
  });

  it('detects Arabizi frustration', () => {
    const gov = runGovernance("7abset men had el service, 7ata wa7ed ma jawbni!");
    expect(gov.emotion.detected).toBe(true);
    // Emotion alone no longer forces escalation
    expect(gov.forceEscalate).toBe(false);
  });

  it('detects Arabic demand for manager', () => {
    const gov = runGovernance("أريد التحدث مع مسؤول الآن!");
    expect(gov.emotion.score).toBeGreaterThanOrEqual(9);
    expect(gov.emotion.sentiment).toBe("angry");
  });

  it('detects urgency patterns', () => {
    const gov = runGovernance("URGENT!! Mon site est bloqué, j'ai besoin d'aide IMMÉDIATEMENT!");
    expect(gov.emotion.detected).toBe(true);
    expect(gov.emotion.sentiment).toBe("urgent");
  });

  it('detects support criticism', () => {
    const gov = runGovernance("Le support est nul, personne ne m'aide!");
    expect(gov.emotion.detected).toBe(true);
    expect(gov.emotion.score).toBeGreaterThanOrEqual(7);
  });

  it('detects refund demand', () => {
    const gov = runGovernance("Remboursez-moi immédiatement!");
    expect(gov.emotion.detected).toBe(true);
    expect(gov.emotion.sentiment).toBe("angry");
    expect(gov.tag).toBe("emotion");
  });

  it('detects "personne ne repond"', () => {
    const gov = runGovernance("personne ne répond à mes messages");
    expect(gov.emotion.detected).toBe(true);
  });

  it('does not false-trigger on calm messages', () => {
    const gov = runGovernance("Comment configurer mon domaine SSL ?");
    expect(gov.emotion.detected).toBe(false);
    expect(gov.emotion.score).toBe(0);
  });

  it('does not false-trigger on simple product questions', () => {
    const gov = runGovernance("Je veux ajouter un produit dans le catalogue");
    expect(gov.emotion.detected).toBe(false);
  });

  it('detects compound moderate triggers', () => {
    const gov = runGovernance("c'est urgent!! depuis 3 jours, toujours pas de réponse!");
    expect(gov.emotion.detected).toBe(true);
    expect(gov.emotion.score).toBeGreaterThanOrEqual(6);
  });

  it('detects Arabizi brabi + 3awnouni', () => {
    const gov = runGovernance("brabi 3awnouni urgent!");
    expect(gov.emotion.detected).toBe(true);
    expect(gov.tag).toBe("emotion");
    // Emotion alone no longer forces category or escalation
    expect(gov.force.category).toBeUndefined();
    expect(gov.forceEscalate).toBe(false);
  });

  it('detects "priez d\'intervenir"', () => {
    const gov = runGovernance("Priez d'intervenir très rapidement!!!");
    expect(gov.emotion.detected).toBe(true);
    expect(gov.tag).toBe("emotion");
    // Emotion alone no longer forces escalation
    expect(gov.forceEscalate).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  2. HTTP 5xx Error Detection                                        */
/* ------------------------------------------------------------------ */
describe('Governance — HTTP 5xx Detection', () => {
  it('detects "erreur 500"', () => {
    const gov = runGovernance("Mon site affiche une erreur 500");
    expect(gov.httpError.detected).toBe(true);
    expect(gov.tag).toBe("http_5xx");
    expect(gov.force.category).toBe("technical");
    expect(gov.force.verdict).toBe("tiktak_side");
    expect(gov.force.escalate).toBe(true);
    expect(gov.forceEscalate).toBe(true);
  });

  it('detects "error 504 gateway timeout"', () => {
    const gov = runGovernance("J'ai une error 504 gateway timeout sur le dashboard");
    expect(gov.httpError.detected).toBe(true);
    expect(gov.tag).toBe("http_5xx");
    expect(gov.force.category).toBe("technical");
  });

  it('detects "internal server error"', () => {
    const gov = runGovernance("I keep getting internal server error");
    expect(gov.httpError.detected).toBe(true);
    expect(gov.tag).toBe("http_5xx");
    expect(gov.forceEscalate).toBe(true);
  });

  it('detects "erreur serveur"', () => {
    const gov = runGovernance("erreur serveur quand j'ouvre la page des commandes");
    expect(gov.httpError.detected).toBe(true);
    expect(gov.force.category).toBe("technical");
  });

  it('detects Arabizi HTTP error', () => {
    const gov = runGovernance("el site tatla3 fih erreur 500 w ma n9derch nkhdm");
    expect(gov.httpError.detected).toBe(true);
    expect(gov.tag).toBe("http_5xx");
    expect(gov.force.category).toBe("technical");
    expect(gov.forceEscalate).toBe(true);
  });

  it('detects "panne" as technical incident', () => {
    const gov = runGovernance("il y a une panne totale du système");
    expect(gov.httpError.detected).toBe(true);
    expect(gov.tag).toBe("http_5xx");
    expect(gov.forceEscalate).toBe(true);
  });

  it('detects dashboard erreur 504', () => {
    const gov = runGovernance("slm el dashboard yodher erreur 504 gateway timeout");
    expect(gov.httpError.detected).toBe(true);
    expect(gov.tag).toBe("http_5xx");
    expect(gov.force.category).toBe("technical");
    expect(gov.force.verdict).toBe("tiktak_side");
  });

  it('detects "How to fix a 500 error" style', () => {
    const gov = runGovernance("How to fix a 500 error on my site?");
    expect(gov.httpError.detected).toBe(true);
    expect(gov.tag).toBe("http_5xx");
    expect(gov.force.category).toBe("technical");
  });

  it('does not detect HTTP error in calm non-error message', () => {
    const gov = runGovernance("Comment configurer le SSL pour mon domaine ?");
    expect(gov.httpError.detected).toBe(false);
    expect(gov.tag).toBe("none");
  });
});

/* ------------------------------------------------------------------ */
/*  3. HTTP False-Positive Filter                                      */
/* ------------------------------------------------------------------ */
describe('Governance — HTTP False-Positive Filter', () => {
  it('"500 produits" is a false positive', () => {
    const gov = runGovernance("Le plan actuel suffit pour 500 produits?");
    expect(gov.httpError.falsePositive).toBe(true);
    expect(gov.httpError.detected).toBe(false);
    expect(gov.tag).toBe("http_false_positive");
    expect(gov.forceEscalate).toBe(false);
  });

  it('"importer 500 articles" is a false positive', () => {
    const gov = runGovernance("Je veux importer 500 articles dans mon catalogue");
    expect(gov.httpError.falsePositive).toBe(true);
    expect(gov.tag).toBe("http_false_positive");
  });

  it('"500 dinars" is a false positive', () => {
    const gov = runGovernance("Le produit coûte 500 dinars");
    expect(gov.httpError.falsePositive).toBe(true);
    expect(gov.tag).toBe("http_false_positive");
  });

  it('"gérer 500 clients" is a false positive', () => {
    const gov = runGovernance("Est-ce que je peux gérer 500 clients?");
    expect(gov.httpError.falsePositive).toBe(true);
    expect(gov.forceEscalate).toBe(false);
  });

  it('"suffit pour 500" is a false positive', () => {
    const gov = runGovernance("le forfait suffit pour 500 commandes?");
    expect(gov.httpError.falsePositive).toBe(true);
    expect(gov.tag).toBe("http_false_positive");
  });
});

/* ------------------------------------------------------------------ */
/*  4. Decision Table Tags                                             */
/* ------------------------------------------------------------------ */
describe('Governance — Decision Table Tags', () => {
  it('HTTP 5xx + emotion combo gets http_5xx_emotion tag', () => {
    const gov = runGovernance("INACCEPTABLE!! erreur 500 depuis 3 jours!");
    expect(gov.tag).toBe("http_5xx_emotion");
    expect(gov.force.category).toBe("technical");
    expect(gov.force.verdict).toBe("tiktak_side");
    expect(gov.force.escalate).toBe(true);
    expect(gov.force.sentiment).toBeDefined();
  });

  it('pure emotion gets emotion tag', () => {
    const gov = runGovernance("Le support est nul, personne ne m'aide depuis 1 semaine");
    expect(gov.tag).toBe("emotion");
    // Emotion alone no longer forces category or escalation
    expect(gov.force.category).toBeUndefined();
    expect(gov.force.escalate).toBeUndefined();
    expect(gov.force.sentiment).toBeDefined();
  });

  it('pure HTTP gets http_5xx tag', () => {
    const gov = runGovernance("Le site affiche erreur 502 bad gateway");
    expect(gov.tag).toBe("http_5xx");
    expect(gov.force.category).toBe("technical");
  });

  it('site down without 5xx gets site_down tag', () => {
    const gov = runGovernance("le lien de boutique ne fonctionne pas");
    expect(gov.tag).toBe("site_down");
    expect(gov.force.category).toBe("technical");
    expect(gov.force.verdict).toBe("tiktak_side");
    expect(gov.force.escalate).toBe(true);
  });

  it('calm question gets none tag', () => {
    const gov = runGovernance("Comment ajouter un produit?");
    expect(gov.tag).toBe("none");
    expect(gov.forceEscalate).toBe(false);
  });

  it('false positive blocks HTTP tag', () => {
    const gov = runGovernance("Mon plan supporte 500 produits?");
    expect(gov.tag).toBe("http_false_positive");
    expect(gov.force.category).toBeUndefined();
    expect(gov.forceEscalate).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  5. Category Hints                                                  */
/* ------------------------------------------------------------------ */
describe('Governance — Category Hints', () => {
  it('HTTP 5xx generates technical hint', () => {
    const gov = runGovernance("erreur 500 quand j'ouvre les commandes");
    expect(gov.categoryHints.length).toBeGreaterThan(0);
    expect(gov.categoryHints[0].module).toBe("technical");
  });

  it('emotional message generates general hint', () => {
    const gov = runGovernance("c'est scandaleux ce service!");
    expect(gov.categoryHints.length).toBeGreaterThan(0);
    expect(gov.categoryHints[0].module).toBe("general");
  });

  it('billing keywords generate billing hint', () => {
    const gov = runGovernance("mon abonnement expire bientôt");
    expect(gov.categoryHints.some(h => h.module === "billing")).toBe(true);
  });

  it('auth keywords generate auth hint', () => {
    const gov = runGovernance("problème de login et mot de passe");
    expect(gov.categoryHints.some(h => h.module === "auth")).toBe(true);
  });

  it('shipping keywords generate shipping hint', () => {
    const gov = runGovernance("le colis de livraison est perdu");
    expect(gov.categoryHints.some(h => h.module === "shipping")).toBe(true);
  });

  it('orders keywords generate orders hint', () => {
    const gov = runGovernance("ma commande a été annulée sans raison");
    expect(gov.categoryHints.some(h => h.module === "orders")).toBe(true);
  });

  it('products keywords generate products hint', () => {
    const gov = runGovernance("comment ajouter un produit avec variantes");
    expect(gov.categoryHints.some(h => h.module === "products")).toBe(true);
  });

  it('inventory keywords generate inventory hint', () => {
    const gov = runGovernance("le stock est négatif dans l'inventaire");
    expect(gov.categoryHints.some(h => h.module === "inventory")).toBe(true);
  });

  it('notifications keywords generate notifications hint', () => {
    const gov = runGovernance("les notifications email ne fonctionnent pas");
    expect(gov.categoryHints.some(h => h.module === "notifications")).toBe(true);
  });

  it('customers keywords generate customers hint', () => {
    const gov = runGovernance("gestion des clients et profil client");
    expect(gov.categoryHints.some(h => h.module === "customers")).toBe(true);
  });

  it('pos keywords generate pos hint', () => {
    const gov = runGovernance("la caisse point de vente ne marche pas");
    expect(gov.categoryHints.some(h => h.module === "pos")).toBe(true);
  });

  it('builder keywords generate builder hint', () => {
    const gov = runGovernance("je veux modifier le template et le header");
    expect(gov.categoryHints.some(h => h.module === "builder")).toBe(true);
  });

  it('settings keywords generate settings hint', () => {
    const gov = runGovernance("problème de domaine et DNS du site");
    expect(gov.categoryHints.some(h => h.module === "settings")).toBe(true);
  });

  it('apps keywords generate apps hint', () => {
    const gov = runGovernance("le webhook de l'API ne fonctionne pas");
    expect(gov.categoryHints.some(h => h.module === "apps")).toBe(true);
  });

  it('payments keywords generate payments hint', () => {
    const gov = runGovernance("paiement par carte visa refusé");
    expect(gov.categoryHints.some(h => h.module === "payments")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  6. Prompt Hints                                                    */
/* ------------------------------------------------------------------ */
describe('Governance — Prompt Hints', () => {
  it('HTTP 5xx generates mandatory escalation hint', () => {
    const gov = runGovernance("erreur 500 sur mon site");
    const hints = governanceToPromptHints(gov);
    expect(hints).toContain("INCIDENT TECHNIQUE");
    expect(hints).toContain("technical");
    expect(hints).toContain("tiktak_side");
  });

  it('false positive generates no-escalation hint', () => {
    const gov = runGovernance("Le plan suffit pour 500 produits?");
    const hints = governanceToPromptHints(gov);
    expect(hints).toContain("500");
    expect(hints).toContain("escalate=false");
  });

  it('emotion generates emotion hint (no forced escalation)', () => {
    const gov = runGovernance("Remboursez-moi! C'est inacceptable!");
    const hints = governanceToPromptHints(gov);
    expect(hints).toContain("EMOTION");
    expect(hints).toContain("NE PAS escalader");
  });

  it('calm message generates empty hints', () => {
    const gov = runGovernance("Bonjour, merci pour votre aide");
    const hints = governanceToPromptHints(gov);
    expect(hints).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/*  7. Post-LLM Override (validatePostLlm)                             */
/* ------------------------------------------------------------------ */
describe('Governance — Post-LLM Override', () => {
  const baseLlm = {
    escalate: false,
    verdict: "user_side",
    category: "general",
    severity: "low",
    sentiment: "calm",
    ticket_type: "question",
  };

  it('R1: HTTP 5xx forces technical/tiktak_side/escalate', () => {
    const gov = runGovernance("erreur 500 sur le dashboard");
    const overrides = validatePostLlm(gov, { ...baseLlm, category: "orders" });
    expect(overrides.category).toBe("technical");
    expect(overrides.verdict).toBe("tiktak_side");
    expect(overrides.escalate).toBe(true);
    expect(overrides.severity).toBe("critical");
    expect(overrides.ticket_type).toBe("incident");
  });

  it('R1: site_down forces technical/tiktak_side/escalate', () => {
    const gov = runGovernance("le lien de boutique ne fonctionne pas");
    const overrides = validatePostLlm(gov, { ...baseLlm, category: "builder" });
    expect(overrides.category).toBe("technical");
    expect(overrides.verdict).toBe("tiktak_side");
    expect(overrides.escalate).toBe(true);
    expect(overrides.severity).toBe("high");
  });

  it('R2: emotion only corrects sentiment, does not force escalate', () => {
    const gov = runGovernance("Le support est nul, personne ne m'aide");
    const overrides = validatePostLlm(gov, { ...baseLlm, category: "orders" });
    // Emotion alone should NOT override category or force escalation
    expect(overrides.category).toBeUndefined();
    expect(overrides.escalate).toBeUndefined();
  });

  it('R3: false positive de-escalates', () => {
    const gov = runGovernance("Le plan suffit pour 500 produits?");
    const overrides = validatePostLlm(gov, { ...baseLlm, escalate: true });
    expect(overrides.escalate).toBe(false);
    expect(overrides.overrideReasons.some(r => r.includes("R3"))).toBe(true);
  });

  it('R4: strong emotion bumps severity', () => {
    const gov = runGovernance("Je suis furieux! Ça fait 1 semaine que rien ne fonctionne!");
    const overrides = validatePostLlm(gov, { ...baseLlm, severity: "low" });
    expect(overrides.severity).toBe("high");
  });

  it('R6: strong emotion corrects calm sentiment', () => {
    const gov = runGovernance("INACCEPTABLE! 3 jours sans réponse!");
    const overrides = validatePostLlm(gov, { ...baseLlm, sentiment: "calm" });
    expect(overrides.sentiment).toBeDefined();
    expect(overrides.sentiment).not.toBe("calm");
  });

  it('R7: category hint overrides generic LLM category', () => {
    const gov = runGovernance("problème de connexion et mot de passe");
    if (gov.categoryHints.length > 0 && gov.categoryHints[0].confidence >= 0.7) {
      const overrides = validatePostLlm(gov, { ...baseLlm, category: "general" });
      expect(overrides.category).toBe(gov.categoryHints[0].module);
    }
  });

  it('does not override when LLM is already correct for HTTP 5xx', () => {
    const gov = runGovernance("erreur 500 sur le site");
    const overrides = validatePostLlm(gov, {
      escalate: true,
      verdict: "tiktak_side",
      category: "technical",
      severity: "critical",
      sentiment: "frustrated",
      ticket_type: "incident",
    });
    // Nothing to override — LLM already correct
    expect(overrides.category).toBeUndefined();
    expect(overrides.verdict).toBeUndefined();
    expect(overrides.escalate).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  8. Failed Test Case Fixes                                          */
/* ------------------------------------------------------------------ */
describe('Governance — 14 Failed Test Case Fixes', () => {
  // --- Emotional cases: emotion detected, no forced escalation ---

  it('T0485: "Remboursez-moi immédiatement!" → emotion tag, no forced escalate', () => {
    const gov = runGovernance("Remboursez-moi immédiatement!");
    expect(gov.tag).toBe("emotion");
    // Emotion alone does NOT force category or escalation
    expect(gov.force.category).toBeUndefined();
    expect(gov.force.escalate).toBeUndefined();
    expect(gov.force.sentiment).toBeDefined();
  });

  it('T0490: "Le support est nul, personne ne m aide" → emotion tag, no forced escalate', () => {
    const gov = runGovernance("Le support est nul, personne ne m'aide");
    expect(gov.tag).toBe("emotion");
    expect(gov.force.category).toBeUndefined();
    expect(gov.force.escalate).toBeUndefined();
    expect(gov.force.sentiment).toBeDefined();
  });

  it('T0500: "Priez d intervenir très rapidement!!!" → emotion tag, no forced escalate', () => {
    const gov = runGovernance("Priez d'intervenir très rapidement!!!");
    expect(gov.tag).toBe("emotion");
    expect(gov.force.category).toBeUndefined();
    expect(gov.force.escalate).toBeUndefined();
  });

  it('T0976: "brabi 3awnouni urgent!" → emotion tag, no forced escalate', () => {
    const gov = runGovernance("brabi 3awnouni urgent!");
    expect(gov.tag).toBe("emotion");
    expect(gov.force.category).toBeUndefined();
    expect(gov.force.escalate).toBeUndefined();
  });

  it('T0989: "taw 5 jours ma jawbouni" → emotion detected, no forced escalate', () => {
    const gov = runGovernance("taw 5 jours ma jawbouni");
    expect(gov.emotion.detected).toBe(true);
    expect(gov.tag).toBe("emotion");
    expect(gov.force.category).toBeUndefined();
  });

  // --- Technical/HTTP cases: must force category=technical, escalate=true ---

  it('T0526: "el site tatla3 fih erreur 500" → technical, escalate', () => {
    const gov = runGovernance("el site tatla3 fih erreur 500 w ma n9derch nkhdm");
    expect(gov.tag).toBe("http_5xx");
    expect(gov.force.category).toBe("technical");
    expect(gov.force.verdict).toBe("tiktak_side");
    expect(gov.force.escalate).toBe(true);
    const overrides = validatePostLlm(gov, {
      escalate: false, verdict: "user_side", category: "general",
      severity: "low", sentiment: "calm", ticket_type: "question",
    });
    expect(overrides.category).toBe("technical");
    expect(overrides.verdict).toBe("tiktak_side");
    expect(overrides.escalate).toBe(true);
  });

  it('T0554: "le lien de boutique ne fonctionne pas" → technical, escalate', () => {
    const gov = runGovernance("le lien de boutique ne fonctionne pas");
    expect(gov.tag).toBe("site_down");
    expect(gov.force.category).toBe("technical");
    expect(gov.force.verdict).toBe("tiktak_side");
    expect(gov.force.escalate).toBe(true);
  });

  it('T0958: "How to fix a 500 error" → technical', () => {
    const gov = runGovernance("How to fix a 500 error on my site?");
    expect(gov.tag).toBe("http_5xx");
    expect(gov.force.category).toBe("technical");
    expect(gov.force.escalate).toBe(true);
  });

  it('T0963: "le site crash quand j ouvre la page des commandes" → technical', () => {
    const gov = runGovernance("le site crash quand j'ouvre la page des commandes");
    expect(gov.tag).toBe("site_down");
    expect(gov.force.category).toBe("technical");
    expect(gov.force.verdict).toBe("tiktak_side");
  });

  it('T0964: "slm el dashboard yodher erreur 504 gateway timeout" → technical', () => {
    const gov = runGovernance("slm el dashboard yodher erreur 504 gateway timeout");
    expect(gov.tag).toBe("http_5xx");
    expect(gov.force.category).toBe("technical");
    expect(gov.force.verdict).toBe("tiktak_side");
  });

  // --- False positive case ---

  it('T0390: "Le plan actuel suffit pour 500 produits?" → false positive, no escalate', () => {
    const gov = runGovernance("Le plan actuel suffit pour 500 produits?");
    expect(gov.tag).toBe("http_false_positive");
    expect(gov.httpError.falsePositive).toBe(true);
    expect(gov.forceEscalate).toBe(false);
    const overrides = validatePostLlm(gov, {
      escalate: true, verdict: "tiktak_side", category: "products",
      severity: "low", sentiment: "calm", ticket_type: "question",
    });
    expect(overrides.escalate).toBe(false);
  });

  // --- Billing category detection ---

  it('T0871: billing keywords detected in hints', () => {
    const gov = runGovernance("comment renouveler mon abonnement et changer de forfait?");
    expect(gov.categoryHints.some(h => h.module === "billing")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  9. Edge Cases                                                      */
/* ------------------------------------------------------------------ */
describe('Governance — Edge Cases', () => {
  it('empty message returns none tag', () => {
    const gov = runGovernance("");
    expect(gov.tag).toBe("none");
    expect(gov.emotion.detected).toBe(false);
    expect(gov.httpError.detected).toBe(false);
  });

  it('very long message does not crash', () => {
    const longMsg = "erreur 500 ".repeat(200);
    const gov = runGovernance(longMsg);
    expect(gov.tag).toBe("http_5xx");
  });

  it('mixed case HTTP error detection', () => {
    const gov = runGovernance("ERREUR 500 GATEWAY TIMEOUT!!");
    expect(gov.httpError.detected).toBe(true);
  });

  it('persistence score for multiple days', () => {
    const gov = runGovernance("ça fait 10 jours que personne ne répond");
    expect(gov.persistenceScore).toBeGreaterThanOrEqual(4);
  });

  it('severity detection for site down', () => {
    const gov = runGovernance("mon site est down, impossible de vendre!");
    expect(gov.severityScore).toBeGreaterThanOrEqual(4);
  });

  it('HTTP 5xx takes priority over emotion for category', () => {
    const gov = runGovernance("INACCEPTABLE! erreur 500 sur mon site, je suis furieux!");
    expect(gov.tag).toBe("http_5xx_emotion");
    expect(gov.force.category).toBe("technical");
    // emotion is still detected, just doesn't override category
    expect(gov.emotion.detected).toBe(true);
  });
});
