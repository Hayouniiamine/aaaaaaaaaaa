

/* ----------------------------- v7: LLM signal extractor ----------------------------- */

async function llmExtractSignals(env: Env, message: string, history: HistoryMsg[]) {
  try {
    const messages = buildSignalExtractionMessages(message, history);
    const result = (await env.AI.run(CHAT_MODEL as any, { messages, max_tokens: 220 })) as any;
    const raw = result?.response || result?.result || result?.output || result;
    const txt = typeof raw === "string" ? raw : JSON.stringify(raw);
    // best-effort JSON parse
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}
// src/routes.ts — HTTP route handlers with unified post-LLM logic (fixes G3)
// v3.1: Governance layer integration for deterministic escalation + category routing
// v3.2: Phase 1-3 integration (playbook scoring, verdict inference, conversation tracking)
import type { Env, HistoryMsg, ChatState, PlaybookIngestItem, DocChunk, RetrievalContext } from "./types";
import { CHAT_MODEL } from "./types";
import { json, corsHeaders, safeReadJson, toStr, clamp01, normalizeSupportResponse, augmentSignals, mergeFollowupIntoQuery, setWaitingState, routeFor } from "./helpers";
import { canonicalModule, toCoarseModule, detectPreferredModule, extractEntities, detectLanguage, checkHardEscalation, isGreetingOnly, isThanksOnly, inferModuleFromRetrieval, inferVerdictUsingPatterns } from "./detection";

// Phase 1-3: Enhanced decision-making
import {
  scorePlaybooksWithMetadata,
  calculatePlaybookConfidence,
  filterPlaybooksByUserCapability,
  inferPlaybookMetadata,
} from "./ragPhase1";

import {
  initializeConversationContext,
  updateContext,
  inferVerdictEarly,
  extractConfirmedFacts,
  scoreDecisionQuality,
  getNextActionRecommendation,
  isUserResponseMeaningful,
} from "./conversationManager";

import type { PlaybookWithMetadata, ConversationContext, UserCapabilityProfile } from "./types";
import {
  inferUserCapability,
  checkFalsePositive,
  calculateGroundedConfidence,
} from "./supportTypes";
import { buildLlmMessages, buildSignalExtractionMessages } from "./prompt";
import { embedText, smartFetchContext, buildKnowledgeContext, gatherEvidence, computeConfidence } from "./rag";
import { runGovernance, governanceToPromptHints, validatePostLlm, type GovernanceSignals } from "./governance";
import { runDecisionEngine, selectPlaybookAndStep } from "./decisionEngine";
import { analyzeScreenshot, visionToContext, getPlaybooksForVision, type VisionAnalysis } from "./vision";

/* ----------------------------- Helpers ----------------------------- */

/**
 * Extract the dominant module from RAG retrieval results (playbooks + docs).
 * Returns the module with the highest weighted score, or null.
 */
function inferRagTopModule(pbCtx: RetrievalContext, docsCtx: RetrievalContext): string | null {
  const moduleScores: Record<string, number> = {};
  for (const item of pbCtx.items) {
    const mod = canonicalModule(item.module);
    if (mod && mod !== "general") moduleScores[mod] = (moduleScores[mod] || 0) + item.score * 2;
  }
  for (const item of docsCtx.items) {
    const mod = canonicalModule(item.module);
    if (mod && mod !== "general") moduleScores[mod] = (moduleScores[mod] || 0) + item.score;
  }
  const entries = Object.entries(moduleScores);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return toCoarseModule(entries[0][0]);
}

function chatJson(req: Request, data: any, status = 200) {
  return json(req, normalizeSupportResponse(data), status);
}

/* ── Orchestration guardrail helpers ── */

function lastAssistantText(history: HistoryMsg[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") return String(history[i].content || "");
  }
  return "";
}

function normText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "").trim();
}

/** Cheap token-overlap similarity (0–1). No embeddings needed. */
function cheapSim(a: string, b: string): number {
  const A = new Set(normText(a).split(" ").filter(Boolean));
  const B = new Set(normText(b).split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

/* -- Conversation state machine (Sidekick-style) -- */

type ConversationPhase = "greeting" | "diagnose" | "prescribe" | "followup" | "exhausted";

interface ConvState {
  phase: ConversationPhase;
  module: string;
  turnCount: number;
  stepsGiven: string[];
  merchantClaims: string[];
  questionsAsked: string[];
  dataProvided: string[];
  lastQuestion: string | null;
  questionAnswered: boolean;
  topicShifted: boolean;
}

/** Extract structured conversation state from history. */
function analyzeConversationState(history: HistoryMsg[], currentModule: string): ConvState {
  const assistantMsgs = history.filter(h => h.role === "assistant").map(h => String(h.content || ""));
  const userMsgs = history.filter(h => h.role === "user").map(h => String(h.content || ""));
  const turnCount = assistantMsgs.length;

  // Extract steps already given (numbered items from assistant messages)
  const stepsGiven: string[] = [];
  for (const msg of assistantMsgs) {
    const stepMatches = msg.match(/\d+[\.\)]\s*\*?\*?[^*\n]{10,80}/g);
    if (stepMatches) {
      for (const s of stepMatches) {
        const cleaned = s.replace(/^\d+[\.\)]\s*\*?\*?/, "").trim().slice(0, 80);
        if (cleaned.length > 10 && !stepsGiven.some(ex => cheapSim(ex, cleaned) > 0.6)) {
          stepsGiven.push(cleaned);
        }
      }
    }
  }

  // Extract questions we already asked
  const questionsAsked: string[] = [];
  for (const msg of assistantMsgs) {
    const qMatches = msg.match(/[^\n.!]{10,100}\?/g);
    if (qMatches) {
      for (const q of qMatches.slice(0, 3)) {
        const cleaned = q.trim().slice(0, 100);
        if (!questionsAsked.some(ex => cheapSim(ex, cleaned) > 0.5)) {
          questionsAsked.push(cleaned);
        }
      }
    }
  }

  // Detect data provided by merchant (order refs, URLs, error codes)
  const dataProvided: string[] = [];
  const seenTypes = new Set<string>();
  for (const msg of userMsgs) {
    // Order references (8+ digit numbers)
    const orderRefs = msg.match(/\b\d{8,}\b/g);
    if (orderRefs && !seenTypes.has("refs")) {
      seenTypes.add("refs");
      const refs = [...new Set(orderRefs)].slice(0, 5);
      dataProvided.push("refs commandes: " + refs.join(", "));
    }
    // URLs
    if (/https?:\/\/|www\.\S+/i.test(msg) && !seenTypes.has("url")) {
      seenTypes.add("url");
      dataProvided.push("URL fournie");
    }
    // Error codes
    const errorCodes = msg.match(/\b(?:erreur|error|code)\s*:?\s*\d{3}\b/i);
    if (errorCodes && !seenTypes.has("err")) {
      seenTypes.add("err");
      dataProvided.push("code erreur: " + errorCodes[0]);
    }
    // Domain names (.tn, .com etc)
    const domainMatch = msg.match(/\b[\w-]+\.(tn|com|net|org|fr|shop|store)\b/i);
    if (domainMatch && !seenTypes.has("domain")) {
      seenTypes.add("domain");
      dataProvided.push("domaine: " + domainMatch[0]);
    }
    // Carrier/shipper names
    const carrierMatch = msg.match(/\b(droppex|aramex|fedex|dhl|chronopost|rapid\s*poste|poste\s*tunisienne|ups|tnt|express\s*delivery|mylerz|yan?lidine|maystro|genex|sobflous)\b/i);
    if (carrierMatch && !seenTypes.has("carrier")) {
      seenTypes.add("carrier");
      dataProvided.push("transporteur: " + carrierMatch[1]);
    }
    // Screenshot/image mentions
    if (/capture|screenshot|image|photo|pi\u00e8ce.?jointe|ci.?joint/i.test(msg) && !seenTypes.has("screenshot")) {
      seenTypes.add("screenshot");
      dataProvided.push("capture d'\u00e9cran mentionn\u00e9e");
    }
  }

  // Detect merchant claims
  const merchantClaims: string[] = [];
  for (const msg of userMsgs) {
    const m = msg.toLowerCase();
    if (/tout\s+(est\s+)?v[e\u00e9]rifi[e\u00e9]|j['\u2019]ai\s+(tout\s+)?(fait|essay\u00e9|v\u00e9rifi\u00e9)/i.test(m)) merchantClaims.push("dit avoir tout v\u00e9rifi\u00e9");
    if (/persist|toujours\s+pareil|m\u00eame\s+probl[e\u00e8]|\u00e7a\s+change\s+rien|marche\s+toujours\s+pas/i.test(m)) merchantClaims.push("probl\u00e8me persiste");
    if (/d\u00e9j\u00e0\s+(fait|essay\u00e9|test\u00e9)|j['\u2019]ai\s+d\u00e9j\u00e0/i.test(m)) merchantClaims.push("dit avoir d\u00e9j\u00e0 essay\u00e9");
    if (/\u00e7a\s+(a\s+)?march[\u00e9e]|c['\u2019]est\s+bon|r\u00e9solu|r\u00e9gl\u00e9|merci.*marche/i.test(m)) merchantClaims.push("probl\u00e8me r\u00e9solu");
    if (/erreur|error|code\s+\d{3}|message\s+d['\u2019]erreur/i.test(m)) merchantClaims.push("a fourni un message d'erreur");
    if (/https?:\/\/|\.tn|\.com|www\./i.test(m)) merchantClaims.push("a fourni une URL");
  }

  // Last question we asked (from most recent assistant message)
  let lastQuestion: string | null = null;
  if (assistantMsgs.length > 0) {
    const last = assistantMsgs[assistantMsgs.length - 1];
    const lastQ = last.match(/[^\n.!]{10,100}\?\s*$/m);
    if (lastQ) lastQuestion = lastQ[0].trim();
  }

  // Detect if merchant answered our last question
  let questionAnswered = false;
  if (questionsAsked.length > 0 && userMsgs.length > assistantMsgs.length - 1 && userMsgs.length > 0) {
    const lastUserMsg = userMsgs[userMsgs.length - 1].trim().toLowerCase();
    // Short affirmative/negative = direct answer
    if (/^(oui|non|ok|d'accord|exact|c'est (?:\u00e7a|ca|bon)|weh|la|ouais|ah?\s*oui|nn|nope|yep|yes|no|si|bien s\u00fbr|absolument|pas encore|pas du tout|voil\u00e0)\b/i.test(lastUserMsg) || lastUserMsg.length < 20) {
      questionAnswered = true;
    }
    // If user provided structured data after a question, they answered it
    if (!questionAnswered && dataProvided.length > 0 && lastUserMsg.length > 5) {
      questionAnswered = true;
    }
  }

  // Detect topic shift (merchant changes subject mid-conversation)
  let topicShifted = false;
  if (userMsgs.length >= 2) {
    const prevMsg = userMsgs[userMsgs.length - 2].toLowerCase();
    const currMsg = userMsgs[userMsgs.length - 1].toLowerCase();
    // If current message introduces a completely new keyword domain
    const topicKeywords: Record<string, RegExp> = {
      orders: /commande|order|bordereau|confirmation|annul/i,
      products: /produit|catalogue|variante|cat[eé]gorie|image|import/i,
      shipping: /livraison|colis|transporteur|tracking|exp[eé]di/i,
      settings: /domaine|dns|ssl|certificat|param[eè]tr/i,
      payments: /paiement|stripe|carte|konnect|edinar|transaction/i,
      builder: /template|design|section|banni[eè]re|header|footer|page/i,
      billing: /facture|abonnement|forfait|renouvellement/i,
    };
    let prevTopic = "";
    let currTopic = "";
    for (const [topic, re] of Object.entries(topicKeywords)) {
      if (re.test(prevMsg)) prevTopic = topic;
      if (re.test(currMsg)) currTopic = topic;
    }
    if (currTopic && prevTopic && currTopic !== prevTopic) {
      topicShifted = true;
    }
  }

  // Determine phase
  let phase: ConversationPhase;
  if (turnCount === 0 || topicShifted) {
    phase = topicShifted ? "greeting" : "greeting";
  } else if (turnCount >= 3 && [...new Set(merchantClaims)].includes("probl\u00e8me persiste")) {
    phase = "exhausted";
  } else if (stepsGiven.length > 0 && merchantClaims.some(c => c.includes("persiste") || c.includes("tout v\u00e9rifi\u00e9"))) {
    phase = "followup";
  } else if (questionAnswered && questionsAsked.length > 0) {
    // KEY FIX: Merchant answered our diagnostic question = time to prescribe!
    phase = "prescribe";
  } else if (stepsGiven.length > 0) {
    phase = "prescribe";
  } else if (turnCount >= 3 && stepsGiven.length === 0) {
    // Stuck diagnosing 3+ turns with no progress = force prescribe/exhaust
    phase = turnCount >= 4 ? "exhausted" : "prescribe";
  } else if (turnCount <= 2 && stepsGiven.length === 0) {
    phase = "diagnose";
  } else {
    phase = "diagnose";
  }

  return {
    phase, module: currentModule, turnCount,
    stepsGiven: stepsGiven.slice(-6),
    merchantClaims: [...new Set(merchantClaims)],
    questionsAsked: questionsAsked.slice(-4),
    dataProvided: [...new Set(dataProvided)],
    lastQuestion,
    questionAnswered,
    topicShifted,
  };
}

/** Build a Sidekick-style state summary injected into LLM routing hints. */
function buildHistoryStateSummary(history: HistoryMsg[], currentModule: string): string {
  if (history.length === 0) return "";
  const state = analyzeConversationState(history, currentModule);
  if (state.turnCount === 0) return "";

  const lines: string[] = [];
  lines.push(`--- \u00c9TAT CONVERSATION (phase: ${state.phase.toUpperCase()}) ---`);
  lines.push(`Module: ${state.module} | R\u00e9ponses donn\u00e9es: ${state.turnCount}`);

  if (state.dataProvided.length > 0) {
    lines.push(`DONN\u00c9ES D\u00c9J\u00c0 FOURNIES PAR LE MARCHAND (NE PAS REDEMANDER):`);
    state.dataProvided.forEach(d => lines.push(`  - ${d}`));
  }

  if (state.stepsGiven.length > 0) {
    lines.push(`\u00c9TAPES D\u00c9J\u00c0 DONN\u00c9ES (NE PAS R\u00c9P\u00c9TER):`);
    state.stepsGiven.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  }

  if (state.questionsAsked.length > 0) {
    lines.push(`QUESTIONS D\u00c9J\u00c0 POS\u00c9ES (NE PAS REDEMANDER):`);
    state.questionsAsked.forEach(q => lines.push(`  - ${q}`));
  }

  if (state.merchantClaims.length > 0) {
    lines.push(`LE MARCHAND AFFIRME: ${state.merchantClaims.join(", ")}`);
  }

  if (state.topicShifted) {
    lines.push(`\u26a0\ufe0f CHANGEMENT DE SUJET D\u00c9TECT\u00c9. Le marchand parle d'un NOUVEAU probl\u00e8me. R\u00e9ponds au nouveau sujet, pas \u00e0 l'ancien.`);
  }

  if (state.questionAnswered) {
    lines.push(`!! LE MARCHAND A R\u00c9PONDU \u00c0 TA DERNI\u00c8RE QUESTION. NE LA REPOSE PAS. Utilise sa r\u00e9ponse et AVANCE vers la solution. !!`);
  }

  switch (state.phase) {
    case "diagnose":
      lines.push(`DIRECTIVE: Phase DIAGNOSTIC. Pose 1 question cibl\u00e9e DIFF\u00c9RENTE des pr\u00e9c\u00e9dentes.`);
      break;
    case "prescribe":
      if (state.questionAnswered) {
        lines.push(`DIRECTIVE: Phase PRESCRIPTION. Le marchand a r\u00e9pondu \u00e0 ta question. DONNE 2-3 \u00c9TAPES CONCR\u00c8TES maintenant. PAS de nouvelles questions.`);
      } else {
        lines.push(`DIRECTIVE: Phase PRESCRIPTION. Assez d'infos. Donne 2-3 nouvelles \u00e9tapes concr\u00e8tes.`);
      }
      break;
    case "followup":
      lines.push(`DIRECTIVE: Le marchand revient apr\u00e8s tes \u00e9tapes. NE R\u00c9P\u00c8TE RIEN. Propose une ALTERNATIVE ou 1 question d'approfondissement.`);
      break;
    case "exhausted":
      lines.push(`DIRECTIVE: Plusieurs tentatives sans succ\u00e8s. Dernier diagnostic cibl\u00e9 OU escalade (escalate=true, verdict="tiktak_side").`);
      break;
  }

  if (state.lastQuestion) {
    lines.push(`TA DERNI\u00c8RE QUESTION: "${state.lastQuestion.slice(0, 100)}"`);
    if (state.questionAnswered) {
      lines.push(`Le marchand a r\u00e9pondu. AVANCE. Ne repose pas.`);
    } else {
      lines.push(`Si le marchand y a r\u00e9pondu, utilise sa r\u00e9ponse et ne la repose pas.`);
    }
  }

  return "\n" + lines.join("\n");
}


const BANNED_TERMS_RE = /\b(playbook|documentation|docs|notre guide|consulter le guide|consulter la doc|dans la documentation)\b/i;

/* ----------------------------- LLM call (non-streaming) ----------------------------- */

async function runStructuredChat(
  env: Env,
  currentMessage: string,
  history: HistoryMsg[],
  knowledgeContext: string,
  routingHints: string,
  maxTokens = 900,
  opts?: { turnCount?: number; sentiment?: string }
): Promise<any> {
  const messages = buildLlmMessages(currentMessage, history, knowledgeContext, routingHints, opts);
  let content = "";  // Declare before try-catch so it's accessible in catch block

  try {
    const result = (await env.AI.run(CHAT_MODEL as any, {
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    })) as any;

    content = (result?.response || "").trim();
    if (!content) {
      console.error("[parseAiResponse] Empty response from LLM");
      return {};
    }

    console.log("[parseAiResponse] Raw LLM response:", content.slice(0, 300));

    // Reconstruct JSON from prefill + model output
    // We sent: {"verdict":"
    // Model should complete it like: user_side","confidence":0.7,...}
    // Result: {"verdict":"user_side","confidence":0.7,...}
    if (content.startsWith('user_side') || content.startsWith('tiktak_side') || content.startsWith('unclear')) {
      // Model completed our prefill
      content = '{"verdict":"' + content;
    }
    
    if (!content.startsWith("{")) {
      // Wrap in braces if needed
      content = "{" + content;
    }

    // Try 1: Full JSON extraction (greedy)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("[parseAiResponse] ✓ Valid JSON parsed");
        return parsed;
      } catch (e) {
        console.warn("[parseAiResponse] JSON parse failed, attempting repair:", (e as Error).message);
        // Try 2: JSON was truncated — close it
        try {
          let truncated = jsonMatch[0];
          truncated = truncated.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, "");
          if (!truncated.endsWith("}")) truncated += "}";
          const parsed = JSON.parse(truncated);
          console.log("[parseAiResponse] ✓ Truncated JSON repaired");
          return parsed;
        } catch (e2) {
          console.warn("[parseAiResponse] JSON repair failed:", (e2 as Error).message);
        }
      }
    }

    // Try 3: Extract individual fields using regex fallback
    console.warn("[parseAiResponse] Full JSON extraction failed, using field extraction");
    const verdictMatch = content.match(/"verdict"\s*:\s*"([^"]+)"/);
    const confMatch = content.match(/"confidence"\s*:\s*([\d.]+)/);
    const catMatch = content.match(/"category"\s*:\s*"([^"]+)"/);
    const answerMatch = content.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*?)"/);
    const nextQMatch = content.match(/"next_question"\s*:\s*"((?:[^"\\]|\\.)*?)"/);
    const escMatch = content.match(/"escalate"\s*:\s*(true|false)/);

    if (verdictMatch || answerMatch) {
      console.log("[parseAiResponse] ✓ Extracted fields from malformed JSON");
      return {
        verdict: verdictMatch?.[1]?.toLowerCase() || "user_side",
        confidence: confMatch ? Math.max(0, Math.min(1, parseFloat(confMatch[1]))) : 0.7,
        category: catMatch?.[1]?.toLowerCase() || "general",
        ticket_type: content.match(/"ticket_type"\s*:\s*"([^"]+)"/)?.[1]?.toLowerCase() || "question",
        sentiment: content.match(/"sentiment"\s*:\s*"([^"]+)"/)?.[1]?.toLowerCase() || "calm",
        severity: content.match(/"severity"\s*:\s*"([^"]+)"/)?.[1]?.toLowerCase() || "medium",
        detected_language: content.match(/"detected_language"\s*:\s*"([^"]+)"/)?.[1]?.toLowerCase() || "fr",
        answer: answerMatch ? answerMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n") : "",
        next_question: nextQMatch ? nextQMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n") : null,
        escalate: escMatch?.[1] === "true" || false,
        evidence: [],
        actions: [],
      };
    }

    // Fallback: No JSON found at all — model returned pure plaintext
    console.error("[parseAiResponse] NO JSON DETECTED. LLM returned plain text:", content.slice(0, 250));
    const plainAnswer = content
      .replace(/^[{\s"]*/, "")
      .replace(/[}\s"]*$/, "")
      .trim();
    
    if (plainAnswer.length > 10) {
      console.warn("[parseAiResponse] Using plaintext as answer with defaults");
      return {
        verdict: "user_side",
        confidence: 0.5,
        category: "general",
        ticket_type: "question",
        sentiment: "calm",
        severity: "medium",
        detected_language: "fr",
        answer: plainAnswer,
        next_question: null,
        escalate: false,
        evidence: [],
        actions: [],
      };
    }

    console.error("[parseAiResponse] Response too short, returning empty");
    return {};
  } catch (e) {
    console.error("[parseAiResponse] Exception during parsing:", {
      error: (e as Error).message,
      stack: (e as Error).stack,
      contentLength: content.length,
      contentPreview: content.slice(0, 200),
    });
    return {};
  }
}

/* ----------------------------- G3 FIX: Unified post-LLM processing ----------------------------- */

/**
 * Process LLM diagnosis into a final structured response.
 * Shared between handleChat and handleChatStream — fixes G3 (duplicated post-LLM logic).
 */
function processLlmDiagnosis(opts: {
  diag: any;
  message: string;
  originalMessage: string;
  preferredModule: string;
  keywordScore: number;
  pbCtx: import("./types").RetrievalContext;
  docsCtx: import("./types").RetrievalContext;
  state: ChatState;
  t0: number;
  governance?: GovernanceSignals;
  history: HistoryMsg[];
  entities?: import("./types").ExtractedEntities;
  vision?: VisionAnalysis | null;
  // Phase 1-3 data
  topPlaybook?: PlaybookWithMetadata;
  userProfile?: UserCapabilityProfile;
  earlyVerdictResult?: any;
  llmVerdictOverride?: any;
  conversationContext?: ConversationContext;
}): any {
  const { diag, message, originalMessage, preferredModule, keywordScore, pbCtx, docsCtx, state, t0, governance, history, entities, vision,
          topPlaybook, userProfile, earlyVerdictResult, llmVerdictOverride, conversationContext } = opts;

  // ── DECISION ENGINE (deterministic-first) ──
  const decision = runDecisionEngine({
    message,
    preferredModule,
    keywordScore,
    governance,
    entities,
  });


  // --- LLM-FIRST: Trust the LLM's outputs as primary signals ---
  const llmCategory = toCoarseModule(diag?.category || preferredModule || "general");
  const decisionCategory = toCoarseModule((decision.forced.category ?? decision.category ?? llmCategory) || "general");
  const verdictRaw = toStr(diag?.verdict || "unclear");
  const llmVerdict: "user_side" | "tiktak_side" | "unclear" =
    (["user_side", "tiktak_side", "unclear"].includes(verdictRaw))
      ? (verdictRaw as "user_side" | "tiktak_side" | "unclear")
      : "unclear";
  const rawLlmConfidence = clamp01(typeof diag?.confidence === "number" ? diag.confidence : 0.5);
  const llmEscalate = diag?.escalate === true;
  const llmAnswer = typeof diag?.answer === "string" ? diag.answer : "";
  const llmNextQuestion =
    typeof diag?.next_question === "string" && diag.next_question.trim()
      ? diag.next_question.trim()
      : null;

  // --- P0 fields from LLM ---
  const VALID_TICKET_TYPES = ["bug", "question", "demand", "incident"];
  const llmTicketType = VALID_TICKET_TYPES.includes(diag?.ticket_type) ? (diag.ticket_type as any) : null;
  const VALID_SENTIMENTS = ["calm", "frustrated", "urgent", "satisfied"];
  const llmSentiment = VALID_SENTIMENTS.includes(diag?.sentiment) ? diag.sentiment : "calm";
  const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
  const llmSeverity = VALID_SEVERITIES.includes(diag?.severity) ? diag.severity : "low";
  const llmLanguage = ["fr", "ar", "darija", "en"].includes(diag?.detected_language)
    ? diag.detected_language
    : detectLanguage(message);

  // R5: Compute confidence from multiple signals
  const llmConfidence = computeConfidence({
    llmConfidence: rawLlmConfidence,
    topVectorizeScore: Math.max(pbCtx.topScore, docsCtx.topScore),
    keywordScore,
    answerLength: llmAnswer.length,
  });

  // ── GOVERNANCE POST-LLM VALIDATION ──
  // Replaces the old checkHardEscalation() with the full governance layer
  const hardEsc = checkHardEscalation(message); // backward compat
  let govOverrides: import("./governance").PostLlmOverrides = { overrideReasons: [] };
  if (governance) {
    govOverrides = validatePostLlm(governance, {
      escalate: llmEscalate,
      verdict: llmVerdict,
      category: decisionCategory,
      severity: llmSeverity,
      sentiment: llmSentiment,
      ticket_type: (decision.forced.ticket_type ?? decision.ticket_type ?? (llmTicketType as any) ?? "question"),
    });
  }
  // Escalation: governance explicit de-escalation takes priority over LLM
  const govExplicitDeescalate = govOverrides.escalate === false;
  const decisionEscalateForced = typeof decision.forced.escalate === "boolean" ? decision.forced.escalate : null;
  const decisionEscalate = decisionEscalateForced ?? decision.escalate;

  const finalEscalate = govExplicitDeescalate
    ? false
    : (govOverrides.escalate ?? false) || decisionEscalate || llmEscalate || hardEsc.triggered || (governance?.forceEscalate ?? false);

  let finalVerdict: "user_side" | "tiktak_side" | "unclear" =
    (decision.forced.verdict as any)
    ?? (govOverrides.verdict as any)
    ?? (finalEscalate ? "tiktak_side" : (decision.verdict as any) ?? llmVerdict);

  // Determine mode and finalize answer
  let mode: "solve" | "clarify" | "escalate" = "solve";
  let finalAnswer = llmAnswer;
  let nextQuestion: string | null = null;

  // Deterministic mode override: escalate/clarify based on decision engine
  if (decision.forced.mode === "escalate" || decision.mode === "escalate") {
    mode = "escalate";
  } else if ((decision.forced.mode === "clarify" || decision.mode === "clarify") && decision.ask.length) {
    mode = "clarify";
    nextQuestion = decision.ask[0];
    finalVerdict = "unclear";
  }

  // Detect how-to / informational questions that don't need diagnosis
  const isHowTo = /comment|how\s+to|tuto|explication|c['’]est\s+quoi/i.test(message) || (decision.forced.ticket_type ?? decision.ticket_type ?? llmTicketType) === "question";
  const isSubstantiveAnswer = finalAnswer.length >= 80 && (/\d+[.)]/m.test(finalAnswer) || /\*\*/m.test(finalAnswer));

  if (finalVerdict === "unclear") {
    // If the LLM gave a full answer to a how-to question, override to solve
    if (isHowTo && isSubstantiveAnswer) {
      mode = "solve";
      finalVerdict = "user_side";
      nextQuestion = null;
    } else {
      mode = "clarify";
      nextQuestion = llmNextQuestion || "Peux-tu me donner plus de d\u00e9tails ? (message d'erreur, URL ou capture d'\u00e9cran)";
      if (!finalAnswer || finalAnswer.length < 10) {
        finalAnswer = "Je veux bien t'aider ! Pour te donner la bonne solution, j'ai besoin d'une petite pr\u00e9cision.";
      }
    }
  } else if (finalEscalate) {
    mode = "escalate";
    nextQuestion = null;
    if (!finalAnswer || finalAnswer.length < 15) {
      finalAnswer = "Je comprends la situation — ça nécessite l'intervention de notre équipe technique. Je transfère ton dossier 📧";
    }
  } else {
    mode = "solve";
    nextQuestion = null;
    if (!finalAnswer || finalAnswer.length < 10) {
      finalAnswer = "Peux-tu reformuler ta question pour que je puisse mieux t'aider ?";
      mode = "clarify";
      finalVerdict = "unclear";
      nextQuestion = "Quel est exactement le problème que tu rencontres ?";
    }
  }

  // ══ GUARDRAIL 1: Diagnose-first — force clarify for vague messages without entities ══
  if (mode === "solve" && !finalEscalate) {
    const isVague = message.length < 20 ||
      /\b(ça marche pas|ne marche pas|fonctionne pas|persiste|tous est verifi|tout est verifi|toujours pareil|ne s['’]ouvre pas|marche pas|khdem|ma5dem|maykhdemch)\b/i.test(message);
    const hasEntity = Boolean(
      entities?.domain || entities?.order_id || entities?.error_message || entities?.payment_method || entities?.url
    );
    // Only force clarify on first user turn for a topic (no prior assistant answers about this)
    const priorAssistantCount = history.filter(h => h.role === "assistant").length;
    if (isVague && !hasEntity && priorAssistantCount === 0 && finalVerdict !== "tiktak_side") {
      mode = "clarify";
      finalVerdict = "unclear";
      nextQuestion = llmNextQuestion || "Tu peux préciser : sur quelle page, quel message exact tu vois, et depuis quand ?";
      if (!finalAnswer || (nextQuestion && cheapSim(finalAnswer, nextQuestion) > 0.5)) {
        finalAnswer = "Ok 👍 Pour te guider sans tourner en rond, j'ai besoin d'un détail précis.";
      }
    }
  }

  // ══ GUARDRAIL 2: No-repeat validator — block repeated answers + questions ══
  if (mode === "solve" || mode === "clarify") {
    // 2a: Check similarity against ALL previous assistant messages (not just last)
    let isRepeat = false;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "assistant") {
        const prevText = String(history[i].content || "");
        if (prevText.length > 30 && cheapSim(finalAnswer, prevText) >= 0.55) {
          isRepeat = true; break;
        }
      }
    }

    // 2b: Check if the new answer re-asks a previously asked question
    if (!isRepeat) {
      const newQuestions = finalAnswer.match(/[^\n.!]{10,100}\?/g);
      if (newQuestions) {
        const prevQuestions: string[] = [];
        for (const h of history) {
          if (h.role === "assistant") {
            const qs = String(h.content || "").match(/[^\n.!]{10,100}\?/g);
            if (qs) prevQuestions.push(...qs.map(q => q.trim()).slice(0, 3));
          }
        }
        for (const nq of newQuestions) {
          for (const pq of prevQuestions) {
            if (cheapSim(nq.trim(), pq) >= 0.45) { isRepeat = true; break; }
          }
          if (isRepeat) break;
        }
      }
    }

    if (isRepeat) {
      // Context-aware fallback using conversation state
      const convState = analyzeConversationState(history, preferredModule);
      const hasRefs = convState.dataProvided.some(d => d.includes("refs") || d.includes("commande"));
      const hasUrl = convState.dataProvided.some(d => d.includes("URL"));
      const qAnswered = convState.questionAnswered;

      if (qAnswered || convState.turnCount >= 3) {
        // Merchant already answered OR we’ve been looping — FORCE a prescription, don’t ask again
        mode = "solve";
        finalVerdict = "user_side";
        nextQuestion = null;
        // Generic opener — LLM should have filled real content, but it repeated, so fallback:
        if (convState.module === "orders" || convState.module === "shipping") {
          finalAnswer = "D'accord ! Voici ce que tu peux faire :\n1. Va dans **Commandes** sur ton dashboard TikTak\n2. Vérifie le statut de synchronisation avec le transporteur\n3. Si le statut est bloqué, clique sur **Resynchroniser** ou contacte le transporteur pour confirmer la livraison\n\nDis-moi si ça fonctionne !";
        } else if (convState.module === "settings") {
          finalAnswer = "Voici les étapes :\n1. Va dans **Paramètres > Domaines** sur ton dashboard\n2. Vérifie que les DNS pointent correctement (CNAME ou A record)\n3. Si SSL, clique sur **Regénérer le certificat**\n\nTiens-moi au courant !";
        } else if (convState.module === "products") {
          finalAnswer = "Voici ce que je te propose :\n1. Va dans **Produits** sur ton dashboard\n2. Ouvre le produit concerné et vérifie les champs obligatoires (titre, prix, stock)\n3. Sauvegarde et rafraîchis la page\n\nDis-moi ce que tu vois !";
        } else {
          finalAnswer = "Bien reçu, voici les étapes à suivre :\n1. Vérifie dans ton **Dashboard TikTak** la section concernée\n2. Teste en mode navigation privée (Ctrl+Shift+N)\n3. Si le problème persiste, envoie-moi une capture d'écran\n\nTiens-moi au courant !";
        }
      } else {
        // Still need info — but ask for something we DON’T already have
        mode = "clarify";
        finalVerdict = "unclear";
        const mod = preferredModule;
        if (mod === "orders") {
          if (hasRefs) {
            nextQuestion = "Quel statut exact vois-tu pour ces commandes dans TikTak ? (ex: en attente, annulée, erreur sync)";
          } else {
            nextQuestion = "Tu peux me donner le numéro de commande + ce que tu vois exactement (erreur, statut) ?";
          }
        } else if (mod === "settings") {
          nextQuestion = hasUrl
            ? "Quel message d'erreur exact vois-tu ? (ex: SSL 525/526, page blanche, site introuvable)"
            : "Tu peux m'envoyer le nom exact du domaine + le message affiché ?";
        } else if (mod === "shipping") {
          nextQuestion = hasRefs
            ? "Quel transporteur utilises-tu et quel statut vois-tu dans TikTak vs chez le livreur ?"
            : "Quel transporteur + quel numéro de commande / colis ? Qu'est-ce que tu vois exactement ?";
        } else if (mod === "technical") {
          nextQuestion = "Quel est le code exact (500/504/etc) + sur quelle page ? C'est intermittent ou permanent ?";
        } else if (mod === "products") {
          nextQuestion = "Quel produit exactement ? Tu peux m'envoyer le SKU ou le nom + le message d'erreur ?";
        } else if (mod === "payments" || mod === "billing") {
          nextQuestion = "Quel moyen de paiement (Stripe/PayPal/e-Dinar/COD) ? Le montant + message d'erreur exact ?";
        } else {
          nextQuestion = "Donne-moi une précision (message d'erreur / capture / depuis quand) pour cibler la solution.";
        }
        finalAnswer = "Je veux cibler la solution sans tourner en rond. J'ai besoin d'une dernière précision :";
      }
    }
  }

  // ══ GUARDRAIL 3: Banned terms filter — strip documentation/playbook references ══
  if (BANNED_TERMS_RE.test(finalAnswer)) {
    finalAnswer = finalAnswer
      .split("\n")
      .filter((l: string) => !BANNED_TERMS_RE.test(l))
      .join("\n")
      .trim() || "Je suis l\u00e0 pour t'aider \ud83d\udc4d Dis-moi ce que tu vois exactement (message d'erreur / page) et on avance.";
  }

  // ══ GUARDRAIL 4: Degeneration detector — catch repetitive/gibberish LLM output ══
  if (finalAnswer.length > 60) {
    // Detect any 3+ word sequence repeated 3+ times (token loop)
    const words = finalAnswer.split(/\s+/);
    let degenerated = false;
    outer: for (let len = 3; len <= 6; len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const ngram = words.slice(i, i + len).join(" ").toLowerCase();
        let count = 0;
        for (let j = 0; j <= words.length - len; j++) {
          if (words.slice(j, j + len).join(" ").toLowerCase() === ngram) count++;
        }
        if (count >= 3) { degenerated = true; break outer; }
      }
    }
    // Detect raw JSON fragments leaking into answer
    if (!degenerated && /\{["\s]*verdict|"category"\s*:|"confidence"\s*:/.test(finalAnswer)) {
      degenerated = true;
    }
    // Detect single word repeated 4+ times
    if (!degenerated) {
      const freq: Record<string, number> = {};
      for (const w of words) {
        const lw = w.toLowerCase().replace(/[^\p{L}]/gu, "");
        if (lw.length > 3) freq[lw] = (freq[lw] || 0) + 1;
      }
      for (const [, count] of Object.entries(freq)) {
        if (count >= 4 && count / words.length > 0.15) { degenerated = true; break; }
      }
    }
    if (degenerated) {
      console.warn("[GUARDRAIL-4] Degenerated LLM output detected, using fallback");
      finalAnswer = "Je comprends ta demande. Peux-tu me décrire le problème en détail (message d'erreur exact, page concernée) pour que je te donne la solution adaptée ?";
      mode = "clarify";
      finalVerdict = "unclear";
      nextQuestion = "Décris-moi exactement ce que tu vois : quel message d'erreur, sur quelle page, et depuis quand ?";
    }
  }

  // ── HYBRID CATEGORY RESOLVER (priority chain) ──
  // P1: Governance hard-locks (HTTP 5xx → technical, emotion → general, site_down → technical)
  // P2: Keyword detection when confident (score ≥ 3)
  // P3: RAG top-source module (when topScore ≥ 0.75 and module is clear)
  // P4: LLM category (only if not "general" when keywords/RAG disagree)
  // P5: Governance category hints (R7 fallback)
  // P6: Vague-message fallback → "general"
  let finalModule: string;

  if (govOverrides.category) {
    // P1: Governance hard-lock (HTTP 5xx, emotion, site_down)
    finalModule = govOverrides.category;
  } else if (keywordScore >= 3 && preferredModule !== "general") {
    // P2: Keyword detection is confident — trust it over LLM
    finalModule = preferredModule;
  } else {
    // P3: RAG top-source module (playbooks have module metadata)
    const ragTopScore = Math.max(pbCtx.topScore, docsCtx.topScore);
    const ragModule = inferRagTopModule(pbCtx, docsCtx);
    if (ragTopScore >= 0.75 && ragModule && ragModule !== "general") {
      // If LLM agrees with RAG, great. If LLM disagrees, trust RAG when score is strong.
      if (llmCategory === ragModule || llmCategory === "general" || ragTopScore >= 0.85) {
        finalModule = ragModule;
      } else {
        // LLM picked something specific that differs from RAG — trust LLM if keyword supports it
        finalModule = (keywordScore > 0 && preferredModule === llmCategory) ? llmCategory : ragModule;
      }
    } else if (keywordScore > 0 && preferredModule !== "general") {
      // P2b: Weaker keyword match (score 0-3) — still prefer over LLM when LLM says "general"
      if (llmCategory === "general" || llmCategory === preferredModule) {
        finalModule = preferredModule;
      } else {
        // LLM picked something specific, keywords say something else — use LLM
        finalModule = llmCategory;
      }
    } else {
      // P4: Fall back to LLM
      finalModule = llmCategory;
    }

    // P5: Governance category hints (R7 — only overrides when LLM returned generic)
    if (
      finalModule === "general" &&
      governance &&
      governance.categoryHints.length > 0 &&
      governance.categoryHints[0].confidence >= 0.7
    ) {
      finalModule = governance.categoryHints[0].module;
    }

    // P6: Vague-message protection — if no signals at all, keep "general"
    if (
      keywordScore === 0 &&
      preferredModule === "general" &&
      (!governance || governance.categoryHints.length === 0) &&
      finalModule !== "general" &&
      ragTopScore < 0.75
    ) {
      finalModule = "general";
    }
  }

  // Evidence
  const evidence = gatherEvidence(diag?.evidence || [], pbCtx, docsCtx, 6);

  // Signals
  const finalSeverity = govOverrides.severity ?? (hardEsc.triggered ? "critical" : llmSeverity);
  const finalSentiment = govOverrides.sentiment ?? llmSentiment;
  const signals = augmentSignals(
    {
      confidence: llmConfidence,
      preferredModule: finalModule,
      incident: finalEscalate,
      severity: finalSeverity,
      category: finalModule,
      sentiment: finalSentiment,
      escalation_recommended: finalEscalate,
    },
    { message }
  );

  const actions = Array.isArray(diag?.actions) ? diag.actions : [];

  // Generate direct dashboard link for the detected module
  const route_link = routeFor(finalModule, undefined);

  // State for multi-turn clarify flows
  let responseState: ChatState = state;
  if (mode === "clarify" && nextQuestion) {
    const wf: NonNullable<ChatState>["waiting_for"] =
      finalModule === "settings" ? "domain" : "error_message";
    responseState = setWaitingState(state, wf, originalMessage);
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Extract facts and track conversation state
  // ═══════════════════════════════════════════════════════════════
  // Extract confirmed facts from current message
  const lastAskedQuestion = history.length > 0 
    ? String(history[history.length - 1].content || "")
    : null;
  
  const newConfirmedFacts = extractConfirmedFacts(message, lastAskedQuestion || "");
  
  // Log Phase 3 activity
  if (Object.keys(newConfirmedFacts).length > 0) {
    console.log(`[DEBUG-PHASE3] Facts extracted: ${Object.keys(newConfirmedFacts).join(", ")}`);
  }

  return {
    mode,
    category: finalModule,
    verdict: finalVerdict,
    confidence: llmConfidence,
    answer: finalAnswer,
    next_question: nextQuestion,
    escalate: finalEscalate,
    ticket_type: (govOverrides.ticket_type as any) ?? (decision.forced.ticket_type ?? decision.ticket_type ?? (llmTicketType as any) ?? "question"),
    sentiment: finalSentiment,
    severity: finalSeverity,
    detected_language: llmLanguage,
    processing_time_ms: Date.now() - t0,
    evidence,
    signals,
    context: finalModule,
    preferredModule: finalModule,
    actions,
    route_link,
    state: responseState,

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1-3: Enhanced decision metadata (for debugging & analytics)
    // ═══════════════════════════════════════════════════════════════
    // _phase1_playbook_top_score: Best playbook relevance (0.0-1.0)
    //  - Higher = better match to user's problem
    //  - Combines: embedding (60%) + error codes (25%) + symptoms (15%)
    // _phase2_verdict_pattern_matched: Whether pattern inference found a verdict
    //  - true = early verdict used (bypassed LLM decision)
    //  - false = needs LLM verdict
    // _phase3_facts_count: Number of facts confirmed from user
    //  - Higher = better problem understanding
    //  - Used for decision quality scoring
    _phase1_playbook_top_score: topPlaybook?.relevanceScore?.toFixed(3) ?? "0.0",
    _phase2_verdict_pattern_matched: earlyVerdictResult?.pattern_matched ?? false,
    _phase3_facts_count: newConfirmedFacts ? Object.keys(newConfirmedFacts).length : 0,

    vision: vision ? {
      errorCode: vision.errorCode,
      detectedModule: vision.detectedModule,
      severity: vision.severity,
      confidence: vision.confidence,
      isErrorScreen: vision.isErrorScreen,
      suggestedAction: vision.suggestedAction,
      processingTimeMs: vision.processingTimeMs,
    } : null,
  };
}

/* ----------------------------- Shared RAG pipeline ----------------------------- */

/**
 * Common RAG pipeline used by both handleChat and handleChatStream.
 * Returns all the context needed for the LLM call and post-processing.
 */
async function runRagPipeline(env: Env, message: string, history: HistoryMsg[], tenantId: string) {
  // ── GOVERNANCE LAYER (pre-LLM, deterministic, <1ms) ──
  const governance = runGovernance(message);

  const detection = detectPreferredModule(message, history);
  let preferredModule = canonicalModule(detection.module);
  const keywordScore = detection.score;

  // Governance-enhanced module: if keyword detection yielded "general" but governance
  // has a high-confidence category hint, use it to guide RAG retrieval
  if (preferredModule === "general" && governance.categoryHints.length > 0) {
    const topHint = governance.categoryHints[0];
    if (topHint.confidence >= 0.7) {
      preferredModule = topHint.module;
    }
  }

  const modulePrefix = preferredModule !== "general" ? `MODULE=${preferredModule}\n` : "";
  const pbQuery = `${modulePrefix}${message}\n${history.slice(-5).map((h) => `${h.role}: ${h.content}`).join("\n")}`.trim();
  const docsQuery = `${message}\n${history.slice(-6).map((h) => `${h.role}: ${h.content}`).join("\n")}`.trim();

  const [pbVec, docsVec] = await Promise.all([embedText(env, pbQuery), embedText(env, docsQuery)]);
  if (!pbVec || !docsVec) return null;

  const [pbCtx, docsCtx] = await Promise.all([
    smartFetchContext(env, env.TIKTAK_PLAYBOOKS, pbVec, tenantId, preferredModule, 4, "playbook"),
    smartFetchContext(env, env.TIKTAK_KB, docsVec, tenantId, preferredModule, 7, "doc"),
  ]);

  if (preferredModule === "general" && keywordScore === 0) {
    const inferred = inferModuleFromRetrieval(pbCtx, docsCtx);
    if (inferred && inferred !== "general") preferredModule = inferred;
  }

  const entities = extractEntities(message);
  const hintParts: string[] = [];
  if (keywordScore > 0) hintParts.push(`Mots-clés → ${preferredModule} (score: ${keywordScore.toFixed(1)})`);
  if (entities.domain) hintParts.push(`Domaine: ${entities.domain}`);
  if (entities.order_id) hintParts.push(`Commande #${entities.order_id}`);
  if (entities.error_message) hintParts.push(`Erreur: "${entities.error_message.slice(0, 100)}"`);
  if (entities.payment_method) hintParts.push(`Paiement: ${entities.payment_method}`);

  // Inject governance hints into routing hints for the LLM
  const govHints = governanceToPromptHints(governance);

  const routingHints = (hintParts.length ? hintParts.join(" | ") : "") + govHints;

  const knowledgeContext = buildKnowledgeContext(preferredModule, pbCtx, docsCtx);

  return { preferredModule, keywordScore, pbCtx, docsCtx, routingHints, knowledgeContext, governance, entities };
}

/* ----------------------------- Ingest handler ----------------------------- */

export async function handleIngest(req: Request, env: Env) {
  const secret = req.headers.get("x-internal-secret");
  if (secret !== env.INTERNAL_SHARED_SECRET) {
    return json(req, { error: "unauthorized" }, 403);
  }

  const payload = await safeReadJson(req);
  if (!payload) return json(req, { error: "invalid_json" }, 400);

  const kind = toStr(payload.kind);

  // Batch playbook ingestion
  if (kind === "playbooks" && Array.isArray(payload.items)) {
    let stored = 0;
    let upserted = 0;

    for (const item of payload.items) {
      const vec = await embedText(env, item.text);
      if (!vec) continue;

      const r2Key = `playbooks/${item.tenant_id}/${item.playbook_id}.json`;
      await env.TIKTAK_DOCS.put(r2Key, JSON.stringify(item));
      stored++;

      const vecId = `${item.tenant_id}:pb:${item.playbook_id}`;
      await env.TIKTAK_PLAYBOOKS.upsert([
        {
          id: vecId,
          values: vec,
          metadata: {
            tenant_id: item.tenant_id,
            kind: "playbook",
            playbook_id: item.playbook_id,
            module: item.module,
            r2_key: r2Key,
          },
        },
      ]);
      upserted++;
    }

    return json(req, { ok: true, stored, upserted });
  }

  // Batch doc ingestion
  if (kind === "docs" && Array.isArray(payload.items)) {
    let upserted = 0;

    for (const item of payload.items) {
      const vec = await embedText(env, item.text);
      if (!vec) continue;

      const vecId = `${item.tenant_id}:doc:${item.doc_id}:${item.chunk_id}`;
      await env.TIKTAK_KB.upsert([
        {
          id: vecId,
          values: vec,
          metadata: {
            tenant_id: item.tenant_id,
            kind: "doc",
            doc_id: item.doc_id,
            chunk_id: item.chunk_id,
            module: item.module,
            text: item.text.slice(0, 500),
          },
        },
      ]);
      upserted++;
    }

    return json(req, { ok: true, upserted });
  }

  // Legacy single-item ingestion (backward compatible)
  const tenantId = toStr(payload.tenant_id);

  if (kind === "playbook") {
    const item = payload as PlaybookIngestItem;
    const vec = await embedText(env, item.text);
    if (!vec) return json(req, { error: "embedding_failed" }, 500);

    const r2Key = `playbooks/${tenantId}/${item.playbook_id}.json`;
    await env.TIKTAK_DOCS.put(r2Key, JSON.stringify(item));

    const vecId = `${tenantId}:pb:${item.playbook_id}`;
    await env.TIKTAK_PLAYBOOKS.upsert([
      {
        id: vecId,
        values: vec,
        metadata: {
          tenant_id: tenantId,
          kind: "playbook",
          playbook_id: item.playbook_id,
          module: item.module,
          r2_key: r2Key,
        },
      },
    ]);

    return json(req, { ok: true, id: vecId, r2_key: r2Key });
  }

  if (kind === "doc") {
    const item = payload as DocChunk;
    const vec = await embedText(env, item.text);
    if (!vec) return json(req, { error: "embedding_failed" }, 500);

    const vecId = `${tenantId}:doc:${item.doc_id}:${item.chunk_id}`;
    await env.TIKTAK_KB.upsert([
      {
        id: vecId,
        values: vec,
        metadata: {
          tenant_id: tenantId,
          kind: "doc",
          doc_id: item.doc_id,
          chunk_id: item.chunk_id,
          module: item.module,
          text: item.text.slice(0, 500),
        },
      },
    ]);

    return json(req, { ok: true, id: vecId });
  }

  return json(req, { error: "unknown_kind" }, 400);
}

/* ----------------------------- Chat handler ----------------------------- */

export async function handleChat(req: Request, env: Env, debug = false) {
  const payload = await safeReadJson(req);
  if (!payload) return chatJson(req, { error: "invalid_json" }, 400);

  const t0 = Date.now();
  const tenantId = toStr(payload.tenant_id || "tiktak_pro");
  const state = (payload && typeof payload === "object" ? ((payload as any).state as ChatState) : null) || null;
  const originalMessage = toStr(payload.message || "").trim();
  let message = originalMessage;
  const mergedFollowup = mergeFollowupIntoQuery(message, state);
  message = mergedFollowup.merged;
  const history: HistoryMsg[] = Array.isArray(payload.history) ? payload.history : [];
  const imageInput = toStr(payload.image || payload.image_url || "").trim();

  if (!message && !imageInput) {
    return chatJson(req, { error: "empty_message" }, 400);
  }

  // Vision: If user sent a screenshot, analyze it and augment the message
  let visionAnalysis: VisionAnalysis | null = null;
  if (imageInput) {
    visionAnalysis = await analyzeScreenshot(env, imageInput);
    if (visionAnalysis) {
      const visionContext = visionToContext(visionAnalysis);
      // Augment the message with vision context so RAG + LLM can use it
      message = message
        ? `${message}\n\n${visionContext}`
        : `Le marchand a envoyé une capture d'écran.\n\n${visionContext}`;
      
      // Log vision analysis for debugging
      console.log(`Vision: error=${visionAnalysis.errorCode}, module=${visionAnalysis.detectedModule}, confidence=${visionAnalysis.confidence}`);
    }
  }

  // Quick responses
  if (isGreetingOnly(message)) {
    return chatJson(req, {
      mode: "solve", verdict: "user_side", category: "general",
      ticket_type: "question", sentiment: "calm", severity: "low",
      detected_language: detectLanguage(message), confidence: 1,
      answer: "Salut 👋 Je suis ton assistant TikTak PRO. Décris-moi ton problème et je t'aide à le résoudre ! Si tu as un message d'erreur ou une URL, partage-les pour un diagnostic plus rapide.",
      next_question: null, escalate: false, evidence: [],
      signals: { confidence: 1, severity: "low", category: "general", sentiment: "calm", escalation_recommended: false },
      processing_time_ms: Date.now() - t0,
    });
  }

  if (isThanksOnly(message)) {
    return chatJson(req, {
      mode: "solve", verdict: "user_side", category: "general",
      ticket_type: "question", sentiment: "satisfied", severity: "low",
      detected_language: detectLanguage(message), confidence: 1,
      answer: "Avec plaisir 😊 N'hésite pas si tu as d'autres questions, je suis là pour t'aider !",
      next_question: null, escalate: false, evidence: [],
      signals: { confidence: 1, severity: "low", category: "general", sentiment: "satisfied", escalation_recommended: false },
      processing_time_ms: Date.now() - t0,
    });
  }

  // RAG pipeline
  const rag = await runRagPipeline(env, message, history, tenantId);
  if (!rag) return chatJson(req, { error: "embedding_failed" }, 500);

  const { preferredModule, keywordScore, pbCtx, docsCtx, routingHints: baseRoutingHints, knowledgeContext, governance, entities } = rag;

  // Inject history state summary into routing hints for LLM context
  const stateSummary = buildHistoryStateSummary(history, preferredModule);
  let routingHints = baseRoutingHints + stateSummary;

  // ─ Vision signals: If screenshot was analyzed, augment routing with vision insights
  let visionRoutingHints = "";
  if (visionAnalysis && visionAnalysis.confidence > 0.3) {
    visionRoutingHints = "\n[VISION ANALYSIS]\n";
    if (visionAnalysis.errorCode) {
      visionRoutingHints += `Error Detected: ${visionAnalysis.errorCode}\n`;
    }
    if (visionAnalysis.detectedModule) {
      visionRoutingHints += `Module: ${visionAnalysis.detectedModule}\n`;
    }
    if (visionAnalysis.severity) {
      visionRoutingHints += `Severity: ${visionAnalysis.severity}\n`;
    }
    if (visionAnalysis.suggestedAction) {
      visionRoutingHints += `Suggested Fix: ${visionAnalysis.suggestedAction}\n`;
    }
    routingHints += visionRoutingHints;
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // PHASE 1-3: ENHANCED DECISION-MAKING PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════════════════
  //
  // PHASE 1 (Playbook Scoring): Enhanced relevance scoring with metadata
  //  - Combines: embedding (60%) + error codes (25%) + symptoms (15%)
  //  - Ranks playbooks by relevance to user's problem
  //  - Output: scoredPlaybooks[], topPlaybook (best match)
  //
  // PHASE 2 (Verdict Inference): Pattern-based verdict detection (user_side vs tiktak_side)
  //  - Matches symptoms against 50+ known patterns
  //  - Returns early verdict if confidence >= threshold (0.75-0.85)
  //  - Else, LLM will decide
  //  - Output: llmVerdictOverride (if pattern matched with high confidence)
  //
  // PHASE 3 (User Profiling): Infers user capability level and filters playbooks
  //  - Detects: developer terms, technical knowledge, basic questions
  //  - Classifies: beginner (L0) / intermediate (L1) / advanced (L2+)
  //  - Filters out: playbooks user cannot execute (complexity, prerequisites)
  //  - Output: userProfile, filteredPlaybooks
  //
  // ERROR HANDLING: All Phase 1-3 code wrapped in try-catch
  //  - If any function throws, uses pre-initialized defaults and continues
  //  - Logs [WARN-PHASE] for debugging but doesn't crash response
  //  - Ensures graceful degradation: system returns response even if phases fail
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Initialize defaults BEFORE try block (used if Phase 1-3 throws)
  let conversationContext: ConversationContext = initializeConversationContext();
  let userProfile: UserCapabilityProfile = {
    level: "beginner",
    evidence: [],
    estimated_skills: [],
    recommended_step_level: "L0",
    needs_video: false,
    needs_coaching: false,
  };
  let scoredPlaybooks: PlaybookWithMetadata[] = [];
  let topPlaybook: PlaybookWithMetadata | undefined = undefined;
  let earlyVerdictResult: any = null;
  let llmVerdictOverride: any = null;

  try {
    // PHASE 3: Infer user capability from message + history
    userProfile = inferUserCapability(message, history as any);
    console.log(
      `[DEBUG-PHASE3] User level=${userProfile.level}, evidence=${userProfile.evidence.join(",")}`
    );

    // PHASE 1: Score playbooks with enriched metadata
    // Input: pbCtx.items = raw retrieval results
    // Output: scoredPlaybooks sorted by relevanceScore (highest first)
    const errorCodes = governance.httpError ? [governance.httpError] : [];
    scoredPlaybooks =
      (pbCtx && (pbCtx as any).items && (pbCtx as any).items.length > 0)
        ? scorePlaybooksWithMetadata((pbCtx as any).items, message, errorCodes as any)
        : [];
    if (scoredPlaybooks.length > 0) {
      console.log(
        `[DEBUG-PHASE1] Top playbook score=${scoredPlaybooks[0].relevanceScore.toFixed(3)}, id=${scoredPlaybooks[0].playbook.playbook_id}`
      );
    }

    // PHASE 3: Filter playbooks by user capability + prerequisites
    const confirmedFacts = conversationContext.confirmed_facts;
    const filteredPlaybooks: PlaybookWithMetadata[] = scoredPlaybooks.length > 0 && userProfile
      ? filterPlaybooksByUserCapability(scoredPlaybooks, userProfile.level, confirmedFacts)
      : [];
    if (filteredPlaybooks.length > 0) {
      console.log(
        `[DEBUG-PHASE3] Filtered to ${filteredPlaybooks.length}/${scoredPlaybooks.length} playbooks`
      );
    }

    // Use best filtered playbook or fall back to best scored
    topPlaybook = filteredPlaybooks[0] || scoredPlaybooks[0];

    // PHASE 2: Early verdict inference using pattern matching (no LLM)
    earlyVerdictResult = inferVerdictEarly(message, conversationContext);

    // If pattern matched with high confidence, override LLM later
    if (!earlyVerdictResult.requiresLlmDecision && earlyVerdictResult.verdict) {
      llmVerdictOverride = {
        verdict: earlyVerdictResult.verdict,
        confidence: earlyVerdictResult.confidence,
        source: "pattern_inference",
        reasoning: earlyVerdictResult.reasoning,
      };
      console.log(
        `[DEBUG-PHASE2] Early verdict=${llmVerdictOverride.verdict} confidence=${llmVerdictOverride.confidence.toFixed(3)}`
      );
    } else {
      console.log(`[DEBUG-PHASE2] No early verdict: ${earlyVerdictResult.reasoning}`);
    }
  } catch (phaseErr: any) {
    // Phase 1-3 error: log but don't crash. Continue with defaults.
    console.warn(
      `[WARN-PHASE] Phase 1-3 error (continuing with defaults): ${phaseErr?.message || String(phaseErr)}`
    );
  }

  // v7 pipeline: LLM extracts signals, engine selects playbook+step deterministically
  const extracted = await llmExtractSignals(env, message, history);

  // Merge extracted entities into existing entities (do NOT overwrite non-empty)
  const mergedEntities: any = { ...(entities as any) };
  if (extracted && typeof extracted === "object") {
    const exEnt = (extracted as any).entities;
    if (exEnt && typeof exEnt === "object") {
      for (const [k, v] of Object.entries(exEnt)) {
        if (v === undefined || v === null) continue;
        if (mergedEntities[k] === undefined || mergedEntities[k] === null || mergedEntities[k] === "") {
          mergedEntities[k] = v;
        }
      }
    }
  }

  // ─ Add vision data to extracted entities if available
  if (visionAnalysis) {
    if (visionAnalysis.errorCode && !mergedEntities.error_code) {
      mergedEntities.error_code = visionAnalysis.errorCode;
    }
    if (visionAnalysis.detectedModule && !mergedEntities.detected_module) {
      mergedEntities.detected_module = visionAnalysis.detectedModule;
    }
  }

  const selected = selectPlaybookAndStep({
    preferredModule,
    extracted: extracted ? { module: (extracted as any).module, intent_code: (extracted as any).intent_code } : undefined,
    entities: mergedEntities,
    pbCtx,
    state,
  });

  // Build a compact PLAYBOOK FOCUS block for the LLM (explain step, don't invent logic)
  let playbookFocus = "";
  if (selected.playbook_id && selected.step) {
    if ((selected.step as any).kind === "ask") {
      playbookFocus = `\n--- PLAYBOOK FOCUS ---\nPlaybook: ${selected.playbook_id}\nStep: ${(selected.step as any).step_id}\nMode: CLARIFY\nQuestion: ${(selected.step as any).question}\nMissing: ${selected.missing_required.join(", ") || "none"}\n`;
    } else if ((selected.step as any).kind === "solve") {
      const resp = String((selected.step as any).response || "").slice(0, 900);
      playbookFocus = `\n--- PLAYBOOK FOCUS ---\nPlaybook: ${selected.playbook_id}\nStep: ${(selected.step as any).step_id}\nMode: SOLVE\nInstruction: ${resp}\n`;
    } else if ((selected.step as any).kind === "escalate") {
      playbookFocus = `\n--- PLAYBOOK FOCUS ---\nPlaybook: ${selected.playbook_id}\nStep: ${(selected.step as any).step_id}\nMode: ESCALATE\nReason: ${(selected.step as any).reason}\n`;
    }
  }

  routingHints += playbookFocus;

  const entitiesV7: any = mergedEntities;
 // Debug mode
  if (debug) {
    return json(req, {
      debug: true, tenantId, preferredModule, message,
      vision: visionAnalysis ? {
        errorCode: visionAnalysis.errorCode,
        detectedModule: visionAnalysis.detectedModule,
        severity: visionAnalysis.severity,
        confidence: (visionAnalysis.confidence * 100).toFixed(0) + "%",
        isErrorScreen: visionAnalysis.isErrorScreen,
        processingTimeMs: visionAnalysis.processingTimeMs,
      } : null,
      governance: {
        escalationScore: governance.escalationScore,
        forceEscalate: governance.forceEscalate,
        emotion: governance.emotion,
        httpError: governance.httpError,
        categoryHints: governance.categoryHints,
      },
      playbooks: {
        count: pbCtx.items.length,
        avgScore: pbCtx.avgScore.toFixed(2),
        topScore: pbCtx.topScore.toFixed(2),
        items: pbCtx.items.map((i) => ({ id: i.id, score: i.score.toFixed(2), module: i.module })),
      },
      docs: {
        count: docsCtx.items.length,
        avgScore: docsCtx.avgScore.toFixed(2),
        topScore: docsCtx.topScore.toFixed(2),
        items: docsCtx.matches.slice(0, 7).map((m: any) => ({
          id: m.id,
          score: (m.score * 100).toFixed(0) + "%",
          module: m.metadata?.module,
        })),
      },
    });
  }

  // R3: Detect sentiment from history for empathy injection
  const turnCount = history.filter((h) => h.role === "user").length;
  // Use governance emotion as initial sentiment hint for empathy block
  const lastSentiment = governance.emotion.score >= 5 ? governance.emotion.sentiment : undefined;

  // AI diagnosis
  const diag = await runStructuredChat(env, message, history, knowledgeContext, routingHints, 900, {
    turnCount,
    sentiment: lastSentiment,
  });

  // Unified post-LLM processing (G3 fix) + governance validation + Phase 1-3 enhancements
  const result = processLlmDiagnosis({
    diag, message, originalMessage, preferredModule, keywordScore,
    pbCtx, docsCtx, state, t0, governance, history, entities: entitiesV7, vision: visionAnalysis,
    // Phase 1-3 data
    topPlaybook,
    userProfile,
    earlyVerdictResult,
    llmVerdictOverride,
    conversationContext,
  });

  return chatJson(req, result);
}

/* ----------------------------- Streaming Chat handler ----------------------------- */

export async function handleChatStream(req: Request, env: Env) {
  const payload = await safeReadJson(req);
  if (!payload) {
    return new Response('data: {"error":"invalid_json"}\n\n', {
      status: 400,
      headers: { "Content-Type": "text/event-stream", ...corsHeaders(req) },
    });
  }

  const t0 = Date.now();
  const tenantId = toStr(payload.tenant_id || "tiktak_pro");
  const state = (payload && typeof payload === "object" ? ((payload as any).state as ChatState) : null) || null;
  const originalMessage = toStr(payload.message || "").trim();
  let message = originalMessage;
  const mergedFollowup = mergeFollowupIntoQuery(message, state);
  message = mergedFollowup.merged;
  const history: HistoryMsg[] = Array.isArray(payload.history) ? payload.history : [];
  const imageInput = toStr(payload.image || payload.image_url || "").trim();

  if (!message && !imageInput) {
    return new Response('data: {"error":"empty_message"}\n\n', {
      status: 400,
      headers: { "Content-Type": "text/event-stream", ...corsHeaders(req) },
    });
  }

  // Vision: If user sent a screenshot, analyze it and augment the message
  let visionAnalysis: VisionAnalysis | null = null;
  if (imageInput) {
    visionAnalysis = await analyzeScreenshot(env, imageInput);
    if (visionAnalysis) {
      const visionContext = visionToContext(visionAnalysis);
      message = message
        ? `${message}\n\n${visionContext}`
        : `Le marchand a envoyé une capture d'écran.\n\n${visionContext}`;
      
      console.log(`Vision: error=${visionAnalysis.errorCode}, module=${visionAnalysis.detectedModule}, confidence=${visionAnalysis.confidence}`);
    }
  }

  // Quick responses
  if (isGreetingOnly(message) || isThanksOnly(message)) {
    const full = isGreetingOnly(message)
      ? normalizeSupportResponse({
          mode: "solve", verdict: "user_side", category: "general",
          ticket_type: "question", sentiment: "calm", severity: "low",
          detected_language: detectLanguage(message), confidence: 1,
          answer: "Salut 👋 Je suis ton assistant TikTak PRO. Décris-moi ton problème et je t'aide à le résoudre !",
          escalate: false, evidence: [], processing_time_ms: Date.now() - t0,
        })
      : normalizeSupportResponse({
          mode: "solve", verdict: "user_side", category: "general",
          ticket_type: "question", sentiment: "satisfied", severity: "low",
          detected_language: detectLanguage(message), confidence: 1,
          answer: "Avec plaisir 😊 N'hésite pas si tu as d'autres questions !",
          escalate: false, evidence: [], processing_time_ms: Date.now() - t0,
        });
    const body = `event: done\ndata: ${JSON.stringify(full)}\n\n`;
    return new Response(body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...corsHeaders(req) },
    });
  }

  // RAG pipeline (shared with handleChat)
  const rag = await runRagPipeline(env, message, history, tenantId);
  if (!rag) {
    return new Response('event: done\ndata: {"error":"embedding_failed"}\n\n', {
      status: 500,
      headers: { "Content-Type": "text/event-stream", ...corsHeaders(req) },
    });
  }

  const { preferredModule, keywordScore, pbCtx, docsCtx, routingHints: baseStreamHints, knowledgeContext, governance, entities } = rag;

  // ─ Vision signals: If screenshot was analyzed, augment routing with vision insights
  let visionRoutingHints = "";
  if (visionAnalysis && visionAnalysis.confidence > 0.3) {
    visionRoutingHints = "\n[VISION ANALYSIS]\n";
    if (visionAnalysis.errorCode) {
      visionRoutingHints += `Error Detected: ${visionAnalysis.errorCode}\n`;
    }
    if (visionAnalysis.detectedModule) {
      visionRoutingHints += `Module: ${visionAnalysis.detectedModule}\n`;
    }
    if (visionAnalysis.severity) {
      visionRoutingHints += `Severity: ${visionAnalysis.severity}\n`;
    }
    if (visionAnalysis.suggestedAction) {
      visionRoutingHints += `Suggested Fix: ${visionAnalysis.suggestedAction}\n`;
    }
  }

  // Inject history state summary into routing hints
  const streamStateSummary = buildHistoryStateSummary(history, preferredModule);
  const routingHints = baseStreamHints + streamStateSummary + visionRoutingHints;

  // R3: Detect sentiment from history for empathy injection
  const turnCount = history.filter((h) => h.role === "user").length;
  const streamSentiment = governance.emotion.score >= 5 ? governance.emotion.sentiment : undefined;

  // Build LLM messages (using shared prompt — fixes G2)
  const messages = buildLlmMessages(message, history, knowledgeContext, routingHints, { turnCount, sentiment: streamSentiment });

  // Stream the LLM response via SSE
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Launch streaming in background
  (async () => {
    let fullContent = "";
    try {
      const stream = (await env.AI.run(CHAT_MODEL as any, {
        messages,
        max_tokens: 900,
        temperature: 0.3,
        stream: true,
      })) as ReadableStream;

      const reader = stream.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = typeof value === "string" ? value : decoder.decode(value, { stream: true });

        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payloadStr = line.slice(6).trim();
          if (payloadStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payloadStr);
            const token = parsed.response || "";
            if (token) {
              fullContent += token;
              await writer.write(encoder.encode(`event: token\ndata: ${JSON.stringify({ t: token })}\n\n`));
            }
          } catch {
            // Non-JSON chunk, skip
          }
        }
      }
    } catch (e: any) {
      console.error("Stream error:", e);
    }

    // Parse completed response
    if (!fullContent.startsWith("{")) fullContent = "{" + fullContent;
    let diag: any = {};
    try {
      const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) diag = JSON.parse(jsonMatch[0]);
    } catch {
      try {
        let truncated = fullContent.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, "");
        if (!truncated.endsWith("}")) truncated += "}";
        diag = JSON.parse(truncated);
      } catch {
        const answerMatch = fullContent.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (answerMatch) {
          diag = { answer: answerMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n"), verdict: "user_side" };
        }
      }
    }

    // Unified post-LLM processing (G3 fix — same function as handleChat) + governance
    const result = processLlmDiagnosis({
      diag, message, originalMessage, preferredModule, keywordScore,
      pbCtx, docsCtx, state, t0, governance, history, entities, vision: visionAnalysis,
    });

    const donePayload = normalizeSupportResponse(result);
    await writer.write(encoder.encode(`event: done\ndata: ${JSON.stringify(donePayload)}\n\n`));
    await writer.close();
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...corsHeaders(req),
    },
  });
}
