// Deterministic-first decision engine for TikTak PRO support worker.
// Goal: reduce over-clarify loops, fix ticket_type collapse, and make governance authoritative.

import type { ExtractedEntities, GovernanceSignals, Playbook, PlaybookStep, ChatState } from "./types";

export type GovTag = "http_5xx" | "site_down" | "emotion" | "http_false_positive" | "none";
export type TicketType = "bug" | "question" | "demand" | "incident";
export type Mode = "solve" | "clarify" | "escalate";
export type Verdict = "user_side" | "tiktak_side" | "unclear";
export type Severity = "low" | "medium" | "high" | "critical";

export type Decision = {
  govTag: GovTag;
  // Soft suggestion
  category: string;
  ticket_type: TicketType;
  severity: Severity;
  verdict: Verdict;
  mode: Mode;
  escalate: boolean;
  required_missing: string[];
  ask: string[]; // 1–2 questions max (only for clarify)
  forced: Partial<{
    category: string;
    ticket_type: TicketType;
    severity: Severity;
    verdict: Verdict;
    mode: Mode;
    escalate: boolean;
  }>;
};

type Inputs = {
  message: string;
  preferredModule: string;
  keywordScore: number;
  governance?: GovernanceSignals;
  entities?: ExtractedEntities;
};

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));

function detectGovTag(governance?: GovernanceSignals): GovTag {
  if (!governance) return "none";
  // Your governance.ts produces tags; keep it robust to different shapes.
  const tags: string[] = Array.isArray((governance as any).tags) ? (governance as any).tags
    : Array.isArray((governance as any).matched) ? (governance as any).matched
    : [];
  const has = (t: string) => tags.includes(t);

  if (has("http_false_positive")) return "http_false_positive";
  if (has("http_5xx")) return "http_5xx";
  if (has("site_down")) return "site_down";
  if (has("emotion")) return "emotion";

  // fallback: some governance implementations expose boolean flags
  if ((governance as any).http5xx === true) return "http_5xx";
  if ((governance as any).siteDown === true) return "site_down";
  if ((governance as any).emotion === true) return "emotion";

  return "none";
}

function scoreTicketType(message: string) {
  const m = message.toLowerCase();

  const incidentPats = [
    /\b(5\d{2}|500|502|503|504)\b/,
    /service unavailable/i,
    /\b(site|dashboard|api)\b.*\b(down|panne|hs|hors service|indisponible)\b/i,
    /\b(impossible|bloqu[eé])\b.*\b(travailler|commander|payer|acc[eè]s)\b/i,
    /\b(depuis (ce matin|aujourd['’]hui))\b/i,
  ];

  const bugPats = [
    /\b(ne s['’]affiche pas|n['’]affiche pas|affiche pas)\b/i,
    /\b(ne se synchronise plus|synchronise plus)\b/i,
    /\b(en double|doublon)\b/i,
    /\b(erreur)\b/i,
    /\b(ne marche pas|marche pas|fonctionne pas)\b/i,
    /\b(page blanche)\b/i,
  ];

  const demandPats = [
    /\b(je veux|merci de|ajouter|activer|installer|renouveler|changer)\b/i,
    /\b(abonnement|pack|facture|paiement)\b.*\b(renouveler|upgrade|changer)\b/i,
  ];

  const questionPats = [
    /\b(comment|c['’]est quoi|où|est-ce possible|possible)\b/i,
    /\b(tuto|how to)\b/i,
  ];

  let S_incident = 0, S_bug = 0, S_demand = 0, S_question = 0;
  for (const p of incidentPats) if (p.test(message)) S_incident += 5;
  for (const p of bugPats) if (p.test(message)) S_bug += 3;
  for (const p of demandPats) if (p.test(message)) S_demand += 2;
  for (const p of questionPats) if (p.test(message)) S_question += 2;

  return { S_incident, S_bug, S_demand, S_question };
}

function requiredEntitiesFor(module: string): string[] {
  switch (module) {
    case "orders": return ["order_id_or_status"];
    case "settings": return ["domain_or_error"];
    case "shipping": return ["carrier_or_order"];
    case "payments": return ["provider_and_error"];
    case "billing": return ["plan_or_invoice"];
    case "products": return ["product_or_sku"];
    case "builder": return ["page_or_url"];
    case "auth": return ["phone_or_email"];
    case "inventory": return ["product_or_sku"];
    default: return [];
  }
}

function missingRequired(required: string[], entities?: ExtractedEntities, message?: string): string[] {
  const m = (message || "").toLowerCase();
  const miss: string[] = [];
  for (const r of required) {
    if (r === "order_id_or_status") {
      const ok = Boolean(entities?.order_id) || /\b#?\d{4,}\b/.test(m) || /\b(statut|livr[eé]e|annul[eé]e|en attente)\b/i.test(m);
      if (!ok) miss.push("order_id");
    } else if (r === "domain_or_error") {
      const ok = Boolean(entities?.domain) || Boolean(entities?.error_message) || /\b\.tn\b|\bDNS\b|\bSSL\b/i.test(m);
      if (!ok) miss.push("domain");
    } else if (r === "carrier_or_order") {
      const ok = Boolean(entities?.carrier) || Boolean(entities?.order_id) || /\b(aramex|rapid|livreur|transporteur)\b/i.test(m);
      if (!ok) miss.push("carrier");
    } else if (r === "provider_and_error") {
      const ok = Boolean(entities?.payment_method) || Boolean(entities?.error_message) || /\b(konnect|stripe|paypal|e-?dinar)\b/i.test(m);
      if (!ok) miss.push("payment_details");
    } else if (r === "plan_or_invoice") {
      const ok = /\b(abonnement|pack|facture)\b/i.test(m);
      if (!ok) miss.push("billing_details");
    } else if (r === "product_or_sku") {
      const ok = Boolean(entities?.sku_or_product) || /\b(sku|variante|produit)\b/i.test(m);
      if (!ok) miss.push("product");
    } else if (r === "page_or_url") {
      const ok = Boolean(entities?.url) || /\b(page|site|landing|home|menu)\b/i.test(m);
      if (!ok) miss.push("page");
    } else if (r === "phone_or_email") {
      const ok = /\b(otp|code|connexion|login)\b/i.test(m);
      if (!ok) miss.push("auth_details");
    }
  }
  return miss;
}

function defaultClarifyQuestions(module: string): string[] {
  switch (module) {
    case "orders": return ["Quel est le numéro de commande (ou le statut exact) ?", "Qu’est-ce que tu vois comme message / statut dans TikTak ?"];
    case "settings": return ["Quel est le domaine exact (.tn…) ?", "Quel message exact s’affiche (SSL, introuvable, etc.) ?"];
    case "shipping": return ["Quel transporteur (ex: Aramex) et quel numéro de commande/colis ?", "Le souci est sur les frais, le statut ou la sync ?"];
    case "payments": return ["Quel moyen de paiement (Konnect/Stripe/PayPal…) ?", "Quel message d’erreur exact au checkout ?"];
    case "products": return ["Quel produit (nom/SKU) et que se passe-t-il exactement ?", "Tu peux partager le message d’erreur ou une capture ?"];
    case "builder": return ["Quelle page/URL est concernée ?", "C’est verrouillé, blanc, ou erreur ?"];
    case "auth": return ["Tu ne reçois pas le code OTP ou il est invalide ?", "Quel numéro/email et depuis quand ?"];
    default: return ["Sur quelle page et quel message exact vois-tu ?", "Depuis quand et est-ce intermittent ?"];
  }
}

export function runDecisionEngine(input: Inputs): Decision {
  const { message, preferredModule, keywordScore, governance, entities } = input;

  const govTag = detectGovTag(governance);

  // Governance authoritative decisions
  const forced: Decision["forced"] = {};
  if (govTag === "http_5xx") {
    forced.category = "technical";
    forced.ticket_type = "incident";
    forced.severity = "critical";
    forced.verdict = "tiktak_side";
    forced.mode = "escalate";
    forced.escalate = true;
  } else if (govTag === "site_down") {
    forced.category = "technical";
    forced.ticket_type = "incident";
    forced.severity = "high";
    forced.verdict = "tiktak_side";
    forced.mode = "escalate";
    forced.escalate = true;
  } else if (govTag === "emotion") {
    forced.ticket_type = "question";
    forced.severity = "high";
    forced.verdict = "tiktak_side";
    forced.mode = "escalate";
    forced.escalate = true;
  } else if (govTag === "http_false_positive") {
    forced.escalate = false; // hard de-escalation
  }

  // Ticket type heuristic
  const s = scoreTicketType(message);
  let ticket_type: TicketType = "question";
  if (s.S_incident >= 5) ticket_type = "incident";
  else if (s.S_bug >= 3) ticket_type = "bug";
  else if (s.S_demand >= 2) ticket_type = "demand";
  else if (s.S_question >= 2) ticket_type = "question";

  // Category: prefer provided preferredModule
  const category = preferredModule || "general";

  // Severity baseline
  let severity: Severity = ticket_type === "incident" ? "high" : ticket_type === "bug" ? "medium" : "low";
  if (ticket_type === "incident" && /\b(500|502|503|504)\b/.test(message)) severity = "critical";

  // Verdict baseline
  let verdict: Verdict = "user_side";
  if (ticket_type === "incident") verdict = "tiktak_side";
  else if (ticket_type === "bug") verdict = "unclear";

  // Required entities -> clarify
  const req = requiredEntitiesFor(category);
  const missing = missingRequired(req, entities, message);

  let mode: Mode = "solve";
  if (missing.length > 0) mode = "clarify";

  // Escalate baseline (non-governance): only for incident-like cases
  let escalate = ticket_type === "incident";

  // Apply forced overrides
  if (forced.category) { /* no-op */ }
  if (forced.ticket_type) ticket_type = forced.ticket_type;
  if (forced.severity) severity = forced.severity;
  if (forced.verdict) verdict = forced.verdict;
  if (typeof forced.escalate === "boolean") escalate = forced.escalate;
  if (forced.mode) mode = forced.mode;

  // If forced escalate -> ignore missing entities
  const required_missing = (mode === "clarify" && !escalate) ? missing : [];

  const ask = (mode === "clarify" && required_missing.length > 0)
    ? defaultClarifyQuestions(category).slice(0, 2)
    : [];

  // Final consistency
  if (escalate) mode = "escalate";
  if (mode === "escalate") verdict = "tiktak_side";

  return {
    govTag,
    category,
    ticket_type,
    severity,
    verdict,
    mode,
    escalate,
    required_missing,
    ask,
    forced,
  };
}


/* ----------------------------- v7: Deterministic playbook + step selection ----------------------------- */

export type SelectedPlaybookStep = {
  playbook_id: string | null;
  step_id: string | null;
  step: PlaybookStep | null;
  reason: string;
  missing_required: string[];
};

function normalizeKeyV7(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

function requiredKeysV7(pb?: Playbook | null): string[] {
  if (!pb?.required_fields) return [];
  const keys: string[] = [];
  for (const rf of pb.required_fields as any[]) {
    if (!rf) continue;
    if (typeof rf === "string") continue;
    if (rf.key) keys.push(rf.key);
  }
  return keys;
}

function computeMissingV7(keys: string[], entities: any): string[] {
  const e = entities || {};
  const missing: string[] = [];
  for (const k of keys) {
    const nk = normalizeKeyV7(k);
    const v = (e as any)[nk] ?? (e as any)[k];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) missing.push(k);
  }
  return missing;
}

export function selectPlaybookAndStep(args: {
  preferredModule: string;
  extracted?: { module?: string; intent_code?: string };
  entities?: any;
  pbCtx?: { playbooks?: Array<{ playbook_id: string; playbook: Playbook; score: number; module: string }> };
  state?: ChatState;
}): SelectedPlaybookStep {
  const playbooks = args.pbCtx?.playbooks || [];
  const pref = (args.extracted?.module || args.preferredModule || "general").toLowerCase();

  if (!playbooks.length) {
    return { playbook_id: null, step_id: null, step: null, reason: "no_playbooks_retrieved", missing_required: [] };
  }

  // 1) Continue active playbook if present
  const activeId = args.state?.active_playbook_id || null;
  let chosen: (typeof playbooks)[number] | null = activeId ? (playbooks.find(p => p.playbook_id === activeId) || null) : null;

  // 2) Otherwise pick best by deterministic score (module boost)
  if (!chosen) {
    const scored = playbooks.map(p => {
      let s = p.score || 0;
      const mod = (p.module || "").toLowerCase();
      if (mod && pref && mod === pref) s *= 1.25;
      return { ...p, _s: s } as any;
    }).sort((a,b)=> (b._s||0)-(a._s||0));
    chosen = scored[0] || null;
  }

  if (!chosen) {
    return { playbook_id: null, step_id: null, step: null, reason: "no_playbook_selected", missing_required: [] };
  }

  const pb = chosen.playbook;
  const keys = requiredKeysV7(pb);
  const missing = computeMissingV7(keys, args.entities);

  // A) missing required -> ask step collecting that field, else first ask
  if (missing.length > 0) {
    const want = normalizeKeyV7(missing[0]);
    const ask = (pb.steps || []).find(s => s.kind === "ask" && normalizeKeyV7((s as any).field || "") === want)
      || (pb.steps || []).find(s => s.kind === "ask")
      || null;
    return {
      playbook_id: chosen.playbook_id,
      step_id: (ask as any)?.step_id || null,
      step: ask as any,
      reason: "missing_required_fields",
      missing_required: missing,
    };
  }

  // B) advance by state step id if possible
  const activeStepId = args.state?.active_step_id || null;
  if (activeStepId) {
    const idx = (pb.steps || []).findIndex(s => (s as any).step_id === activeStepId);
    const next = idx >= 0 ? (pb.steps[idx + 1] || null) : null;
    if (next) {
      return { playbook_id: chosen.playbook_id, step_id: (next as any).step_id || null, step: next as any, reason: "advance_step", missing_required: [] };
    }
  }

  // C) first solve
  const solve = (pb.steps || []).find(s => s.kind === "solve") || null;
  if (solve) {
    return { playbook_id: chosen.playbook_id, step_id: (solve as any).step_id || null, step: solve as any, reason: "first_solve", missing_required: [] };
  }

  // D) fallback escalate
  const esc = (pb.steps || []).find(s => s.kind === "escalate") || null;
  return { playbook_id: chosen.playbook_id, step_id: (esc as any)?.step_id || null, step: esc as any, reason: "fallback_escalate", missing_required: [] };
}
