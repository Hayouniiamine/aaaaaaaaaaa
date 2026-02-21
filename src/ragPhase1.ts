// src/ragPhase1.ts — Phase 1 enhanced RAG scoring with metadata
// Augments smartFetchContext with playbook metadata + evidence scoring improvements

import type { Env, RetrievalContext, Playbook, PlaybookWithMetadata, PlaybookMetadata } from "./types";
import { scorePlaybookRelevance, calculateGroundedConfidence } from "./supportTypes";

/**
 * PHASE 1: Extract playbook metadata for scoring improvements
 * 
 * LOGIC:
 * 1. Check if playbook already has explicit metadata
 * 2. If not, infer from playbook structure (steps, triggers, scope)
 * 3. Extract error codes from common_errors list
 * 4. Identify prerequisites from triggers (e.g., ssl_configured, domain_verified)
 * 5. Parse common mistakes from description text
 * 
 * @param playbook - The playbook object to analyze
 * @returns PlaybookMetadata - Explicit or inferred metadata for this playbook
 */
export function inferPlaybookMetadata(playbook: Playbook): PlaybookMetadata {
  // Explicit metadata already in playbook
  if ((playbook as any).metadata) {
    return (playbook as any).metadata;
  }

  // Infer complexity from step count
  const stepCount = playbook.steps?.length || 0;
  const complexity: "L0" | "L1" | "L2+" = stepCount <= 2 ? "L0" : stepCount <= 4 ? "L1" : "L2+";

  // Extract error codes from common_errors or steps
  const error_codes: string[] = [];
  if (playbook.common_errors) {
    for (const err of playbook.common_errors) {
      const matches = err.solution?.match(/\b(5\d\d|40[34]|ERR_\w+)\b/g) || [];
      error_codes.push(...matches);
    }
  }

  // Infer prerequisites from triggers
  const prerequisites: string[] = [];
  if (playbook.scope === "settings" || playbook.triggers?.some(t => /ssl|domain|dns/i.test(t))) {
    prerequisites.push("domain_verified", "ssl_configured");
  }
  if (playbook.scope === "payments" || playbook.triggers?.some(t => /payment|stripe/i.test(t))) {
    prerequisites.push("payment_gateway_configured");
  }

  // Common mistakes from description
  const common_mistakes: string[] = [];
  if (playbook.description) {
    const mistakes = playbook.description.match(/(?:oubli|forget|miss|typo|error|common\s+mistake)[^.!?]*/gi);
    if (mistakes) {
      common_mistakes.push(...mistakes.slice(0, 5).map(m => m.slice(0, 60)));
    }
  }

  return {
    complexity,
    error_codes: [...new Set(error_codes)],
    prerequisites: [...new Set(prerequisites)],
    common_mistakes: [...new Set(common_mistakes)],
    estimated_time_min: complexity === "L0" ? 2 : complexity === "L1" ? 5 : 15,
    is_auto_serviceable: complexity === "L0" || complexity === "L1",
    problem_variations: playbook.triggers?.slice(0, 5) ?? [],
  };
}

/**
 * PHASE 1: Score playbooks with metadata for improved ranking
 * 
 * ALGORITHM:
 * 1. For each playbook, extract or infer metadata
 * 2. Calculate combined relevance score: embedding (60%) + error codes (25%) + symptoms (15%)
 * 3. Sort by final relevance score (highest first)
 * 
 * RETURNS: Sorted array by relevanceScore (descending)
 * 
 * @param playbooks - Raw retrieval results from vector search
 * @param message - User's problem description
 * @param detectedErrors - System-detected error codes (HTTP 500, SSL_ERROR, etc.)
 * @returns PlaybookWithMetadata[] - Enriched and sorted playbooks with scores
 */
export function scorePlaybooksWithMetadata(
  playbooks: Array<{
    id: string;
    playbook_id: string;
    playbook: Playbook;
    score: number;
    module: string;
  }>,
  message: string,
  detectedErrors: string[] = []
): PlaybookWithMetadata[] {
  return playbooks
    .map(pb => {
      const metadata = inferPlaybookMetadata(pb.playbook);
      const relevanceScore = scorePlaybookRelevance(pb.playbook, metadata, message, pb.score, detectedErrors);

      return {
        playbook: pb,
        metadata,
        retrievalScore: pb.score,
        relevanceScore,
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * PHASE 2: Calculate grounded confidence from playbook + message match
 * 
 * Combines multiple evidence signals:
 * - Keyword overlap: How many words from message appear in playbook text
 * - Error code match: Whether known error codes are found
 * - Symptom match: How many problem_variations match user's message
 * - Embedding score: Original semantic similarity score
 * 
 * Weight distribution: Embedding 35% + Keywords 25% + Errors 20% + Symptoms 20%
 * 
 * @param playbook - The candidate playbook
 * @param message - User's problem description
 * @param retrievalScore - Original embedding similarity score (0-1)
 * @returns {confidence, reasoning} - Final confidence and human-readable explanation
 */
export function calculatePlaybookConfidence(
  playbook: Playbook,
  message: string,
  retrievalScore: number
): { confidence: number; reasoning: string } {
  const metadata = inferPlaybookMetadata(playbook);
  
  // Format playbook for confidence calculation
  const pbText = formatPlaybookForConfidence(playbook);
  
  const evidence = calculateGroundedConfidence(
    message,
    pbText,
    metadata.error_codes,
    metadata.problem_variations,
    retrievalScore
  );

  return {
    confidence: evidence.final_confidence,
    reasoning: evidence.reasoning,
  };
}

/**
 * Format playbook content for textual confidence analysis
 * 
 * Concatenates all text fields:
 * - Title, description, triggers
 * - Error scenarios: symptom, cause, solution
 * - Interactive steps: questions, responses, reasoning
 * 
 * Used by calculateGroundedConfidence() for keyword matching
 * 
 * @param playbook - Playbook to format
 * @returns string - Combined text for analysis
 */
function formatPlaybookForConfidence(playbook: Playbook): string {
  const parts: string[] = [];

  if (playbook.title) parts.push(playbook.title);
  if (playbook.description) parts.push(playbook.description);
  if (playbook.triggers) parts.push(playbook.triggers.join(" "));

  if (playbook.common_errors) {
    for (const err of playbook.common_errors) {
      parts.push(err.symptom);
      parts.push(err.cause);
      parts.push(err.solution);
    }
  }

  for (const step of playbook.steps || []) {
    if ("question" in step) parts.push((step as any).question);
    if ("response" in step) parts.push((step as any).response);
    if ("reason" in step) parts.push((step as any).reason);
  }

  return parts.join(" ");
}

/**
 * PHASE 3: Filter playbooks by user capability + prerequisites
 * 
 * RULES:
 * 1. BEGINNER: Exclude L2+ playbooks (too complex)
 * 2. Prerequisites: User must have mentioned or confirmed all prerequisites
 *    Example: SSL playbook requires ssl_configured=true in confirmed_facts
 * 
 * RETURNS: Filtered subset of highest-ranked applicable playbooks
 * 
 * @param playbooks - Pre-scored playbooks
 * @param userLevel - Inferred user skill level (beginner/intermediate/advanced)
 * @param confirmedFacts - Facts user has confirmed during conversation
 * @returns PlaybookWithMetadata[] - Playbooks user can actually execute
 */
export function filterPlaybooksByUserCapability(
  playbooks: PlaybookWithMetadata[],
  userLevel: "beginner" | "intermediate" | "advanced",
  confirmedFacts: Record<string, any>
): PlaybookWithMetadata[] {
  return playbooks.filter(pb => {
    const { metadata } = pb;

    // Beginner users: prefer L0 playbooks
    if (userLevel === "beginner" && metadata.complexity === "L2+") {
      return false;
    }

    // Check prerequisites
    for (const prereq of metadata.prerequisites) {
      if (!(prereq in confirmedFacts) || !confirmedFacts[prereq]) {
        return false; // User missing prerequisite
      }
    }

    // Check auto-serviceability for recommendations
    if (!metadata.is_auto_serviceable && userLevel === "beginner") {
      return false; // Too complex for beginner
    }

    return true;
  });
}
