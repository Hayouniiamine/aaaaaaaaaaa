// src/types.ts — Shared types and constants for the TikTak RAG Worker
// Re-exports from shared/ folder for use across worker
export type { Sujet, TicketType, Severity, Sentiment, Verdict, Mode, DetectedLanguage, AssistantResponse } from "../shared/contracts";

// Export Phase 1-3 support types
export type {
  PlaybookComplexity,
  PlaybookMetadata,
  PlaybookWithMetadata,
  ConversationPhase,
  ConversationContext,
  EvidenceScore,
  UserCapabilityLevel,
  UserCapabilityProfile,
  PlaybookStepExecutability,
  FalsePositivePattern,
} from "./supportTypes";

export {
  scorePlaybookRelevance,
  determineConversationPhase,
  calculateGroundedConfidence,
  inferUserCapability,
  validateStepExecutability,
  checkFalsePositive,
} from "./supportTypes";

// Export verdict pattern types and functions
export type { VerdictPattern } from "./verdictPatterns";
export { VERDICT_PATTERNS, findVerdictPattern, inferVerdictFromPattern } from "./verdictPatterns";

// Export conversation manager functions
export {
  initializeConversationContext,
  updateContext,
  inferVerdictEarly,
  extractConfirmedFacts,
  scoreDecisionQuality,
  getNextActionRecommendation,
  isUserResponseMeaningful,
} from "./conversationManager";

// Export RAG Phase 1 functions
export {
  inferPlaybookMetadata,
  scorePlaybooksWithMetadata,
  calculatePlaybookConfidence,
  filterPlaybooksByUserCapability,
} from "./ragPhase1";

export interface Env {
  AI: Ai;
  TIKTAK_KB: VectorizeIndex;
  TIKTAK_PLAYBOOKS: VectorizeIndex;
  TIKTAK_DOCS: R2Bucket;
  TIKTAK_CACHE: KVNamespace;
  INTERNAL_SHARED_SECRET: string;
}

/* ---- Model constants ---- */
export const EMBED_MODEL = "@cf/baai/bge-m3";
export const CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
export const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

/* ---- Conversation types ---- */
export type Role = "user" | "assistant";
export type HistoryMsg = { role: Role; content: string; image_url?: string };

/* ---- Document / Playbook types ---- */
export interface DocChunk {
  tenant_id: string;
  doc_id: string;
  chunk_id: string;
  module: string;
  text: string;
}

/** v2 playbook schema (engine-executable) — fully deterministic steps */
export type RequiredField =
  | { key: string; question: string }
  | string;

export type PlaybookAskStep = {
  kind: "ask";
  step_id: string;  // ← REQUIRED: unique step identifier
  question: string;
  field: string;    // ← REQUIRED: entity field to collect
  title?: string;
  options?: string[];
  // allow extra metadata from authoring
  [k: string]: any;
};

export type PlaybookVerifyStep = {
  kind: "verify";
  step_id: string;  // ← REQUIRED: unique step identifier
  question: string;
  title?: string;
  // allow extra metadata from authoring
  [k: string]: any;
};

export type PlaybookSolveStep = {
  kind: "solve";
  step_id: string;  // ← REQUIRED: unique step identifier
  response: string;
  title?: string;
  ui?: { label: string; route: string; highlight?: string };
  actions?: string[];
  success_indicator?: string;
  time_estimate?: string;
  condition?: string;
  common_errors?: string[];
  common_fixes?: string[];
  // allow extra metadata from authoring
  [k: string]: any;
};

export type PlaybookEscalateStep = {
  kind: "escalate";
  step_id: string;  // ← REQUIRED: unique step identifier
  reason: string;
  required_info?: string[];
  when?: string[];  // ← REQUIRED: conditions to escalate
  handoff_template?: {
    summary: string;
    repro_steps?: string[];
    evidence?: string[];
    suspected_component?: string;
    priority?: "P1" | "P2" | "P3" | "P4";
    [k: string]: any;
  };
  title?: string;
  [k: string]: any;
};

export type PlaybookStep = PlaybookAskStep | PlaybookVerifyStep | PlaybookSolveStep | PlaybookEscalateStep;

export interface Playbook {
  id: string;
  title?: string;
  scope?: string;
  canonical_scope?: string;
  description?: string;
  version?: string;
  triggers?: string[];
  required_fields?: RequiredField[];  // ← Fields to collect from user
  steps: PlaybookStep[];
  schema_version?: string;

  // legacy / optional enrichments
  common_errors?: Array<{ symptom: string; cause: string; solution: string }>;
  diagnostic_checklist?: any;
  scanner_setup?: Record<string, string>;
  best_practices?: string[];
  related_playbooks?: string[];
  [k: string]: any;
}

export interface PlaybookIngestItem {
  tenant_id: string;
  playbook_id: string;
  module: string;
  text: string;
  playbook: Playbook;
}

/* ---- Chat state (multi-turn playbook execution) ---- */
export type ChatState = {
  active_playbook_id?: string | null;
  active_step_id?: string | null;
  active_step_index?: number | null;
  clarify_count?: number;
  collected_entities?: Partial<ExtractedEntities>;
  original_question?: string;
  waiting_for?: string | null;
} | null;

/* ---- Retrieval types ---- */
export interface RetrievalContext {
  text: string;
  items: Array<{ id: string; text: string; score: number; module: string }>;
  matches: any[];
  avgScore: number;
  topScore: number;

  /** Only present when contextType === "playbook" */
  playbooks?: Array<{
    id: string;
    playbook_id: string;
    playbook: Playbook;
    score: number;
    module: string;
  }>;
}

export type ExtractedEntities = {
  url?: string;
  domain?: string;
  order_id?: string;
  sku_or_product?: string;
  payment_method?: string;
  error_message?: string;
  carrier?: string;
  has_screenshot_mention?: boolean;
  order_refs?: string[];
  [k: string]: any;
};

// ---- Governance signals type ----
export type GovTag = "http_false_positive" | "http_5xx" | "emotion" | "site_down" | "http_5xx_emotion" | "none";

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

/** ---- Vision Analysis ---- */
export interface VisionAnalysis {
  /** Unique hash of image for caching */
  imageHash?: string;

  /** Raw description of what's visible */
  description: string;

  /** Extracted error code (e.g., "502", "SSL_ERROR", "404") */
  errorCode?: string | null;

  /** Detected module (e.g., "products", "orders", "checkout") */
  detectedModule?: string | null;

  /** Problem description extracted from visual analysis */
  problemDescription?: string;

  /** Severity if error is detected ("critical" | "high" | "medium" | "low") */
  severity?: "critical" | "high" | "medium" | "low" | null;

  /** Suggested action or fix */
  suggestedAction?: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Additional metadata */
  isErrorScreen?: boolean;
  pageURL?: string;
  detectedElements?: string[];
  processingTimeMs?: number;

  /** For legacy compat */
  detectedError?: string | null;
}
