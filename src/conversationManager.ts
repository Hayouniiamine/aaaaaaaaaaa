// src/conversationManager.ts — Phase 2-3: Conversation state tracking & decision improvements
// Manages conversation phase, verdict inference, confidence grounding, user profiling

import type { ConversationContext, ConversationPhase, UserCapabilityProfile } from "./types";
import {
  determineConversationPhase,
  calculateGroundedConfidence,
  inferUserCapability,
  validateStepExecutability,
} from "./supportTypes";
import { inferVerdictUsingPatterns } from "./detection";

/**
 * Initialize conversation context for new ticket
 */
export function initializeConversationContext(): ConversationContext {
  return {
    phase: "greeting",
    turn_count: 0,
    asked_questions: [],
    failed_clarifications: 0,
    prescribed_steps: [],
    confirmed_facts: {},
    last_verdict: undefined,
    issue_persists: false,
    subject_tags: [],
  };
}

/**
 * Update conversation context after each turn
 */
export function updateContext(
  context: ConversationContext,
  {
    userMessage,
    llmVerdict,
    llmAnswer,
    didAskQuestion,
    userResponded,
    didPrescribe,
    newConfirmedFacts,
  }: {
    userMessage: string;
    llmVerdict?: "user_side" | "tiktak_side" | "unclear";
    llmAnswer?: string;
    didAskQuestion?: boolean;
    userResponded?: boolean;
    didPrescribe?: boolean;
    newConfirmedFacts?: Record<string, any>;
  }
): ConversationContext {
  // Update turn count
  const updated = { ...context, turn_count: context.turn_count + 1 };

  // Track failed clarifications
  if (didAskQuestion && !userResponded) {
    updated.failed_clarifications = context.failed_clarifications + 1;
  } else if (userResponded) {
    updated.failed_clarifications = 0; // Reset on successful response
  }

  // Track prescribed steps
  if (didPrescribe) {
    updated.prescribed_steps.push(llmAnswer || "");
  }

  // Merge confirmed facts
  if (newConfirmedFacts) {
    updated.confirmed_facts = { ...updated.confirmed_facts, ...newConfirmedFacts };
  }

  // Track verdict
  if (llmVerdict) {
    updated.last_verdict = llmVerdict;
  }

  // Determine new phase
  updated.phase = determineConversationPhase(updated);

  return updated;
}

/**
 * PHASE 2: Infer verdict using patterns + user context
 * Returns: early verdict (if pattern matches) or null (needs LLM)
 */
export function inferVerdictEarly(
  message: string,
  context: ConversationContext
): {
  verdict?: "user_side" | "tiktak_side" | "unclear";
  confidence?: number;
  requiresLlmDecision: boolean;
  reasoning: string;
} {
  const patternInference = inferVerdictUsingPatterns(message);

  // If pattern has high confidence verdict, return early
  if (patternInference.pattern_matched) {
    if (patternInference.verdict === "tiktak_side" && patternInference.confidence >= 0.75) {
      return {
        verdict: "tiktak_side",
        confidence: patternInference.confidence,
        requiresLlmDecision: false,
        reasoning: patternInference.reasoning,
      };
    }

    if (patternInference.verdict === "user_side" && patternInference.confidence >= 0.85) {
      return {
        verdict: "user_side",
        confidence: patternInference.confidence,
        requiresLlmDecision: false,
        reasoning: patternInference.reasoning,
      };
    }
  }

  // If conversation context suggests verdict, use that
  if (context.last_verdict === "tiktak_side" && context.issue_persists) {
    return {
      verdict: "tiktak_side",
      confidence: 0.8,
      requiresLlmDecision: false,
      reasoning: "Issue persists after prescribed steps → likely TikTak side",
    };
  }

  // Otherwise, need LLM decision
  return {
    requiresLlmDecision: true,
    reasoning: "Pattern + context insufficient, LLM verdict needed",
  };
}

/**
 * PHASE 2: Determine if user's response is meaningful to a question
 */
export function isUserResponseMeaningful(response: string, questionContext?: string): boolean {
  const lower = response.toLowerCase().trim();

  // Very short or generic responses
  if (lower.length < 3) return false;
  if (/^(oui|oui|non|yes|no|ok|ok|maybe|peut|être|a|un|ça|ca|quoi|what|hein)$/i.test(lower)) {
    return false;
  }

  // All special characters or numbers only
  if (!/[a-zàâäç0-9\u0600-\u06FF]/i.test(lower)) {
    return false;
  }

  // Context mismatch (question asked about X, answered about Y)
  if (questionContext) {
    const contextWords = questionContext.toLowerCase().split(/\s+/);
    const responseWords = lower.split(/\s+/);
    const overlap = contextWords.filter(w => responseWords.some(r => r.includes(w)));
    if (overlap.length === 0 && !/^(oui|non|yes|no)/.test(lower)) {
      return false; // Looks like user changed subject
    }
  }

  return true;
}

/**
 * PHASE 3: Score decision quality based on evidence
 */
export function scoreDecisionQuality(opts: {
  messageKeywordOverlap: number; // 0-1: how well message matches diagnostic
  playbookRelevance: number; // 0-1: playbook relevance score
  confirmedFactCount: number; // number of facts confirmed
  userCapability: UserCapabilityProfile; // user skill level
  stepsCompleted: number; // how many steps user completed
}): { quality_score: number; confidence: number; recommendation: "high_confidence" | "medium" | "low" | "needs_escalation" } {
  let score = 0;

  // Keyword overlap weight: 0.35
  score += opts.messageKeywordOverlap * 0.35;

  // Playbook relevance weight: 0.35
  score += opts.playbookRelevance * 0.35;

  // Confirmed facts bonus: +0.1 for each fact (up to 0.2 max)
  score += Math.min(0.2, opts.confirmedFactCount * 0.05);

  // User capability adjustment
  if (opts.userCapability.level === "advanced") {
    score += 0.05; // Advanced users less likely to misunderstand
  } else if (opts.userCapability.level === "beginner" && opts.stepsCompleted < 1) {
    score -= 0.1; // Beginner without steps is riskier
  }

  // Map to recommendation
  let recommendation: "high_confidence" | "medium" | "low" | "needs_escalation" = "medium";
  if (score >= 0.75) recommendation = "high_confidence";
  else if (score < 0.5) recommendation = "low";
  if (opts.stepsCompleted >= 3 && score < 0.4) recommendation = "needs_escalation";

  return {
    quality_score: score,
    confidence: Math.min(1, Math.max(0, score)),
    recommendation,
  };
}

/**
 * PHASE 2: Extract confirmed facts from message
 * Returns object of { fact_name: value } that can be merged into context
 */
export function extractConfirmedFacts(
  message: string,
  questionAsked?: string
): Record<string, string | boolean | null> {
  const facts: Record<string, string | boolean | null> = {};
  const lower = message.toLowerCase();

  // Yes/No responses
  if (/^(oui|yes|yep|yeah|si)(\.|\s|!|,)?$/i.test(message.trim())) {
    if (questionAsked?.includes("SSL")) facts.ssl_active = true;
    if (questionAsked?.includes("Publié")) facts.published = true;
    if (questionAsked?.includes("activé")) facts.activated = true;
    return facts;
  }

  if (/^(non|no|nope|nah)(\.|\s|!|,)?$/i.test(message.trim())) {
    if (questionAsked?.includes("SSL")) facts.ssl_active = false;
    if (questionAsked?.includes("Publié")) facts.published = false;
    if (questionAsked?.includes("activé")) facts.activated = false;
    return facts;
  }

  // Payment method
  if (/stripe|konnect|edinar|paypal|carte|visa|mastercard/i.test(lower)) {
    const match = message.match(/(stripe|konnect|edinar|paypal|carte|visa|mastercard)/i);
    facts.payment_method = match?.[1] ?? "unknown";
  }

  // Carrier/Shipper
  if (/fedex|dhl|aramex|droppex|poste|chronopost|ups|tnt/i.test(lower)) {
    const match = message.match(/(fedex|dhl|aramex|droppex|poste|chronopost|ups|tnt|mylerz)/i);
    facts.carrier_name = match?.[1] ?? "unknown";
  }

  // Product status
  if (/publié|published|brouillon|draft|archiv/i.test(lower)) {
    if (/publié|published/i.test(lower)) facts.product_status = "published";
    if (/brouillon|draft/i.test(lower)) facts.product_status = "draft";
    if (/archiv/i.test(lower)) facts.product_status = "archived";
  }

  // Browser type
  if (/chrome|firefox|safari|edge|internet explorer|ie/i.test(lower)) {
    const match = message.match(/(chrome|firefox|safari|edge|internet explorer|ie)/i);
    facts.browser_type = match?.[1] ?? "unknown";
  }

  // Error code
  const errorMatch = message.match(/\b(5\d\d|40[34]|ERR_\w+)\b/);
  if (errorMatch) {
    facts.error_code = errorMatch[1];
  }

  return facts;
}

/**
 * PHASE 3: Recommendation for next action
 */
export function getNextActionRecommendation(context: ConversationContext): {
  action: "continue_diagnosis" | "prescribe" | "ask_clarification" | "escalate";
  message: string;
} {
  // If too many failed clarifications → escalate
  if (context.failed_clarifications >= 2) {
    return {
      action: "escalate",
      message: "User unable to provide diagnostic info after multiple attempts",
    };
  }

  // If prescribed solutions and issue persists → escalate
  if (context.prescribed_steps.length >= 2 && context.issue_persists) {
    return {
      action: "escalate",
      message: "Prescribed steps failed, issue persists",
    };
  }

  // If we have enough confirmed facts → prescribe
  if (Object.keys(context.confirmed_facts).length >= 2 && context.prescribed_steps.length === 0) {
    return {
      action: "prescribe",
      message: "Sufficient diagnostic facts collected",
    };
  }

  // Default: ask clarification
  return {
    action: context.prescribed_steps.length > 0 ? "continue_diagnosis" : "ask_clarification",
    message: "Need more diagnostic information",
  };
}
