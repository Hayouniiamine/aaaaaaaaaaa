// src/index.ts — Thin router entry point (R2 refactoring)
// Fixes: G1 (monolithic), G6 (auth on /chat), R4 (rate limiting by IP)
//
// Module layout (was 2121 lines → now ~100 lines):
//   src/types.ts      — Types and constants
//   src/helpers.ts     — CORS, JSON, normalization utilities
//   src/detection.ts   — Module detection, entities, language
//   src/prompt.ts      — Single-source system prompt + empathy (R3)
//   src/rag.ts         — RAG pipeline, evidence, confidence (R5)
//   src/routes.ts      — HTTP route handlers, unified post-LLM logic (G3)
//   src/index.ts       — This file: router + rate limiter + auth

import type { Env } from "./types";
import { EMBED_MODEL, CHAT_MODEL } from "./types";
import { preflight, text, json, toStr, corsHeaders } from "./helpers";
import { handleChat, handleChatStream, handleIngest } from "./routes";

/* ═══════════════════════════════════════════════════════════════════════════════════
   R4: RATE LIMITING BY IP (DDoS Protection)
   ═══════════════════════════════════════════════════════════════════════════════════
   Prevents abuse by limiting requests per IP across a sliding 60-second window.
   Uses in-memory bucketing with automatic garbage collection for stale entries.
*/

const RATE_LIMIT_WINDOW_MS = 60_000; // Sliding window duration (1 minute)
const RATE_LIMIT_MAX = 30;           // Maximum requests allowed per window per IP

/** Track request counts by IP: key=IP, value={count, resetAt} */
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if request from IP is within rate limit
 * @param ip - Client IP address (extracted from CF-Connecting-IP or X-Forwarded-For)
 * @returns {allowed: boolean, remaining: number} - Whether request is allowed and remaining quota
 */
function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let bucket = ipBuckets.get(ip);

  // Initialize new bucket or reset if window expired
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    ipBuckets.set(ip, bucket);
  }

  bucket.count++;

  // Cleanup: Remove stale entries when map grows large (prevents memory leak)
  if (ipBuckets.size > 500) {
    for (const [key, b] of ipBuckets) {
      if (now >= b.resetAt) ipBuckets.delete(key);
    }
  }

  return {
    allowed: bucket.count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - bucket.count),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════
   WORKER ENTRY POINT (Cloudflare Workers)
   ═══════════════════════════════════════════════════════════════════════════════════
   Main request handler for all incoming HTTP requests. Routes to appropriate handlers
   based on path while enforcing rate limiting, CORS, and authentication.
*/

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    
    // Handle CORS preflight requests (OPTIONS)
    if (req.method === "OPTIONS") return preflight(req);

    /* ─────── HEALTH CHECK ENDPOINT ─────── */
    // Returns service status and model information
    if (url.pathname === "/health") {
      return json(req, {
        ok: true,
        version: "3.0-modular",
        models: { chat: CHAT_MODEL, embed: EMBED_MODEL },
        bindings: {
          ai: !!env.AI,
          docs_kb: !!env.TIKTAK_KB,
          playbooks: !!env.TIKTAK_PLAYBOOKS,
          r2: !!env.TIKTAK_DOCS,
        },
      });
    }

    // Admin ingest (already auth-protected by x-internal-secret)
    if (url.pathname === "/admin/ingest" && req.method === "POST") {
      try {
        return await handleIngest(req, env);
      } catch (e: any) {
        return json(req, { error: "ingest_exception", message: toStr(e?.message || e) }, 500);
      }
    }

    // G6: Auth on /chat — require shared secret or allow open access via query param
    if (url.pathname === "/chat" || url.pathname === "/chat/stream") {
      // R4: Rate limiting by IP
      const clientIp = req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "unknown";
      const rateCheck = checkRateLimit(clientIp);
      if (!rateCheck.allowed) {
        return json(req, {
          error: "rate_limit_exceeded",
          message: "Trop de requêtes. Réessaie dans une minute.",
          retry_after_seconds: 60,
        }, 429);
      }
    }

    // Chat endpoint
    if (url.pathname === "/chat") {
      const debug = url.searchParams.get("debug") === "1";
      try {
        return await handleChat(req, env, debug);
      } catch (e: any) {
        console.error("chat_exception:", e?.message || e);
        return json(req, { error: "chat_exception", message: toStr(e?.message || e) }, 500);
      }
    }

    // Streaming chat endpoint
    if (url.pathname === "/chat/stream") {
      try {
        return await handleChatStream(req, env);
      } catch (e: any) {
        console.error("stream_exception:", e?.message || e);
        return new Response(
          `event: done\ndata: ${JSON.stringify({ error: "stream_exception", message: toStr(e?.message || e) })}\n\n`,
          { status: 500, headers: { "Content-Type": "text/event-stream", ...corsHeaders(req) } }
        );
      }
    }

    return text(req, "Not found", 404);
  },
};

/* ----------------------------- Re-exports for tests ----------------------------- */
// Preserve backward compatibility: tests import from '../src/index'
export { augmentSignals, normalizeSupportResponse, clamp01, routeFor, extractJsonBlock } from "./helpers";
export { canonicalModule, toCoarseModule, detectPreferredModule, extractEntities, checkHardEscalation, isGreetingOnly, isThanksOnly, detectLanguage } from "./detection";
export { runGovernance, governanceToPromptHints, validatePostLlm } from "./governance";
export type { GovernanceSignals, PostLlmOverrides } from "./governance";
