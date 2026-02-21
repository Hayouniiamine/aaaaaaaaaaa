// src/supportTypes.ts — Extended types for Phase 1-3 improvements
// Includes: Playbook metadata, conversation tracking, confidence grounding, user profiling

// ═════════════════════════════════════════════════════════════════════════════════
// PHASE 1: PLAYBOOK METADATA & IMPROVED SCORING
// ═════════════════════════════════════════════════════════════════════════════════

export type PlaybookComplexity = "L0" | "L1" | "L2+";

export interface PlaybookMetadata {
  /** Playbook execution complexity */
  complexity: PlaybookComplexity;

  /** List of error codes this playbook addresses (e.g., ["502", "SSL_ERROR_3", "ERR_CERT"]) */
  error_codes: string[];

  /** Prerequisites that must be satisfied (e.g., ["ssl_configured", "domain_verified"]) */
  prerequisites: string[];

  /** Common user mistakes this playbook helps prevent */
  common_mistakes: string[];

  /** Estimated time to resolve (minutes) */
  estimated_time_min: number;

  /** Whether this playbook is L0 self-service (can be auto-sent) or requires review */
  is_auto_serviceable: boolean;

  /** Which TikTak versions this applies to (e.g., ["v3.0+", "v3.1+']) */
  version_tags?: string[];

  /** Video tutorial URL if available */
  video_url?: string | null;

  /** Common variations of this problem (for better keyword matching) */
  problem_variations: string[];
}

/**
 * Augmented playbook with metadata
 * Used for Phase 1 scoring improvements
 */
export interface PlaybookWithMetadata {
  playbook: any; // Original playbook object
  metadata: PlaybookMetadata;
  retrievalScore: number; // Original embedding score (0-1)
  relevanceScore: number; // Enhanced score after metadata boosting (0-1)
}

/**
 * PHASE 1: Playbook relevance scoring
 * Returns final score combining: embedding similarity + error code match + symptom match + metadata boosts
 */
export function scorePlaybookRelevance(
  playbook: any,
  metadata: PlaybookMetadata,
  message: string,
  retrievalScore: number,
  detectedErrors: string[]
): number {
  let score = retrievalScore * 0.6; // Base score: 60% from embedding

  // Error code exact match: +0.25
  if (metadata.error_codes.some(code => message.includes(code))) {
    score += 0.25;
  }

  // Common mistake mention: +0.15
  const mistakes = metadata.common_mistakes.filter(m => message.toLowerCase().includes(m.toLowerCase()));
  if (mistakes.length > 0) {
    score += Math.min(0.15, mistakes.length * 0.05);
  }

  // Problem variation match: +0.10
  if (metadata.problem_variations.some(v => message.toLowerCase().includes(v.toLowerCase()))) {
    score += 0.10;
  }

  // Detect if prerequisites are lacking (penalty if not mentioned)
  if (metadata.prerequisites.length > 0) {
    const unmentioned = metadata.prerequisites.filter(
      p => !message.toLowerCase().includes(p.toLowerCase())
    );
    if (unmentioned.length === metadata.prerequisites.length) {
      score -= 0.05; // User might be missing context
    }
  }

  return Math.min(1, Math.max(0, score));
}

// ═════════════════════════════════════════════════════════════════════════════════
// PHASE 2: CONVERSATION STATE TRACKING & CONFIDENCE GROUNDING
// ═════════════════════════════════════════════════════════════════════════════════

export type ConversationPhase = "greeting" | "diagnose" | "prescribe" | "followup" | "exhausted";

export interface ConversationContext {
  /** Current phase in the conversation flow */
  phase: ConversationPhase;

  /** Total turn count (user messages) */
  turn_count: number;

  /** Questions asked so far (for loop detection) */
  asked_questions: string[];

  /** Count of clarifications user didn't meaningfully answer */
  failed_clarifications: number;

  /** Playbook steps already prescribed */
  prescribed_steps: string[];

  /** Facts confirmed by user (e.g., { ssl_active: true, carrier_name: "dhl" }) */
  confirmed_facts: Record<string, string | boolean | null>;

  /** Verdict at last turn (for consistency checking) */
  last_verdict?: "user_side" | "tiktak_side" | "unclear";

  /** Whether user confirmed issue is unresolved after prescribed steps */
  issue_persists: boolean;

  /** Subject tags for conversation (e.g., ["ssl", "domain", "dns"]) */
  subject_tags: string[];
}

/**
 * Conversation phase rules
 */
export function determineConversationPhase(context: ConversationContext): ConversationPhase {
  // If 3+ failed clarifications → exhausted
  if (context.failed_clarifications >= 2) {
    return "exhausted";
  }

  // If prescribed solutions and user says still broken → followup
  if (context.prescribed_steps.length > 0 && context.issue_persists) {
    return context.turn_count >= 3 ? "exhausted" : "followup";
  }

  // If prescribed solutions and issue not confirmed as persisting → done (shouldn't call again)
  if (context.prescribed_steps.length > 0) {
    return "prescribe";
  }

  // If facts collected but no diagnosis yet → diagnose
  if (Object.keys(context.confirmed_facts).length > 0) {
    return "diagnose";
  }

  return "greeting";
}

// ═════════════════════════════════════════════════════════════════════════════════
// PHASE 2: EVIDENCE-BASED CONFIDENCE GROUNDING
// ═════════════════════════════════════════════════════════════════════════════════

export interface EvidenceScore {
  /** How many words from user message appear in playbook (0-1) */
  keyword_overlap: number;

  /** Whether error codes match exactly (0 or 1) */
  error_code_match: number;

  /** How well symptom descriptions match (0-1) */
  symptom_match: number;

  /** Original embedding retrieval score (0-1) */
  retrieval_score: number;

  /** Final grounded confidence (0-1) */
  final_confidence: number;

  /** Reasoning for the confidence score */
  reasoning: string;
}

/**
 * PHASE 2: Calculate grounded confidence based on evidence
 * NOT just LLM vibe, but actual signal matching
 */
export function calculateGroundedConfidence(
  message: string,
  playbookText: string,
  errorCodes: string[],
  symptoms: string[],
  retrievalScore: number
): EvidenceScore {
  // Keyword overlap: % of unique words in message that appear in playbook
  const msgWords = new Set(message.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const pbWords = new Set(playbookText.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const overlap = Array.from(msgWords).filter(w => pbWords.has(w)).length;
  const keyword_overlap = overlap / Math.max(1, msgWords.size);

  // Error code match: does message contain any of the error codes?
  const error_code_match = errorCodes.some(code => message.includes(code)) ? 1 : 0;

  // Symptom match: how many symptom descriptions match
  const matchingSymptoms = symptoms.filter(sym => message.toLowerCase().includes(sym.toLowerCase()));
  const symptom_match = matchingSymptoms.length / Math.max(1, symptoms.length);

  // Combine signals
  let confidence = 0;
  confidence += retrievalScore * 0.35;       // 35% from embedding
  confidence += keyword_overlap * 0.25;      // 25% from keywords
  confidence += error_code_match * 0.20;     // 20% from error codes
  confidence += symptom_match * 0.20;        // 20% from symptoms

  const reasoning =
    error_code_match > 0
      ? "Error code matches exactly + text similarity"
      : symptom_match > 0.7
        ? "Symptom descriptions closely match"
        : keyword_overlap > 0.6
          ? "Good text overlap with playbook"
          : "Moderate play book relevance";

  return {
    keyword_overlap: Math.min(1, keyword_overlap),
    error_code_match,
    symptom_match: Math.min(1, symptom_match),
    retrieval_score: retrievalScore,
    final_confidence: Math.min(1, Math.max(0, confidence)),
    reasoning,
  };
}

// ═════════════════════════════════════════════════════════════════════════════════
// PHASE 3: PLAYBOOK STEP EXECUTABILITY & USER CAPABILITY PROFILING
// ═════════════════════════════════════════════════════════════════════════════════

export type UserCapabilityLevel = "beginner" | "intermediate" | "advanced";

export interface PlaybookStepExecutability {
  /** L0 = instant, L1 = few clicks, L2+ = complex */
  level: "L0" | "L1" | "L2+";

  /** Does step require backend/support access? */
  requires_backend: boolean;

  /** Prerequisites (step IDs or facts that must be true) */
  prerequisites: string[];

  /** UI path to reach this screen (e.g., "Settings > SSL") */
  ui_path?: string;

  /** Known bugs/workarounds for specific versions */
  known_issues?: Array<{ version: string; workaround: string }>;

  /** If false, explanation of why it's not executable for this user */
  is_executable: boolean;

  /** Blocker reason if not executable */
  blocker?: string;
}

export interface UserCapabilityProfile {
  level: UserCapabilityLevel;
  evidence: string[];  // e.g., ["mentions_API", "asked_11_questions"]
  estimated_skills: string[];  // e.g., ["dns_config", "ecommerce_basics"]
  recommended_step_level: "L0" | "L1" | "L2+";  // Recommended complexity
  needs_video: boolean;
  needs_coaching: boolean;
}

/**
 * PHASE 3: Infer user capability from message + history
 */
export function inferUserCapability(message: string, history: string[]): UserCapabilityProfile {
  const fullText = [message, ...history].join(" ").toLowerCase();
  const evidence: string[] = [];

  // Advanced indicators
  if (/api|webhook|endpoint|sql|database|backend|code|javascript|html|css/i.test(fullText)) {
    evidence.push("mentions_technical_terms");
  }
  if (/cli|terminal|command line|ssh|git|github/i.test(fullText)) {
    evidence.push("mentions_development_tools");
  }

  // Intermediate indicators
  if (/ssl|dns|cname|nameserver|certificate|domain registration/i.test(fullText)) {
    evidence.push("mentions_dns_ssl");
  }
  if (/api key|webhook|integration|third.?party/i.test(fullText)) {
    evidence.push("mentions_integrations");
  }

  // Beginner indicators
  if (/how to|comment faire|kifech|c'est quoi|what is|where|where to find/i.test(fullText)) {
    evidence.push("basic_questions");
  }
  if (history.length < 2) {
    evidence.push("first_time_contact");
  }
  if (/typo|accent|darija/i.test(fullText)) {
    evidence.push("non_technical_language");
  }

  let level: UserCapabilityLevel = "beginner";
  if (evidence.some(e => e.startsWith("mentions_development"))) {
    level = "advanced";
  } else if (evidence.some(e => e.startsWith("mentions_dns") || e.startsWith("mentions_integration"))) {
    level = "intermediate";
  }

  return {
    level,
    evidence,
    estimated_skills:
      level === "advanced"
        ? ["api_integration", "deployment", "backend_config"]
        : level === "intermediate"
          ? ["dns_configuration", "third_party_integration", "technical_troubleshooting"]
          : ["basic_ecommerce", "dashboard_navigation"],
    recommended_step_level: level === "advanced" ? "L2+" : level === "intermediate" ? "L1" : "L0",
    needs_video: level !== "advanced",
    needs_coaching: level === "beginner" && history.length < 1,
  };
}

/**
 * PHASE 3: Validate step executability for user context
 */
export function validateStepExecutability(
  stepUiPath: string | undefined,
  prerequisites: string[] | undefined,
  userLevel: UserCapabilityLevel,
  confirmedFacts: Record<string, any>,
  userPlanFeatures: string[]
): PlaybookStepExecutability {
  const issues: string[] = [];

  // Check plan limitations
  if (stepUiPath?.includes("Advanced") && !userPlanFeatures.includes("advanced_features")) {
    issues.push("Plan limitation: Advanced features not available");
  }

  // Check prerequisites
  if (prerequisites && prerequisites.length > 0) {
    for (const prereq of prerequisites) {
      if (!(prereq in confirmedFacts) || !confirmedFacts[prereq]) {
        issues.push(`Missing prerequisite: ${prereq}`);
      }
    }
  }

  // Check if user capability is sufficient
  if (userLevel === "beginner" && stepUiPath?.toLowerCase().includes("advanced")) {
    issues.push("Step may be too complex for beginner user");
  }

  return {
    level: stepUiPath?.includes("Advanced") ? "L2+" : stepUiPath?.includes("Settings") ? "L1" : "L0",
    requires_backend: stepUiPath?.toLowerCase().includes("backend") || false,
    prerequisites: prerequisites || [],
    ui_path: issues.length === 0 ? stepUiPath : undefined,
    is_executable: issues.length === 0,
    blocker: issues.length > 0 ? issues.join("; ") : undefined,
  };
}

// ═════════════════════════════════════════════════════════════════════════════════
// PHASE 3: IMPROVED FALSE POSITIVE DETECTION
// ═════════════════════════════════════════════════════════════════════════════════

export interface FalsePositivePattern {
  /** UUID for this pattern */
  id: string;

  /** Regex that matches (e.g., /\b500\b/) */
  pattern: RegExp;

  /** Context words that suggest it's NOT a real error if present */
  false_positive_indicators: string[];

  /** Context words that confirm it IS a real error */
  must_contain_indicators?: string[];

  /** Estimated probability it's a false positive (0-1) */
  false_positive_probability: number;

  /** Description for debugging */
  description: string;
}

export const FALSE_POSITIVE_PATTERNS: FalsePositivePattern[] = [
  {
    id: "FP_500_PRICE",
    pattern: /\b500\b/,
    false_positive_indicators: ["prix", "price", "total", "montant", "devis", "cost", "fee", "dah", "dzd"],
    must_contain_indicators: ["error", "erreur", "server", "serveur", "crash", "down"],
    false_positive_probability: 0.92,
    description: "500 as currency (500 DZD) not error",
  },
  {
    id: "FP_502_REFERENCE",
    pattern: /\b502\b/,
    false_positive_indicators: ["commande", "order", "numéro", "number", "id", "ref"],
    must_contain_indicators: ["gateway", "error", "erreur", "timeout", "bad"],
    false_positive_probability: 0.85,
    description: "502 as order/reference number, not gateway error",
  },
  {
    id: "FP_404_ADDRESS",
    pattern: /\b404\b/,
    false_positive_indicators: ["rue", "street", "adresse", "address", "code postal", "zip"],
    must_contain_indicators: ["not found", "page", "not exist"],
    false_positive_probability: 0.80,
    description: "404 as apartment/postal code, not HTTP status",
  },
];

/**
 * PHASE 3: Detect if an error mention is likely false positive
 */
export function checkFalsePositive(message: string): { is_false_positive: boolean; pattern?: FalsePositivePattern; probability: number } {
  const lowerMsg = message.toLowerCase();

  for (const fpPattern of FALSE_POSITIVE_PATTERNS) {
    if (!fpPattern.pattern.test(lowerMsg)) continue;

    // Check false_positive_indicators
    const hasFP = fpPattern.false_positive_indicators.some(ind => lowerMsg.includes(ind));
    if (!hasFP) continue;

    // Check must_contain_indicators (if defined)
    if (fpPattern.must_contain_indicators && fpPattern.must_contain_indicators.length > 0) {
      const hasMust = fpPattern.must_contain_indicators.some(ind => lowerMsg.includes(ind));
      if (hasMust) continue; // Likely real error, not false positive
    }

    return {
      is_false_positive: true,
      pattern: fpPattern,
      probability: fpPattern.false_positive_probability,
    };
  }

  return { is_false_positive: false, probability: 0 };
}
