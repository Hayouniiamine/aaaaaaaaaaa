
export type SupportAIResponse = {
  // Core response fields
  mode: "solve" | "clarify" | "escalate"
  answer: string
  category: string
  verdict: "user_side" | "tiktak_side" | "unclear"
  confidence: number
  
  // Follow-up
  next_question: string | null
  escalate: boolean
  
  // Context
  context: string  // Detected module/category
  route_link?: string | null  // Direct dashboard URL
  
  // Evidence from knowledge base
  evidence: Array<{
    source: "playbook" | "doc"
    id: string
    snippet: string
    score: number
  }>
  
  // Structured actions for user
  actions: Array<{
    type: string  // "check" | "configure" | "test" | "contact" | "document" | "clarify"
    label: string
    priority: "high" | "medium" | "low"
  }>
  
  // Rich signals for analytics
  signals: {
    confidence: number
    severity: "low" | "medium" | "high" | "critical"
    category: string
    sentiment: string  // "neutral" | "frustrated"
    escalation_recommended: boolean
    incident: boolean
    verdict?: string
    urgency?: "high"
    answer_quality?: "high" | "medium" | "low"
    requires_followup?: boolean
  }
  
  // UI enhancements (optional)
  ui?: any
  
  // Production metadata (from enhanced worker)
  metadata?: {
    context_quality: number
    answer_enhanced?: boolean
    escalation_reason: string
    escalation_severity?: "low" | "medium" | "high" | "critical"
    processing_timestamp: string
    enhancements_enabled?: boolean
  }
  
  // Backend conversation tracking (if using Django backend)
  conversation_id?: string
  ticket?: {
    id: string
    priority: string
    module?: string
  } | null
  ticket_type?: "bug" | "question" | "help" | "incident" | null
  
  // Legacy fields (for backward compatibility)
  quality?: "high" | "medium" | "low"
  questions?: string[]
  playbook?: any
}

/**
 * Message in conversation history
 * Stores metadata from AI responses
 */
export type ConversationMessage = {
  role: "user" | "assistant" | "system"
  content: string
  created_at: string
  
  // Enhanced metadata from worker
  meta?: {
    // Core fields
    mode?: "solve" | "clarify" | "escalate"
    verdict?: "user_side" | "tiktak_side" | "unclear"
    confidence?: number
    detected_module?: string
    category?: string
    
    // Quality indicators
    severity?: string
    sentiment?: string
    answer_quality?: string
    
    // Evidence
    evidence_count?: number
    has_evidence?: boolean
    
    // Follow-up
    next_question?: string
    escalation_recommended?: boolean
    
    // Processing
    processing_timestamp?: string
    context_quality?: number
  }
}

/**
 * Conversation intake data
 */
export type ConversationIntake = {
  enterprise: string
  problem_subject: string
  affected_url: string
  client_name: string
  client_email?: string
  client_phone?: string
}

/**
 * Start conversation payload
 */
export type StartConversationPayload = {
  intake: ConversationIntake
}

/**
 * Start conversation response
 */
export type StartConversationResponse = {
  conversation_id: string
  status: "open" | "closed" | "escalated"
}

/**
 * Conversation history response
 */
export type ConversationHistoryResponse = {
  conversation_id: string
  status: "open" | "closed" | "escalated"
  intake: ConversationIntake
  satisfaction: {
    stars: number | null
    comment: string
    ended_at: string | null
  }
  messages: ConversationMessage[]
}

/**
 * End conversation response
 */
export type EndConversationResponse = {
  conversation_id: string
  status: "closed" | "escalated"
  satisfaction: {
    stars: number
    comment: string
  }
}

/* ═══════════════════════════════════════════════════════════════════
   CONFIGURATION
   ═══════════════════════════════════════════════════════════════════ */

function getApiConfig() {
  const config = useRuntimeConfig()
  const baseURL =
    (config.public.supportApiBaseUrl as string | undefined) ||
    "http://127.0.0.1:8000"

  const widgetSecret =
    (config.public.supportWidgetSecret as string | undefined) || ""

  return { baseURL, widgetSecret }
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const { widgetSecret } = getApiConfig()

  console.log("[DEBUG] postJson: Sending request", {
    url,
    widgetSecret: widgetSecret ? `${widgetSecret.substring(0, 5)}...` : "EMPTY",
  })

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TikTak-Widget-Secret": widgetSecret,
    },
    credentials: "omit",
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))

  console.log("[DEBUG] postJson: Response status", res.status, "ok:", res.ok)

  if (!res.ok) {
    console.log("[DEBUG] postJson: Error response data", data)
    throw new Error(data?.error || `HTTP ${res.status}`)
  }

  return data as T
}

/* ═══════════════════════════════════════════════════════════════════
   API METHODS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Start a new support conversation
 */
export async function startConversation(
  payload: StartConversationPayload
): Promise<StartConversationResponse> {
  const { baseURL } = getApiConfig()
  return await postJson<StartConversationResponse>(
    `${baseURL}/support/ai/start/`,
    payload
  )
}

/**
 * Load conversation history
 */
export async function loadConversationHistory(
  conversationId: string
): Promise<ConversationHistoryResponse> {
  const { baseURL } = getApiConfig()
  return await postJson<ConversationHistoryResponse>(
    `${baseURL}/support/ai/history/`,
    { conversation_id: conversationId }
  )
}

/**
 * End conversation with rating
 */
export async function endConversation(
  conversationId: string,
  stars: number,
  comment: string = ""
): Promise<EndConversationResponse> {
  const { baseURL } = getApiConfig()
  return await postJson<EndConversationResponse>(
    `${baseURL}/support/ai/end/`,
    {
      conversation_id: conversationId,
      stars,
      comment,
    }
  )
}

/**
 * Send message to AI assistant
 * 
 * This calls your Django backend which proxies to the Cloudflare Worker
 * The response structure matches the enhanced worker output
 */
export async function askSupportAI(
  message: string,
  conversationId: string,
  confirmEscalation: boolean = false,
  image?: string
): Promise<SupportAIResponse> {
  const { baseURL } = getApiConfig()
  return await postJson<SupportAIResponse>(
    `${baseURL}/support/ai/ask/`,
    {
      message,
      conversation_id: conversationId,
      confirm_escalation: confirmEscalation,
      ...(image && { image }),
    }
  )
}

/* ═══════════════════════════════════════════════════════════════════
   UI HELPER FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Module names mapping
 */
const MODULE_NAMES: Record<string, string> = {
  scanner: "Scanner",
  shipments: "Livraisons",
  shipping: "Expédition", 
  products: "Produits",
  orders: "Commandes",
  checkout: "Panier/Checkout",
  auth: "Authentification",
  api: "API",
  domain: "Domaine",
  dns: "DNS",
  billing: "Facturation",
  payments: "Paiements",
  inventory: "Inventaire",
  general: "Général",
  unknown: "Non défini",
}

/**
 * Get human-readable module name
 */
export function getModuleName(module?: string): string {
  if (!module) return "Général"
  return MODULE_NAMES[module.toLowerCase()] || module
}

/**
 * Get severity color for UI badges
 */
export function getSeverityColor(severity?: string): string {
  const colors: Record<string, string> = {
    critical: "#ef4444",  // red-500
    high: "#f97316",      // orange-500
    medium: "#eab308",    // yellow-500
    low: "#6b7280",       // gray-500
  }
  // With `noUncheckedIndexedAccess`, indexed access may return `string | undefined`.
  return (colors[severity ?? "low"] ?? colors.low ?? "#6b7280")
}

/**
 * Get severity class for CSS
 */
export function getSeverityClass(severity?: string): string {
  const classes: Record<string, string> = {
    critical: "severity-critical",
    high: "severity-high",
    medium: "severity-medium",
    low: "severity-low",
  }
  return (classes[severity ?? "low"] ?? classes.low ?? "severity-low")
}

/**
 * Get verdict label for display
 */
export function getVerdictLabel(verdict?: string): string {
  const labels: Record<string, string> = {
    user_side: "Config utilisateur",
    tiktak_side: "Problème TikTak",
    unclear: "Diagnostic en cours",
  }
  return (labels[verdict ?? "unclear"] ?? "Non défini")
}

/**
 * Get verdict icon
 */
export function getVerdictIcon(verdict?: string): string {
  const icons: Record<string, string> = {
    user_side: "⚙️",
    tiktak_side: "🔴",
    unclear: "🔍",
  }
  return (icons[verdict ?? "unclear"] ?? "❓")
}

/**
 * Get verdict CSS class
 */
export function getVerdictClass(verdict?: string): string {
  const classes: Record<string, string> = {
    user_side: "verdict-user",
    tiktak_side: "verdict-tiktak",
    unclear: "verdict-unclear",
  }
  return (classes[verdict ?? "unclear"] ?? classes.unclear ?? "verdict-unclear")
}

/**
 * Get verdict title (tooltip text)
 */
export function getVerdictTitle(verdict?: string): string {
  const titles: Record<string, string> = {
    user_side: "Le problème peut être résolu par l'utilisateur (configuration, utilisation)",
    tiktak_side: "Problème confirmé côté TikTak PRO (bug, incident, limitation)",
    unclear: "Le diagnostic nécessite plus d'informations pour conclure",
  }
  return (titles[verdict ?? "unclear"] ?? "Verdict inconnu")
}

/**
 * Get verdict color
 */
export function getVerdictColor(verdict?: string): string {
  const colors: Record<string, string> = {
    user_side: "#3b82f6",   // blue-500
    tiktak_side: "#ef4444", // red-500
    unclear: "#6b7280",     // gray-500
  }
  return (colors[verdict ?? "unclear"] ?? colors.unclear ?? "#6b7280")
}

/**
 * Convenience helper used by the chat widget.
 */
export function getVerdictInfo(verdict?: string): {
  icon: string
  label: string
  className: string
  title: string
  color: string
} {
  return {
    icon: getVerdictIcon(verdict),
    label: getVerdictLabel(verdict),
    className: getVerdictClass(verdict),
    title: getVerdictTitle(verdict),
    color: getVerdictColor(verdict),
  }
}

/**
 * Get confidence label
 */
export function getConfidenceLabel(confidence?: number): string {
  if (confidence === undefined) return "N/A"
  const pct = Math.round(confidence * 100)
  if (pct >= 80) return "Élevée"
  if (pct >= 60) return "Moyenne"
  if (pct >= 40) return "Faible"
  return "Très faible"
}

/**
 * Get confidence CSS class
 */
export function getConfidenceClass(confidence?: number): string {
  if (confidence === undefined) return "confidence-none"
  if (confidence >= 0.8) return "confidence-high"
  if (confidence >= 0.6) return "confidence-medium"
  if (confidence >= 0.4) return "confidence-low"
  return "confidence-very-low"
}

/**
 * Get confidence color
 */
export function getConfidenceColor(confidence?: number): string {
  if (confidence === undefined) return "#6b7280"
  if (confidence >= 0.8) return "#10b981"  // green-500
  if (confidence >= 0.6) return "#3b82f6"  // blue-500
  if (confidence >= 0.4) return "#f59e0b"  // amber-500
  return "#ef4444"  // red-500
}

/**
 * Get answer quality text
 */
export function getQualityText(quality?: string): string {
  const qualityText: Record<string, string> = {
    high: "Confiance élevée",
    medium: "Confiance moyenne",
    low: "Besoin de précisions",
  }
  return quality ? qualityText[quality] || quality : "Non évalué"
}

/**
 * Get sentiment emoji
 */
export function getSentimentEmoji(sentiment?: string): string {
  const emojis: Record<string, string> = {
    helpful: "😊",
    neutral: "😐",
    frustrated: "😟",
    confused: "🤔",
  }
  return emojis[sentiment || "neutral"] || ""
}

/**
 * Check if response should show escalation UI
 */
export function shouldShowEscalation(response: SupportAIResponse): boolean {
  return (
    response.mode === "escalate" ||
    response.escalate === true ||
    response.signals?.escalation_recommended === true ||
    response.verdict === "tiktak_side"
  )
}

/**
 * Check if response needs clarification
 */
export function needsClarification(response: SupportAIResponse): boolean {
  return (
    response.mode === "clarify" ||
    response.verdict === "unclear" ||
    (response.next_question !== null && response.next_question !== undefined)
  )
}

/**
 * Format evidence for display
 * Groups evidence by source type
 */
export function formatEvidence(evidence: SupportAIResponse["evidence"]): {
  playbooks: typeof evidence
  docs: typeof evidence
} {
  return {
    playbooks: evidence.filter((e) => e.source === "playbook"),
    docs: evidence.filter((e) => e.source === "doc"),
  }
}

/**
 * Get action icon based on type
 */
export function getActionIcon(actionType: string): string {
  const icons: Record<string, string> = {
    check: "✓",
    configure: "⚙️",
    test: "🧪",
    contact: "📞",
    document: "📄",
    clarify: "❓",
  }
  return icons[actionType] || "•"
}

/**
 * Get action color based on priority
 */
export function getActionColor(priority: string): string {
  const colors: Record<string, string> = {
    high: "#ef4444",
    medium: "#f59e0b",
    low: "#6b7280",
  }
  return (colors[priority] ?? colors.low) ?? "#6b7280"
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return "À l'instant"
    if (diffMins < 60) return `Il y a ${diffMins} min`
    
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `Il y a ${diffHours}h`
    
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return isoString
  }
}

/**
 * Build metadata object from AI response for storing in message
 * This extracts key fields to store in conversation history
 */
export function buildMessageMeta(response: SupportAIResponse): ConversationMessage["meta"] {
  return {
    mode: response.mode,
    verdict: response.verdict,
    confidence: response.confidence,
    detected_module: response.context || response.category,
    category: response.category,
    severity: response.signals?.severity,
    sentiment: response.signals?.sentiment,
    answer_quality: response.signals?.answer_quality,
    evidence_count: response.evidence?.length || 0,
    has_evidence: (response.evidence?.length || 0) > 0,
    next_question: response.next_question || undefined,
    escalation_recommended: response.signals?.escalation_recommended,
    processing_timestamp: response.metadata?.processing_timestamp,
    context_quality: response.metadata?.context_quality,
  }
}

/**
 * Validate response has required fields
 * Useful for debugging integration issues
 */
export function validateResponse(response: any): response is SupportAIResponse {
  return (
    response &&
    typeof response === "object" &&
    typeof response.mode === "string" &&
    typeof response.answer === "string" &&
    typeof response.confidence === "number" &&
    typeof response.verdict === "string" &&
    Array.isArray(response.evidence) &&
    Array.isArray(response.actions) &&
    response.signals &&
    typeof response.signals === "object"
  )
}

/**
 * Get debug info string for troubleshooting
 */
export function getDebugInfo(response: SupportAIResponse): string {
  return JSON.stringify(
    {
      mode: response.mode,
      verdict: response.verdict,
      confidence: response.confidence,
      category: response.category,
      escalate: response.escalate,
      has_next_question: !!response.next_question,
      evidence_count: response.evidence?.length || 0,
      actions_count: response.actions?.length || 0,
      metadata: response.metadata,
    },
    null,
    2
  )
}