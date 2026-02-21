// src/vision.ts — Screenshot / image analysis using Cloudflare Workers AI Vision Model
// Detects errors, modules, and suggests fixes from dashboard screenshots

import type { Env, VisionAnalysis } from "./types";

/**
 * Simple hash function for Cloudflare Workers (no crypto module available)
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).slice(0, 16);
}

const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const CACHE_TTL = 86400; // 24 hours for identical images

/**
 * Compute a hash of base64 image for caching (prevents duplicate processing)
 */
function hashImage(base64: string): string {
  return simpleHash(base64);
}

/**
 * Converts base64 data URL to URL format for Workers AI
 */
function normalizeImageInput(input: string): string {
  // If it's already a URL, return as-is
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return input;
  }

  // If it's base64 data URL (data:image/...), extract just the base64 part
  if (input.startsWith("data:")) {
    return input;
  }

  // Otherwise assume it's raw base64, wrap it
  return `data:image/png;base64,${input}`;
}

/**
 * Parse vision model response to extract structured data
 */
function parseVisionResponse(
  responseText: string,
  imageInput: string
): Partial<VisionAnalysis> {
  // Try to extract JSON from response if model returned structured format
  let structuredData: any = {};

  // Strategy 1: Look for JSON code block
  const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      structuredData = JSON.parse(jsonMatch[1]);
    } catch (e) {
      // Couldn't parse JSON
    }
  }

  // Strategy 2: Look for key-value patterns in response
  const errorCodeMatch = responseText.match(
    /error[_\s]?code[:\s]+["']?(\w+)["']?/i
  );
  const moduleMatch = responseText.match(
    /module[:\s]+["']?(\w+[-]?\w*)["']?/i
  );
  const severityMatch = responseText.match(
    /severity[:\s]+["']?(critical|high|medium|low)["']?/i
  );
  const confidenceMatch = responseText.match(/confidence[:\s]+(\d+)%?/i);

  // Extract from structured data or regex
  const errorCode = structuredData.error_code || errorCodeMatch?.[1];
  const detectedModule = 
    structuredData.detected_module || 
    moduleMatch?.[1]?.toLowerCase() || 
    null;
  const severity =
    structuredData.severity || severityMatch?.[1]?.toLowerCase();
  const confidenceStr = structuredData.confidence || confidenceMatch?.[1];

  // Determine if this is an error screen
  const isErrorScreen =
    responseText.toLowerCase().includes("error") ||
    responseText.toLowerCase().includes("failed") ||
    responseText.toLowerCase().includes("problem") ||
    !!errorCode;

  // Parse confidence (0-1 scale)
  let confidence = 0.5; // default
  if (confidenceStr) {
    const parsed = parseFloat(confidenceStr);
    if (!isNaN(parsed)) {
      confidence = parsed > 1 ? parsed / 100 : parsed;
    }
  }

  return {
    errorCode: errorCode || null,
    detectedModule,
    severity: severity as any,
    confidence: Math.min(Math.max(confidence, 0), 1),
    isErrorScreen,
    problemDescription: responseText.substring(0, 500),
    suggestedAction: structuredData.suggested_action || null,
  };
}

/**
 * Analyze a screenshot (base64, data URL, or image URL) using Workers AI Vision Model.
 * Returns structured analysis with detected errors, modules, and suggested fixes.
 * 
 * @param env - Cloudflare environment with AI binding
 * @param imageInput - Base64, data URL, or HTTP(S) image URL
 * @returns VisionAnalysis with structured error/module/severity data, or null if analysis fails
 */
export async function analyzeScreenshot(
  env: Env,
  imageInput: string
): Promise<VisionAnalysis | null> {
  if (!imageInput || !env.AI) {
    return null;
  }

  const startTime = Date.now();

  try {
    // Normalize image input
    const imageUrl = normalizeImageInput(imageInput);
    const imageHash = hashImage(imageInput);

    // Check cache first (if KV available)
    if (env.TIKTAK_CACHE) {
      try {
        const cached = await env.TIKTAK_CACHE.get(`vision:${imageHash}`, {
          type: "json",
        });
        if (cached) {
          return cached as VisionAnalysis;
        }
      } catch (e) {
        // Cache miss or error, continue with analysis
      }
    }

    // Prepare vision analysis prompt in French (matches TikTak user base)
    const analysisPrompt = `You are an expert TikTak PRO e-commerce support analyst. Analyze this screenshot from a TikTak dashboard and provide structured error detection and diagnostics.

Respond with the following information in JSON format:
{
  "error_code": "HTTP error code or error type (e.g., 502, SSL_ERROR, 404, TIMEOUT, or null if no error)",
  "detected_module": "TikTak module (products, orders, checkout, billing, customers, domains, stock, payment, shipping, categories, or null if unclear)",
  "severity": "critical|high|medium|low|null",
  "confidence": 0.0 to 1.0,
  "problem_description": "2-3 sentence description of the visible issue",
  "suggested_action": "Specific fix or next step for the user",
  "is_error_screen": true|false,
  "detected_elements": ["list", "of", "UI", "elements", "visible"]
}

ANALYSIS RULES:
1. Look for error codes (4xx, 5xx, SSL errors, timeouts)
2. Identify which TikTak module from the UI context
3. Assess severity based on impact (critical=system down, high=major feature broken, medium=reduced functionality, low=minor issue)
4. Suggest immediate actionable step
5. Be precise; if unsure, indicate lower confidence

For French text or UI, respond in English but maintain accuracy about module names.`;

    // Call Workers AI Vision Model
    const response = await env.AI.run(VISION_MODEL, {
      image: [imageUrl],
      prompt: analysisPrompt,
      temperature: 0.3, // Lower temperature for consistent error detection
      max_tokens: 500,
    } as any);

    // Extract response text
    let responseText = "";
    if (typeof response === "string") {
      responseText = response;
    } else if (response && typeof response === "object") {
      if ("result" in response && typeof response.result === "object") {
        const result = response.result as any;
        responseText = result.response || result.text || JSON.stringify(result);
      } else if ("response" in response) {
        responseText = String(response.response);
      } else if ("text" in response) {
        responseText = String(response.text);
      } else {
        responseText = JSON.stringify(response);
      }
    }

    // Parse response into structured data
    const parsed = parseVisionResponse(responseText, imageInput);

    // Build final analysis
    const analysis: VisionAnalysis = {
      imageHash,
      description: responseText,
      errorCode: parsed.errorCode,
      detectedModule: parsed.detectedModule,
      severity: parsed.severity,
      confidence: parsed.confidence ?? 0.5,
      isErrorScreen: parsed.isErrorScreen,
      problemDescription: parsed.problemDescription,
      suggestedAction: parsed.suggestedAction,
      processingTimeMs: Date.now() - startTime,
      detectedError: parsed.errorCode || null, // legacy compat
    };

    // Cache result (if KV available)
    if (env.TIKTAK_CACHE && analysis.confidence > 0.3) {
      try {
        await env.TIKTAK_CACHE.put(`vision:${imageHash}`, JSON.stringify(analysis), {
          expirationTtl: CACHE_TTL,
        });
      } catch (e) {
        // Cache write failed, continue (non-fatal)
      }
    }

    return analysis;
  } catch (error) {
    console.error("❌ Vision analysis error:", error);
    // Return null on error instead of throwing
    return null;
  }
}

/**
 * Convert vision analysis result into prose context for RAG/LLM.
 * Used to augment chat history and playbook selection.
 */
export function visionToContext(analysis: VisionAnalysis): string {
  if (!analysis) return "";

  const parts: string[] = [];

  if (analysis.description && analysis.description.length < 1000) {
    parts.push(`[Screenshot Analysis] ${analysis.description}`);
  }

  if (analysis.isErrorScreen) {
    parts.push(`⚠️ Error screen detected`);
  }

  if (analysis.errorCode) {
    parts.push(`Error Code: ${analysis.errorCode}`);
  }

  if (analysis.detectedModule) {
    parts.push(`Module: ${analysis.detectedModule}`);
  }

  if (analysis.severity) {
    parts.push(`Severity: ${analysis.severity.toUpperCase()}`);
  }

  if (analysis.problemDescription) {
    parts.push(`Problem: ${analysis.problemDescription}`);
  }

  if (analysis.suggestedAction) {
    parts.push(`Suggested Action: ${analysis.suggestedAction}`);
  }

  if (analysis.confidence !== undefined) {
    parts.push(`Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
  }

  return parts.join("\n");
}

/**
 * Determine which playbooks might be relevant based on vision analysis
 */
export function getPlaybooksForVision(analysis: VisionAnalysis): string[] {
  if (!analysis) return [];

  const playbookCandidates: string[] = [];

  // Map error codes to playbooks
  if (analysis.errorCode) {
    const errorCodeMap: Record<string, string[]> = {
      "502": ["playbook-site-errors", "playbook-global-settings"],
      "503": ["playbook-site-errors", "playbook-global-settings"],
      "504": ["playbook-site-errors", "playbook-global-settings"],
      "500": ["playbook-site-errors"],
      "403": ["playbook-domains", "playbook-ssl"],
      "401": ["playbook-auth"],
      "404": ["playbook-site-errors"],
      SSL_ERROR: ["playbook-ssl", "playbook-domains"],
      SSL: ["playbook-ssl"],
      TIMEOUT: ["playbook-global-settings"],
    };

    const code = String(analysis.errorCode).toUpperCase();
    if (errorCodeMap[code]) {
      playbookCandidates.push(...errorCodeMap[code]);
    }
  }

  // Map modules to specific playbooks
  if (analysis.detectedModule) {
    const moduleMap: Record<string, string> = {
      products: "playbook-products",
      orders: "playbook-order-management",
      checkout: "playbook-checkout-cart",
      billing: "playbook-billing",
      customers: "playbook-customers",
      domains: "playbook-domains",
      stock: "playbook-stock-inventory",
      payment: "playbook-payment",
      shipping: "playbook-shipping-fees",
      categories: "playbook-categories",
      auth: "playbook-auth",
      ssl: "playbook-ssl",
    };

    const module = analysis.detectedModule.toLowerCase();
    if (moduleMap[module]) {
      playbookCandidates.push(moduleMap[module]);
    }
  }

  // Return unique candidates
  return [...new Set(playbookCandidates)];
}

/**
 * Export VisionAnalysis type for use in routes and other modules
 */
export type { VisionAnalysis };
