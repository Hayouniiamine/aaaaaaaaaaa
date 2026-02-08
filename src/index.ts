export interface Env {
  AI: Ai;
  TIKTAK_KB: VectorizeIndex;
  TIKTAK_PLAYBOOKS: VectorizeIndex;
  TIKTAK_DOCS: R2Bucket;
  INTERNAL_SHARED_SECRET: string;
}

type AiModelKey = Parameters<Ai["run"]>[0];
const EMBED_MODEL: AiModelKey = "@cf/baai/bge-m3" as AiModelKey;
const CHAT_MODEL: AiModelKey = "@cf/meta/llama-3-8b-instruct" as AiModelKey;

type Role = "user" | "assistant";
type HistoryMsg = { role: Role; content: string };

type DocChunk = {
  tenant_id: string;
  kind: "doc";
  doc_id: string;
  chunk_id: string;
  module: string;
  title: string;
  text: string;
  source: string;
};

type PlaybookStep =
  | { kind: "ask"; title?: string; question: string }
  | { kind: "solve"; title?: string; condition?: string; response: string; actions?: string[] }
  | { kind: "escalate"; title?: string; condition?: string; reason: string };

type Playbook = {
  id: string;
  scope?: string;
  title?: string;
  triggers?: string[];
  description?: string;
  steps: PlaybookStep[];
};

type PlaybookIngestItem = {
  tenant_id: string;
  kind: "playbook";
  playbook_id: string;
  module: string;
  title: string;
  text: string; // for embeddings
  playbook: Playbook; // stored in R2
  source: string;
};

/* ----------------------------- CORS ----------------------------- */

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "*";
  // If you want to lock it down, replace "*" with "http://localhost:3000" + prod domain(s)
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-internal-secret",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(req),
    },
  });
}


// --------------------------------------------------
// Normalize Worker /chat responses to a stable schema
// expected by Django + Nuxt (PFE / Sidekick-ready)
// --------------------------------------------------
function normalizeSupportResponse(raw: any) {
  const mode = (raw?.mode ?? "clarify") as string;
  const confidence = Number(raw?.confidence ?? raw?.signals?.confidence ?? 0);
  const context = (raw?.context ?? "general") as string;

  const ui = raw?.ui ?? null;
  const actions = Array.isArray(raw?.actions) ? raw.actions : [];

  const questions: string[] = Array.isArray(raw?.questions) ? raw.questions.map((q: any) => String(q)) : [];

  let answer = typeof raw?.answer === "string" ? raw.answer : "";
  if (!answer && questions.length) {
    const cleaned = questions.map((q) => q.trim()).filter(Boolean);
    if (cleaned.length) answer = "J’ai besoin de préciser :\n- " + cleaned.join("\n- ");
  }
  if (!answer && mode === "escalate") {
    answer = "Je vais escalader ce problème à l’équipe support TikTak PRO.";
  }

  // Incident flag: keep conservative (true only for explicit incident categories or upstream failures)
  const cat = String(raw?.category ?? "").toLowerCase();
  const incidentCategory = ["incident", "outage", "api_down", "backend_error", "permission_issue", "bug_confirmed"].includes(cat);
  const incident = Boolean(raw?.signals?.incident ?? incidentCategory);

  const out: any = {
    mode,
    answer,
    signals: {
      confidence: Number(confidence.toFixed(2)),
      incident,
    },
    context,
    ui,
    actions,
  };

  // passthrough useful fields if present
  if (raw?.playbook_id) out.playbook_id = raw.playbook_id;
  if (raw?.category) out.category = raw.category;
  if (raw?.reason) out.reason = raw.reason;
  if (raw?.evidence) out.evidence = raw.evidence;

  return out;
}

function chatJson(req: Request, raw: any, status = 200) {
  return json(req, normalizeSupportResponse(raw), status);
}

function text(req: Request, body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...corsHeaders(req),
    },
  });
}

function preflight(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req),
  });
}

/* ----------------------------- Utils ----------------------------- */

async function safeReadJson(req: Request): Promise<unknown | null> {
  const raw = await req.text();
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalize(s: string) {
  return String(s || "").toLowerCase().trim();
}

function isGreetingOnly(text: string) {
  const t = normalize(text);
  const greetings = [
    "salut",
    "slt",
    "sl",
    "slm",
    "bonjour",
    "bonsoir",
    "bojour",
    "bjr",
    "hi",
    "hello",
    "aslema",
    "ahla",
    "ahlan",
    "عسلامة",
  ];
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length > 4) return false;
  return greetings.some((g) => t === g || t.startsWith(g + " "));
}

function isThanksOnly(text: string) {
  const t = normalize(text);
  const thanks = ["merci", "thanks", "thx", "merci beaucoup", "شكرا", "ty"];
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length > 6) return false;
  return thanks.some((k) => t === k || t.startsWith(k + " "));
}

function sanitizeUserText(s: string) {
  const t = String(s || "").replace(/\r/g, "").trim();
  if (t.length > 2000) return t.slice(-1200).trim();
  return t;
}

function coerceHistory(raw: unknown): HistoryMsg[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryMsg[] = [];
  for (const it of raw) {
    const role = (it as any)?.role;
    const content = (it as any)?.content;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      out.push({ role, content: content.trim() });
    }
  }
  return out;
}

/**
 * FIXED: DNS age extraction prioritizes the most recent mention.
 */
function extractDnsAgeHours(message: string, history: HistoryMsg[]): number | null {
  const sources = [message, ...history.slice().reverse().map((h) => h.content)];

  const parseOne = (txt: string): number | null => {
    const t = String(txt || "").toLowerCase();

    // hours
    let m =
      t.match(/(?:il y a|après|depuis)\s+(\d{1,3})\s*(h|heures?|hours?)/i) ||
      t.match(/\b(\d{1,3})\s*(h|heures?|hours?)\b/i);
    if (m) return Number(m[1]);

    // days
    m =
      t.match(/(?:il y a|après|depuis)\s+(\d{1,3})\s*(j|jours?|days?)/i) ||
      t.match(/\b(\d{1,3})\s*(j|jours?|days?)\b/i);
    if (m) return Number(m[1]) * 24;

    if (t.includes("aujourd") || t.includes("today")) return null;
    return null;
  };

  for (const s of sources) {
    const v = parseOne(s);
    if (typeof v === "number" && !Number.isNaN(v)) return v;
  }
  return null;
}

function detectCloudflare(message: string, history: HistoryMsg[]) {
  const all = [message, ...history.map((h) => h.content)].join(" ").toLowerCase();
  return all.includes("cloudflare");
}

/**
 * Decide escalation after >=72h only if user confirmed checks.
 */
function dnsChecksComplete(message: string, history: HistoryMsg[]) {
  const all = [message, ...history.map((h) => h.content)].join(" ").toLowerCase();

  const saidChecked =
    /(j'?ai|jai)\s+(déjà\s+)?(verifi|vérifi|check|contr[ôo]l[ée]|confirm)/.test(all) ||
    all.includes("tout est correct") ||
    all.includes("tout est ok") ||
    all.includes("j'ai tout vérifié") ||
    all.includes("checks ok");

  const mentionsA =
    all.includes("a record") ||
    all.includes("enregistrement a") ||
    all.includes("type: a") ||
    all.includes("type a") ||
    all.includes("102.211.211.10") ||
    all.includes("@") ||
    all.includes("www");

  const mentionsNs =
    all.includes("nameserver") ||
    all.includes("name server") ||
    all.includes("serveur dns") ||
    all.includes("serveurs dns") ||
    /\bns\d?\b/.test(all);

  const mentionsWhatsmydns = all.includes("whatsmydns") || all.includes("dnschecker") || all.includes("dns checker");

  let score = 0;
  if (saidChecked) score++;
  if (mentionsA) score++;
  if (mentionsNs) score++;
  if (mentionsWhatsmydns) score++;
  return score >= 2;
}

function evalCondition(cond: string | undefined, vars: { dnsAgeHours: number | null; cloudflare: boolean }): boolean {
  if (!cond) return true;
  const c = normalize(cond);

  if (c.includes("cloudflare_detected")) return vars.cloudflare;

  const lt = c.match(/dns_age\s*<\s*(\d+)\s*h/);
  if (lt) {
    if (vars.dnsAgeHours == null) return false;
    return vars.dnsAgeHours < Number(lt[1]);
  }

  const gte = c.match(/dns_age\s*>=\s*(\d+)\s*h/);
  if (gte) {
    if (vars.dnsAgeHours == null) return false;
    return vars.dnsAgeHours >= Number(gte[1]);
  }

  return false;
}

/* ----------------------------- Playbook runner ----------------------------- */

function runPlaybook(pb: Playbook, message: string, history: HistoryMsg[]) {
  const vars = {
    dnsAgeHours: extractDnsAgeHours(message, history),
    cloudflare: detectCloudflare(message, history),
    dnsChecksComplete: dnsChecksComplete(message, history),
  };

  const isDomains = pb.scope === "domains" || pb.id.includes("domains") || pb.id.includes("domain");

  const mentionsDnsAge = pb.steps.some(
    (s) =>
      (s.kind === "solve" || s.kind === "escalate") &&
      typeof (s as any).condition === "string" &&
      normalize((s as any).condition).includes("dns_age")
  );

  if (isDomains && mentionsDnsAge && vars.dnsAgeHours == null) {
    return {
      mode: "clarify" as const,
      confidence: 0.82,
      context: pb.scope ?? "general",
      questions: ["Vous avez modifié les DNS quand exactement ? (aujourd'hui / hier / il y a X heures / +24h)"],
      reason: "need_dns_age",
      playbook_id: pb.id,
    };
  }

  // Domains are logic-only keys
  if (isDomains && vars.dnsAgeHours != null) {
    if (vars.dnsAgeHours < 24) {
      return {
        mode: "solve" as const,
        confidence: 0.9,
        context: "domains",
        answer: "__KEY__DNS_LT24H__",
        actions: ["check_dns_propagation"],
        playbook_id: pb.id,
      };
    }

    if (vars.dnsAgeHours >= 24 && vars.dnsAgeHours < 72) {
      return {
        mode: "solve" as const,
        confidence: 0.9,
        context: "domains",
        answer: "__KEY__DNS_GTE24H_CHECK__",
        actions: ["verify_dns_records", "verify_nameservers"],
        playbook_id: pb.id,
      };
    }

    if (vars.dnsAgeHours >= 72 && vars.dnsChecksComplete) {
      return {
        mode: "solve" as const,
        confidence: 0.9,
        context: "domains",
        answer: "__KEY__DNS_ESCALATE__",
        actions: ["collect_dns_screenshots", "open_support_ticket"],
        playbook_id: pb.id,
      };
    }

    return {
      mode: "solve" as const,
      confidence: 0.9,
      context: "domains",
      answer: "__KEY__DNS_GTE24H_CHECK__",
      actions: ["verify_dns_records", "verify_nameservers"],
      playbook_id: pb.id,
    };
  }

  // non-domains: same as before
  for (const step of pb.steps) {
    if (step.kind === "solve" && evalCondition(step.condition, vars)) {
      return {
        mode: "solve" as const,
        confidence: 0.9,
        context: pb.scope ?? "general",
        answer: step.response,
        actions: step.actions ?? [],
        playbook_id: pb.id,
      };
    }
  }

  for (const step of pb.steps) {
    if (step.kind === "escalate" && evalCondition(step.condition, vars)) {
      return {
        mode: "escalate" as const,
        confidence: 0.75,
        context: pb.scope ?? "general",
        category: "playbook_escalation",
        reason: step.reason,
        playbook_id: pb.id,
      };
    }
  }

  for (const step of pb.steps) {
    if (step.kind === "ask") {
      return {
        mode: "clarify" as const,
        confidence: 0.8,
        context: pb.scope ?? "general",
        questions: [step.question],
        playbook_id: pb.id,
      };
    }
  }

  return {
    mode: "clarify" as const,
    confidence: 0.6,
    context: pb.scope ?? "general",
    questions: ["Pouvez-vous préciser ce que vous voyez exactement (message, écran, URL) ?"],
    reason: "no_step_matched",
    playbook_id: pb.id,
  };
}

/* ----------------------------- Embeddings + R2 helpers ----------------------------- */

async function embedText(env: Env, text: string) {
  const out = (await env.AI.run(EMBED_MODEL, { text })) as any;
  return out?.data?.[0] ?? out?.response?.[0] ?? null;
}

function getMetaString(meta: any, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" ? v : null;
}

/* ---------------- Response Mapper (Playbook -> Natural Answer) ---------------- */

type ChatOut =
  | { mode: "solve"; confidence: number; context: string; answer: string; actions?: string[]; playbook_id?: string }
  | { mode: "clarify"; confidence: number; context: string; questions: string[]; reason?: string; playbook_id?: string }
  | { mode: "escalate"; confidence: number; context: string; category: string; reason: string; r2_key?: string; playbook_id?: string };

function isKeyedAnswer(answer: string) {
  const a = String(answer || "").trim();
  return a.startsWith("__KEY__") && a.endsWith("__");
}

function looksLikeTestAnswer(answer: string) {
  const a = String(answer || "");
  return a.includes("PROBE_OK") || a.includes("Action:") || a.includes("branch executed");
}

async function fetchTopDocsText(env: Env, docsVec: any, preferModule?: string) {
  try {
    const kbRes = await env.TIKTAK_KB.query(docsVec, { topK: 4 });
    const matches: any[] = Array.isArray((kbRes as any)?.matches) ? (kbRes as any).matches : [];
    if (!matches.length) return "";

    const pick = (m: any) => {
      const mod = typeof m?.metadata?.module === "string" ? m.metadata.module : "";
      if (preferModule && mod === preferModule) return true;
      if (preferModule && mod.includes(preferModule)) return true;
      return false;
    };

    const ordered = [...matches.filter(pick), ...matches.filter((m) => !pick(m))].slice(0, 2);

    const texts: string[] = [];
    for (const m of ordered) {
      const r2Key = getMetaString(m.metadata, "r2_key");
      if (!r2Key) continue;
      const obj = await env.TIKTAK_DOCS.get(r2Key);
      if (!obj) continue;
      const chunk = JSON.parse(await obj.text());
      const t = String(chunk?.text ?? "").trim();
      if (t) texts.push(t);
    }

    return texts.join("\n\n---\n\n").slice(0, 4500);
  } catch {
    return "";
  }
}

function containsForbiddenDnsWaitLanguage(s: string): boolean {
  const t = normalize(s);
  return (
    t.includes("attend") ||
    t.includes("patien") ||
    t.includes("propagat") ||
    t.includes("encore en cours") ||
    t.includes("24-48") ||
    t.includes("24 – 48") ||
    t.includes("24 à 48") ||
    t.includes("48h") ||
    t.includes("24h") ||
    t.includes("ttl") ||
    t.includes("cache")
  );
}

function deterministicDnsAnswer(key: string): string {
  if (key === "__KEY__DNS_GTE24H_CHECK__") {
    return [
      "• Vérifiez @ : Type A → 102.211.211.10",
      "• Vérifiez www : Type A → 102.211.211.10 (ou CNAME www → @), sans doublon/conflit",
      "• Vérifiez les nameservers (NS) : exactement ceux de votre provider DNS choisi",
      "• Testez @ et www sur WhatsMyDNS (Type A) et comparez avec votre zone DNS",
      "",
      "Pouvez-vous envoyer une capture des DNS (@, www, NS) ?",
    ].join("\n");
  }
  if (key === "__KEY__DNS_ESCALATE__") {
    return [
      "Pour escalader efficacement, j’ai besoin de :",
      "• Le domaine exact",
      "• Captures DNS : @, www, NS (dans votre registrar / DNS provider)",
      "• Heure du dernier changement",
      "• Capture WhatsMyDNS (Type A) pour @ et www",
      "• Provider DNS / Cloudflare : oui/non",
      "",
      "Quel est le domaine concerné ?",
    ].join("\n");
  }
  return [
    "• Vérifiez @ : Type A → 102.211.211.10",
    "• Vérifiez www : Type A → 102.211.211.10 (ou CNAME www → @)",
    "• Testez @ et www sur WhatsMyDNS (Type A)",
    "",
    "Vous confirmez que @ et www pointent bien vers 102.211.211.10 ?",
  ].join("\n");
}

async function mapPlaybookOutputToNaturalAnswer(
  env: Env,
  out: ChatOut,
  message: string,
  history: HistoryMsg[],
  docsVec: any
): Promise<ChatOut> {
  if (out.mode !== "solve") return out;

  const shouldMap = isKeyedAnswer(out.answer) || looksLikeTestAnswer(out.answer);
  if (!shouldMap) return out;

  const kb = await fetchTopDocsText(env, docsVec, out.context);
  const dnsAgeHours = extractDnsAgeHours(message, history);
  const checksOk = dnsChecksComplete(message, history);

  let effectiveKey = String(out.answer || "").trim();

  if (!isKeyedAnswer(effectiveKey) && looksLikeTestAnswer(effectiveKey)) {
    if (dnsAgeHours != null && dnsAgeHours < 24) effectiveKey = "__KEY__DNS_LT24H__";
    else if (dnsAgeHours != null && dnsAgeHours >= 72 && checksOk) effectiveKey = "__KEY__DNS_ESCALATE__";
    else effectiveKey = "__KEY__DNS_GTE24H_CHECK__";
  }

  let intent = "";
  if (effectiveKey === "__KEY__DNS_LT24H__") {
    intent =
      "Client <24h. Rassurer propagation 24–48h. Donner 3 actions: vérifier @/www, vérifier IP, vérifier propagation WhatsMyDNS. Finir par 1 question: 'Vous avez mis @ et www en Type A vers 102.211.211.10 ?'.";
  } else if (effectiveKey === "__KEY__DNS_GTE24H_CHECK__") {
    intent =
      "Client >=24h. RÈGLE ABSOLUE: INTERDIT d'évoquer attente/propagation/24–48h/encore en cours/TTL/cache. " +
      "Donner checklist: (1) @ Type A -> 102.211.211.10, (2) www: Type A ou CNAME selon doc (pas de conflit), " +
      "(3) nameservers = ceux du provider choisi, (4) test WhatsMyDNS pour @ et www. " +
      "Finir par 1 question: 'Pouvez-vous envoyer une capture des DNS (@, www, NS) ?'.";
  } else if (effectiveKey === "__KEY__DNS_ESCALATE__") {
    intent =
      "Client >72h ET checks confirmés. RÈGLE ABSOLUE: pas d'attente/propagation. " +
      "Demander exactement: domaine, captures DNS (@, www, NS), heure du changement, résultat WhatsMyDNS, provider DNS/Cloudflare (oui/non).";
  } else {
    return out;
  }

  const systemPrompt = [
    "Tu es un agent support TikTak Pro.",
    "Réponds en français, ton professionnel, direct.",
    "",
    "RÈGLE ABSOLUE DNS :",
    "- Si dnsAgeHours >= 24 :",
    "  ❌ INTERDIT de parler de propagation ou d'attente",
    "  ❌ INTERDIT de dire 24h, 48h, 'encore en cours', TTL, cache, patienter",
    "  ✅ Uniquement checklist technique OU escalade",
    "- Si dnsAgeHours >= 72 et checksOk=true : escalade au lieu de répéter la checklist",
    "",
    "INTERDIT:",
    "- Re-saluer ('Bonjour !')",
    "- 'je comprends', 'désolé', 'je suis là', blabla",
    "- 'ticket' / 'merci pour votre ticket'",
    "- texte de test: PROBE_OK, 'branch executed', 'Action:'",
    "",
    "FORMAT : 4–6 lignes max + UNE seule question finale.",
    "N'invente pas : si KB vide, reste concret et générique.",
  ].join("\n");

  const llm = (await env.AI.run(CHAT_MODEL, {
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          `Message client: ${message}`,
          `dnsAgeHours: ${dnsAgeHours ?? "unknown"}`,
          `checksOk: ${checksOk ? "true" : "false"}`,
          "",
          "Objectif EXACT (à respecter):",
          intent,
          "",
          "Documentation interne (peut être vide) :",
          kb || "(vide)",
        ].join("\n"),
      },
    ],
    max_tokens: 260,
  })) as any;

  let answer = String(llm?.response ?? llm ?? "").trim() || out.answer;

  // Last line of defense after 24h
  if (dnsAgeHours != null && dnsAgeHours >= 24) {
    if (containsForbiddenDnsWaitLanguage(answer)) {
      answer = deterministicDnsAnswer(effectiveKey);
    }
  }

  return { ...out, answer };
}

/* ------------------------------------------------------------------------------------ */

function isProbePlaybookMatch(m: any): boolean {
  const id = String(m?.id ?? "");
  const title = String(m?.metadata?.title ?? "");
  return id.startsWith("probe_playbook_") || title.toUpperCase().includes("PROBE");
}

/**
 * ✅ Domains detection for "force playbook" when dnsAgeHours is present.
 * This fixes your exact case: score 0.455 would have skipped playbooks before.
 */
function pickDomainsPlaybook(matches: any[]): any | null {
  if (!Array.isArray(matches) || matches.length === 0) return null;

  const domains = matches.filter((m) => {
    const id = String(m?.id ?? "");
    const mod = String(m?.metadata?.module ?? "");
    const title = String(m?.metadata?.title ?? "");
    return mod === "domains" || id.includes("domains") || title.toLowerCase().includes("domaine");
  });

  return domains[0] ?? null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") return preflight(req);

    if (url.pathname === "/health") {
      return json(req, {
        ok: true,
        bindings: {
          ai: !!env.AI,
          docs_kb: !!env.TIKTAK_KB,
          playbooks: !!env.TIKTAK_PLAYBOOKS,
          r2: !!env.TIKTAK_DOCS,
        },
      });
    }

    // ---------- ADMIN INGEST ---------- (FRAGILE: DO NOT TOUCH)
    if (url.pathname === "/admin/ingest" && req.method === "POST") {
      const secret = req.headers.get("x-internal-secret");
      if (!secret || secret !== env.INTERNAL_SHARED_SECRET) return json(req, { error: "unauthorized" }, 401);

      const body = (await safeReadJson(req)) as any;
      const kind = body?.kind as "docs" | "playbooks" | undefined;
      const items = Array.isArray(body?.items) ? (body.items as any[]) : [];

      if (!kind || !items.length) return json(req, { error: "kind + items[] required" }, 400);

      const upserts: any[] = [];
      let stored = 0;

      for (const it of items) {
        if (kind === "docs") {
          const c = it as DocChunk;
          if (!c?.text || !c?.doc_id || !c?.chunk_id || !c?.tenant_id) continue;

          const r2Key = `chunks/${c.tenant_id}/${c.doc_id}/${c.chunk_id}.json`;
          await env.TIKTAK_DOCS.put(r2Key, JSON.stringify(c), { httpMetadata: { contentType: "application/json" } });
          stored++;

          const vector = await embedText(env, c.text);
          if (!vector) continue;

          const id = `${c.doc_id}_${c.chunk_id}`;
          upserts.push({
            id,
            values: vector,
            metadata: {
              kind: "doc",
              tenant_id: c.tenant_id,
              module: c.module || "general",
              title: c.title || c.doc_id,
              r2_key: r2Key,
              source: c.source || "docs",
            },
          });
        }

        if (kind === "playbooks") {
          const p = it as PlaybookIngestItem;
          if (!p?.text || !p?.playbook_id || !p?.tenant_id || !p?.playbook) continue;

          const safeId = String(p.playbook_id).replace(/\.json$/i, "");
          const r2Key = `playbooks/${p.tenant_id}/${safeId}.json`;

          await env.TIKTAK_DOCS.put(r2Key, JSON.stringify(p.playbook), { httpMetadata: { contentType: "application/json" } });
          stored++;

          const vector = await embedText(env, p.text);
          if (!vector) continue;

          upserts.push({
            id: safeId,
            values: vector,
            metadata: {
              kind: "playbook",
              tenant_id: p.tenant_id,
              module: p.module || "general",
              title: p.title || safeId,
              r2_key: r2Key,
              source: p.source || "playbooks",
            },
          });
        }
      }

      if (upserts.length) {
        if (kind === "docs") await env.TIKTAK_KB.upsert(upserts);
        if (kind === "playbooks") await env.TIKTAK_PLAYBOOKS.upsert(upserts);
      }

      return json(req, { ok: true, stored, upserted: upserts.length });
    }

    // ---------- CHAT ----------
    if (url.pathname === "/chat") {
      if (req.method !== "POST") return chatJson(req, { error: "use_post" }, 405);

      const body = (await safeReadJson(req)) as any;
      const message = sanitizeUserText(body?.message || "");
      const history = coerceHistory(body?.history);

      // TEMP: debug trigger to test Sidekick confirm escalation UI
      // (safe: only triggers on this exact magic string)
      if (message === "__TEST_ESCALATE_CONFIRM__") {
        return chatJson(req, {
          mode: "escalate",
          answer: "Je peux créer un ticket, mais j’ai besoin de votre confirmation.",
          signals: { confidence: 0.4, incident: false },
          context: "debug",
          ui: null,
          actions: [],
        });
      }


      if (!message) return chatJson(req, { error: "message is required" }, 400);

      // Greets any time user greets (Sidekick-like)
      if (isGreetingOnly(message)) {
        return chatJson(req, {
          mode: "solve",
          confidence: 1,
          context: "smalltalk",
          answer:
            "Salut 👋 Je suis l’assistant support TikTak Pro.\n" +
            "Dites-moi ce qui bloque (domaine, SSL, commande, paiement) et je vous guide étape par étape.",
        });
      }

      if (isThanksOnly(message)) {
        return chatJson(req, { mode: "solve", confidence: 1, context: "smalltalk", answer: "Avec plaisir 😊. Autre chose ?" });
      }

      const debug = url.searchParams.get("debug") === "1";

      const pbQuery = message;
      const docsQuery = `USER: ${message}\nHISTORY:\n${history
        .slice(-6)
        .map((h) => `${h.role}: ${h.content}`)
        .join("\n")}`;

      const pbVec = await embedText(env, pbQuery);
      const docsVec = await embedText(env, docsQuery);
      if (!pbVec || !docsVec) return chatJson(req, { error: "embedding_failed" }, 500);

      const dnsAgeHours = extractDnsAgeHours(message, history);
      const checksOk = dnsChecksComplete(message, history);

      // 1) Playbook-first
      const pbRes = await env.TIKTAK_PLAYBOOKS.query(pbVec, {
        topK: 5,
        returnMetadata: "all" as any,
      });

      const pbMatchesRaw: any[] = Array.isArray((pbRes as any)?.matches) ? (pbRes as any).matches : [];
      const pbMatches: any[] = pbMatchesRaw.filter((m) => !isProbePlaybookMatch(m));

      if (debug) {
        return json(req, {
          debug: true,
          message,
          pbQuery,
          docsQuery,
          dnsAgeHours,
          checksOk,
          playbooks: pbMatchesRaw.map((m) => ({
            id: m.id ?? null,
            score: m.score ?? null,
            module: m.metadata?.module ?? null,
            title: m.metadata?.title ?? null,
            r2_key: m.metadata?.r2_key ?? null,
            kind: m.metadata?.kind ?? null,
          })),
          playbooks_filtered_out: pbMatchesRaw
            .filter((m) => isProbePlaybookMatch(m))
            .map((m) => String(m?.id ?? "")),
        });
      }

      // ✅ NEW: if dnsAgeHours exists, force domains playbook if present (even if score is low)
      const forcedDomainsPb = dnsAgeHours != null ? pickDomainsPlaybook(pbMatches.length ? pbMatches : pbMatchesRaw) : null;

      const bestPb = forcedDomainsPb ?? (pbMatches[0] ?? pbMatchesRaw[0]);
      const bestPbScore = Number(bestPb?.score ?? 0);

      const shouldUsePlaybook =
        !!bestPb &&
        (
          bestPbScore >= 0.55 ||
          // ✅ Force domains path when dnsAgeHours exists and we found a domains playbook
          (dnsAgeHours != null && forcedDomainsPb != null)
        );

      if (shouldUsePlaybook) {
        const r2Key = getMetaString(bestPb.metadata, "r2_key");
        if (!r2Key) {
          return chatJson(req, {
            mode: "clarify",
            confidence: Number(bestPbScore.toFixed(2)),
            context: "general",
            questions: ["Je reconnais le sujet, mais le playbook n’a pas de r2_key. Relancez l’ingestion playbooks."],
            reason: "playbook_metadata_missing_r2_key",
          });
        }

        const obj = await env.TIKTAK_DOCS.get(r2Key);
        if (!obj) {
          return chatJson(req, {
            mode: "escalate",
            confidence: Number(bestPbScore.toFixed(2)),
            context: "general",
            category: "playbook_storage_issue",
            reason: "r2_playbook_not_found",
            r2_key: r2Key,
          });
        }

        const playbook = JSON.parse(await obj.text()) as Playbook;

        const out = runPlaybook(playbook, message, history) as ChatOut;
        const mapped = await mapPlaybookOutputToNaturalAnswer(env, out, message, history, docsVec);
        return chatJson(req, mapped);
      }

      // 2) Docs fallback
      const kbRes = await env.TIKTAK_KB.query(docsVec, { topK: 3, returnMetadata: "all" as any });
      const kbMatches: any[] = Array.isArray((kbRes as any)?.matches) ? (kbRes as any).matches : [];

      if (!kbMatches.length) {
        return chatJson(req, {
          mode: "clarify",
          confidence: 0.4,
          context: "general",
          questions: ["Pouvez-vous préciser le module concerné (domaine, SSL, commande, paiement) ?"],
        });
      }

      const best = kbMatches[0];
      const score = Number(best?.score ?? 0);
      const r2Key = getMetaString(best.metadata, "r2_key");

      if (!r2Key) {
        return chatJson(req, {
          mode: "clarify",
          confidence: Number(score.toFixed(2)),
          context: (best.metadata?.module as string) || "general",
          questions: ["Je vois un article pertinent, mais il manque la référence interne. Pouvez-vous reformuler ?"],
          reason: "kb_metadata_missing_r2_key",
        });
      }

      const obj = await env.TIKTAK_DOCS.get(r2Key);
      if (!obj) {
        return chatJson(req, {
          mode: "escalate",
          confidence: Number(score.toFixed(2)),
          context: (best.metadata?.module as string) || "general",
          category: "kb_storage_issue",
          reason: "r2_chunk_not_found",
          r2_key: r2Key,
        });
      }

      const chunk = JSON.parse(await obj.text());
      const knowledgeText = String(chunk?.text ?? "").trim();

      if (!knowledgeText) {
        return chatJson(req, {
          mode: "clarify",
          confidence: 0.5,
          context: (best.metadata?.module as string) || "general",
          questions: ["Pouvez-vous donner plus de détails (capture, message d’erreur, URL) ?"],
        });
      }

      if (score < 0.62) {
        return chatJson(req, {
          mode: "clarify",
          confidence: Number(score.toFixed(2)),
          context: (best.metadata?.module as string) || "general",
          questions: ["Pouvez-vous préciser l’étape exacte où ça bloque ?"],
        });
      }

      const llm = (await env.AI.run(CHAT_MODEL, {
        messages: [
          {
            role: "system",
            content:
              "Tu es un agent support TikTak Pro. Réponds en français. Utilise UNIQUEMENT la base fournie. Donne des étapes courtes et actionnables. Termine par une question.",
          },
          { role: "user", content: `Question:\n${message}\n\nKB:\n${knowledgeText}` },
        ],
        max_tokens: 350,
      })) as any;

      return chatJson(req, {
        mode: "solve",
        confidence: Number(score.toFixed(2)),
        context: (best.metadata?.module as string) || "general",
        answer: llm?.response ?? llm,
      });
    }

    return text(req, "Not found", 404);
  },
};
