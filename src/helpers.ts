// src/helpers.ts — Shared utilities, CORS, JSON parsing, response normalization
import type { ChatState, Playbook, PlaybookStep, HistoryMsg } from "./types";
import { toCoarseModule } from "./detection";

/* ----------------------------- CORS / HTTP helpers ----------------------------- */

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-internal-secret",
    "Access-Control-Max-Age": "86400",
  };
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function text(req: Request, body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(req) },
  });
}

export function json(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/* ----------------------------- JSON / string utilities ----------------------------- */

export async function safeReadJson(req: Request): Promise<any | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function toStr(x: unknown): string {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}

/* ----------------------------- UI Routing ----------------------------- */

const DASH_BASE = "https://dash.tiktak.space";

export const ROUTE_BY_CONTEXT: Record<string, string> = {
  orders: "/orders",
  products: "/products",
  builder: "/content-management",
  settings: "/settings",
  shipping: "/shipping",
  payments: "/payments",
  billing: "/settings",
  pos: "/pos",
  apps: "/apps-store",
  customers: "/customers",
  auth: "/settings",
  inventory: "/stock-management",
  domains: "/domains",
  notifications: "/settings",
  general: "/settings",
};

export function routeFor(context: string, subRoute: string | undefined): string | null {
  const base = ROUTE_BY_CONTEXT[context];
  if (!base) return null;
  return subRoute ? `${DASH_BASE}${base}/${subRoute}` : `${DASH_BASE}${base}`;
}

/** G7-FIX: Corrected UTF-8 — was "Ouvrir l\u2019\u00e9cran TikTak" (mojibake) */
export function fallbackUiLink(
  context: string,
  _category?: string
): { label: string; route: string } | null {
  const route = ROUTE_BY_CONTEXT[context];
  if (!route) return null;
  return { label: "Ouvrir l'écran TikTak", route: `${DASH_BASE}${route}` };
}

/* ----------------------------- JSON block extraction ----------------------------- */

export function extractJsonBlock(raw: string): string | null {
  // Try to find JSON in markdown code block first
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Try to find raw JSON object
  const obj = raw.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];

  return null;
}

export function tryParsePlaybook(raw: string): Playbook | null {
  const block = extractJsonBlock(raw);
  if (!block) return null;
  try {
    const parsed = JSON.parse(block);
    if (parsed && Array.isArray(parsed.steps)) return parsed as Playbook;
  } catch { /* ignore */ }
  return null;
}

export function pickNextQuestionFromPlaybook(playbook: Playbook): string | null {
  for (const step of playbook.steps) {
    if (step.kind === "ask") return step.question;
  }
  return null;
}

/* ----------------------------- Chat State utilities ----------------------------- */

export function mergeFollowupIntoQuery(
  message: string,
  state: ChatState
): { merged: string; isFollowup: boolean } {
  if (!state?.waiting_for || !state?.original_question) {
    return { merged: message, isFollowup: false };
  }
  return {
    merged: `${state.original_question}\n[Réponse: ${message}]`,
    isFollowup: true,
  };
}

export function setWaitingState(
  prev: ChatState,
  waitingFor: NonNullable<ChatState>["waiting_for"],
  originalQuestion: string
): ChatState {
  return {
    waiting_for: waitingFor,
    original_question: originalQuestion,
    clarify_count: (prev?.clarify_count ?? 0) + 1,
  };
}

/* ----------------------------- Signal augmentation ----------------------------- */

export function augmentSignals(base: any, extras: { message?: string } = {}) {
  const urgent = extras.message
    ? /\b(urgent|asap|immediately|critique|bloqué|stuck|immédiatement)\b/i.test(extras.message)
    : false;

  if (urgent && base.severity === "low") {
    base.severity = "medium";
  }

  return base;
}

/* ----------------------------- Response normalization ----------------------------- */

export function normalizeSupportResponse(data: any): any {
  const raw = data && typeof data === "object" ? data : {};

  const modeRaw = toStr(raw?.mode || "");
  const mode =
    modeRaw === "solve" || modeRaw === "escalate" || modeRaw === "clarify"
      ? modeRaw
      : raw?.verdict === "tiktak_side"
        ? "escalate"
        : raw?.verdict === "user_side"
          ? "solve"
          : "clarify";

  const confidence: number = typeof raw?.confidence === "number" ? clamp01(raw.confidence) : 0;
  const contextRaw = toStr(raw?.context ?? raw?.preferredModule ?? raw?.category ?? raw?.signals?.preferredModule ?? "");
  const preferredModule = toCoarseModule(raw?.preferredModule ?? raw?.signals?.preferredModule ?? contextRaw ?? raw?.category);
  const context = preferredModule;

  const ui = raw?.ui ?? null;
  const actions = Array.isArray(raw?.actions) ? raw.actions : [];
  const questions: string[] = Array.isArray(raw?.questions) ? raw.questions.map((q: any) => toStr(q)) : [];

  let answer = typeof raw?.answer === "string" ? raw.answer : "";
  if (!answer && questions.length) {
    const cleaned = questions.map((q) => q.trim()).filter(Boolean);
    if (cleaned.length) answer = "J'ai besoin de préciser :\n- " + cleaned.join("\n- ");
  }
  if (!answer && mode === "escalate") {
    answer = "Je propose d'escalader ce problème à l'équipe support TikTak PRO.";
  }

  const cat = toStr(raw?.category ?? "").toLowerCase();
  const incidentCategory = ["incident", "outage", "api_down", "backend_error", "permission_issue", "bug_confirmed"].includes(cat);
  const incident = Boolean(raw?.signals?.incident ?? incidentCategory);

  const rawSignals = raw?.signals ?? {};
  const out: any = {
    mode,
    answer,
    signals: {
      confidence: Number(confidence.toFixed(2)),
      preferredModule,
      incident,
      severity: typeof rawSignals.severity === "string" ? rawSignals.severity : undefined,
      category: typeof rawSignals.category === "string" ? rawSignals.category : undefined,
      sentiment: typeof rawSignals.sentiment === "string" ? rawSignals.sentiment : undefined,
      escalation_recommended: typeof rawSignals.escalation_recommended === "boolean" ? rawSignals.escalation_recommended : undefined,
      strategy: typeof rawSignals.strategy === "string" ? rawSignals.strategy : undefined,
      strategy_reason: typeof rawSignals.strategy_reason === "string" ? rawSignals.strategy_reason : undefined,
    },
    context,
    ui,
    actions,
  };
  if (Array.isArray(raw?.evidence)) out.evidence = raw.evidence;
  if (typeof raw?.next_question === "string") out.next_question = raw.next_question;
  if (typeof raw?.escalate === "boolean") out.escalate = raw.escalate;
  if (typeof raw?.verdict === "string") out.verdict = raw.verdict;
  if (typeof raw?.category === "string") out.category = raw.category;
  if (raw?.state) (out as any).state = raw.state;
  // P0 new fields
  if (typeof raw?.ticket_type === "string") out.ticket_type = raw.ticket_type;
  if (typeof raw?.sentiment === "string") out.sentiment = raw.sentiment;
  if (typeof raw?.severity === "string") out.severity = raw.severity;
  if (typeof raw?.detected_language === "string") out.detected_language = raw.detected_language;
  if (typeof raw?.processing_time_ms === "number") out.processing_time_ms = raw.processing_time_ms;
  // Route link for direct dashboard navigation
  if (typeof raw?.route_link === "string") out.route_link = raw.route_link;
  // frontend compatibility + UI fallback
  (out as any).preferredModule = preferredModule;
  (out as any).detected_module = out.context;
  if (!out.ui && out.mode === "solve") out.ui = fallbackUiLink(out.context, out.category);
  return out;
}
