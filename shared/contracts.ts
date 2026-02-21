// shared/contracts.ts
import type { Sujet, TicketType } from "./taxonomy";

// Re-export types from taxonomy for convenience
export type { Sujet, TicketType } from "./taxonomy";

/** Severity levels for ticket triage */
export type Severity = "low" | "medium" | "high" | "critical";

/** Sentiment detected from user message */
export type Sentiment = "calm" | "frustrated" | "urgent" | "satisfied";

/** Verdict: who is responsible */
export type Verdict = "user_side" | "tiktak_side" | "unclear";

/** Response mode */
export type Mode = "solve" | "clarify" | "escalate";

/** Detected language */
export type DetectedLanguage = "fr" | "ar" | "darija" | "en";

/**
 * Actual worker response shape — matches the JSON returned by /chat.
 * Used across worker, Django backend, and Nuxt frontend.
 */
export type AssistantResponse = {
  // --- Core fields ---
  mode: Mode;
  verdict: Verdict;
  category: Sujet;
  confidence: number; // 0.0–1.0
  answer: string;
  next_question: string | null;
  escalate: boolean;

  // --- Classification ---
  ticket_type: TicketType;       // bug | question | demand | incident
  sentiment: Sentiment;          // calm | frustrated | urgent | satisfied
  severity: Severity;            // low | medium | high | critical
  detected_language: DetectedLanguage;

  // --- Evidence & actions ---
  evidence: Array<{
    source: "playbook" | "doc";
    id: string;
    snippet: string;
    score: number;
  }>;
  actions: Array<{
    type?: string;
    label: string;
    priority?: "high" | "medium" | "low";
  }>;

  // --- Signals (analytics) ---
  signals: {
    confidence: number;
    preferredModule: string;
    incident: boolean;
    severity: Severity;
    category: string;
    sentiment: Sentiment;
    escalation_recommended: boolean;
  };

  // --- Routing context ---
  context: string;              // detected module
  preferredModule: string;      // canonical module
  route_link: string | null;    // direct dashboard URL for the detected module

  // --- Performance ---
  processing_time_ms: number;   // wall-clock ms from request start

  // --- Optional ---
  ui?: { kind: string; url: string; label: string } | null;
  state?: any;
};
