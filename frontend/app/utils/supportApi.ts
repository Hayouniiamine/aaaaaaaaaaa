import { useRuntimeConfig } from "#app"

export type SupportAIResponse = {
  conversation_id: string
  mode: "solve" | "clarify" | "escalate"
  answer: string
  ui: any
  actions: any[]
  quality: "high" | "medium" | "low"
  ticket: any | null
}

export async function askSupportAI(
  message: string,
  conversationId?: string,
  confirmEscalation: boolean = false
): Promise<SupportAIResponse> {
  const config = useRuntimeConfig()

  const baseURL =
    (config.public.supportApiBaseUrl as string | undefined) ||
    "http://127.0.0.1:8000"

  const widgetSecret =
    (config.public.supportWidgetSecret as string | undefined) || ""

  const res = await fetch(`${baseURL}/support/ai/ask/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TikTak-Widget-Secret": widgetSecret,
    },
    // IMPORTANT: widget auth is via header, not cookies
    credentials: "omit",
    body: JSON.stringify({
      message,
      conversation_id: conversationId ?? null,
      confirm_escalation: confirmEscalation,
    }),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`
    throw new Error(msg)
  }

  return data as SupportAIResponse
}
