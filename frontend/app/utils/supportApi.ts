import { useRuntimeConfig } from "#app";

export type Role = "user" | "assistant";
export type HistoryMsg = { role: Role; content: string };

export type AiAskResponse =
  | { mode: "solve"; confidence: number; context: string; answer: unknown; actions?: string[]; playbook_id?: string }
  | { mode: "clarify"; confidence: number; context: string; questions?: string[]; reason?: string; playbook_id?: string }
  | { mode: "escalate"; confidence: number; context: string; category?: string; reason?: string; r2_key?: string; playbook_id?: string }
  | { mode: "error"; confidence?: number; context?: string; error?: string };

function normalizeBaseUrl(u: string) {
  return String(u || "").replace(/\/+$/, "");
}

export async function askSupportAI(message: string, history: HistoryMsg[] = []): Promise<AiAskResponse> {
  const cfg = useRuntimeConfig();

  // ✅ Put this in nuxt.config.ts:
  // runtimeConfig: { public: { SUPPORT_API_BASE: "https://...workers.dev" } }
  const base = normalizeBaseUrl(String(cfg.public.SUPPORT_API_BASE || ""));

  if (!base) {
    return { mode: "error", confidence: 0, context: "client", error: "Missing runtimeConfig.public.SUPPORT_API_BASE" };
  }

  try {
    const out = await $fetch<AiAskResponse>(`${base}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { message, history },
    });

    return out;
  } catch (e: any) {
    return {
      mode: "error",
      confidence: 0,
      context: "network",
      error: e?.message || "request_failed",
    };
  }
}
