// src/rag.ts — RAG pipeline, embedding, evidence gathering, confidence calculation (R5)
import type { Env, RetrievalContext, Playbook, PlaybookIngestItem } from "./types";
import { EMBED_MODEL } from "./types";
import { toStr, clamp01 } from "./helpers";
import { canonicalModule, areModulesRelated } from "./detection";

/* ----------------------------- Embedding ----------------------------- */

export async function embedText(env: Env, text: string): Promise<number[] | null> {
  try {
    const result = (await env.AI.run(EMBED_MODEL, { text })) as any;
    if (result?.data?.[0]) return result.data[0];
    return null;
  } catch {
    return null;
  }
}

/* ----------------------------- Smart context retrieval ----------------------------- */

/**
 * TikTak-optimized retrieval with module boosting.
 */
export async function smartFetchContext(
  env: Env,
  index: VectorizeIndex,
  vector: number[],
  tenantId: string,
  preferredModule: string,
  maxResults: number,
  contextType: "playbook" | "doc"
): Promise<RetrievalContext> {
  const results = await index.query(vector, {
    topK: maxResults * 3,
    filter: { tenant_id: tenantId },
    returnMetadata: "all",
  });

  const matches = results?.matches || [];

  // Score boosting: prefer items matching the preferred module
  const scoredMatches = matches.map((match) => {
    let score = match.score || 0;
    const itemModuleRaw = toStr(match.metadata?.module || "");
    const itemModule = canonicalModule(itemModuleRaw);
    const pref = canonicalModule(preferredModule);

    if (itemModule === pref) {
      score *= 1.5;
    } else if (areModulesRelated(itemModule, pref)) {
      score *= 1.2;
    }

    return { ...match, adjustedScore: score };
  });

  scoredMatches.sort((a, b) => (b.adjustedScore || 0) - (a.adjustedScore || 0));

  // Deduplicate
  const seen = new Set<string>();
  const uniqueMatches = scoredMatches.filter((m) => {
    const key = `${m.metadata?.module}-${m.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const topMatches = uniqueMatches.slice(0, maxResults);

  const scores = topMatches.map((m) => m.adjustedScore || 0);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const topScore = scores.length ? Math.max(...scores) : 0;

  // Build items array
  const items: Array<{ id: string; text: string; score: number; module: string }> = [];
  const playbooks: Array<{ id: string; playbook_id: string; playbook: any; score: number; module: string }> = [];

  if (contextType === "playbook") {
    for (const match of topMatches) {
      const r2Key = toStr(match.metadata?.r2_key || "");
      if (!r2Key) continue;
      try {
        const obj = await env.TIKTAK_DOCS.get(r2Key);
        if (!obj) continue;
        const raw = await obj.text();
        const parsed = JSON.parse(raw) as PlaybookIngestItem;
        const mod = toStr(match.metadata?.module || "");
        items.push({
          id: match.id,
          text: formatPlaybookForContext(parsed.playbook),
          score: match.adjustedScore || 0,
          module: mod,
        });
        playbooks.push({
          id: match.id,
          playbook_id: parsed.playbook_id,
          playbook: parsed.playbook,
          score: match.adjustedScore || 0,
          module: mod,
        });
      } catch {
        continue;
      }
    }
  } else {
    for (const match of topMatches) {
      items.push({
        id: match.id,
        text: toStr(match.metadata?.text || ""),
        score: match.adjustedScore || 0,
        module: toStr(match.metadata?.module || ""),
      });
    }
  }

  const text = items.map((item) => item.text).join("\n\n---\n\n");

  return { text, items, matches: topMatches, avgScore, topScore, playbooks: contextType === "playbook" ? playbooks : undefined };
}

/* ----------------------------- Playbook formatting ----------------------------- */

export function formatPlaybookForContext(playbook: Playbook): string {
  const parts: string[] = [];

  parts.push(`[PLAYBOOK: ${playbook.title || playbook.id}]`);
  if (playbook.scope) parts.push(`Module: ${playbook.scope}`);
  if (playbook.description) parts.push(`Description: ${playbook.description}`);

  if (playbook.triggers && playbook.triggers.length > 0) {
    parts.push(`Mots-clés: ${playbook.triggers.slice(0, 8).join(", ")}`);
  }

  if (playbook.scanner_setup) {
    parts.push(`\nConfiguration Scanner:`);
    for (const [key, value] of Object.entries(playbook.scanner_setup)) {
      parts.push(`- ${key}: ${value}`);
    }
  }

  if (playbook.common_errors && playbook.common_errors.length > 0) {
    parts.push(`\nErreurs Fréquentes:`);
    for (const err of playbook.common_errors.slice(0, 4)) {
      parts.push(`• Symptôme: ${err.symptom}`);
      parts.push(`  Cause: ${err.cause}`);
      parts.push(`  Solution: ${err.solution}`);
    }
  }

  if (playbook.diagnostic_checklist) {
    parts.push(`\nDiagnostic: ${JSON.stringify(playbook.diagnostic_checklist)}`);
  }

  parts.push(`\nÉtapes (${playbook.steps.length}):`);
  for (let i = 0; i < Math.min(playbook.steps.length, 6); i++) {
    const step = playbook.steps[i];
    parts.push(`${i + 1}. [${step.kind.toUpperCase()}]`);
    if (step.title) parts.push(`   ${step.title}`);

    switch (step.kind) {
      case "ask":
        parts.push(`   Q: ${step.question.slice(0, 150)}`);
        break;
      case "solve":
        parts.push(`   ${step.response.slice(0, 250)}`);
        if (step.common_errors && step.common_errors.length > 0) {
          parts.push(`   Erreurs: ${step.common_errors.slice(0, 3).join(", ")}`);
        }
        if (step.common_fixes && step.common_fixes.length > 0) {
          parts.push(`   Solutions: ${step.common_fixes.slice(0, 3).join(", ")}`);
        }
        break;
      case "escalate":
        parts.push(`   Raison: ${step.reason}`);
        break;
    }
  }

  if (playbook.best_practices && playbook.best_practices.length > 0) {
    parts.push(`\nBonnes Pratiques:`);
    playbook.best_practices.slice(0, 3).forEach((p) => parts.push(`- ${p}`));
  }

  return parts.join("\n");
}

/* ----------------------------- Evidence gathering ----------------------------- */

export function gatherEvidence(
  modelEvidence: any[],
  playbookContext: RetrievalContext,
  docsContext: RetrievalContext,
  maxEvidence: number = 6
): Array<{ source: "playbook" | "doc"; id: string; snippet: string; score: number }> {
  const evidenceMap = new Map<string, { source: "playbook" | "doc"; id: string; snippet: string; score: number }>();

  // Priority 1: Model evidence
  if (Array.isArray(modelEvidence)) {
    for (const e of modelEvidence) {
      if (!e?.id || !e?.snippet) continue;
      const source = e?.source === "playbook" ? "playbook" : "doc";
      const key = `${source}-${e.id}`;
      evidenceMap.set(key, {
        source,
        id: toStr(e.id),
        snippet: toStr(e.snippet).slice(0, 250),
        score: 1.0,
      });
    }
  }

  // Priority 2: Top playbooks
  for (const item of playbookContext.items.slice(0, 3)) {
    const key = `playbook-${item.id}`;
    if (!evidenceMap.has(key)) {
      const snippet = item.text.split("\n").slice(0, 5).join(" ").slice(0, 250);
      evidenceMap.set(key, { source: "playbook", id: item.id, snippet, score: item.score });
    }
  }

  // Priority 3: Top docs
  for (const match of docsContext.matches.slice(0, 3)) {
    const id = toStr(match?.id || "");
    const key = `doc-${id}`;
    if (!evidenceMap.has(key)) {
      const snippet = `Module: ${toStr(match?.metadata?.module || "")} | Score: ${(match?.score * 100).toFixed(0)}%`;
      evidenceMap.set(key, { source: "doc", id, snippet, score: match?.score || 0 });
    }
  }

  const allEvidence = Array.from(evidenceMap.values());
  allEvidence.sort((a, b) => b.score - a.score);
  return allEvidence.slice(0, maxEvidence);
}

/* ----------------------------- Knowledge context builder ----------------------------- */

export function buildKnowledgeContext(
  preferredModule: string,
  playbookContext: RetrievalContext,
  docsContext: RetrievalContext
): string {
  const parts: string[] = [];
  parts.push(`[Module détecté: ${preferredModule}]`);

  if (playbookContext.text.trim()) {
    parts.push("\n--- PLAYBOOKS TikTak PRO ---");
    parts.push(playbookContext.text);
  }

  if (docsContext.text.trim()) {
    parts.push("\n--- DOCUMENTATION TikTak PRO ---");
    parts.push(docsContext.text);
  }

  return parts.join("\n");
}

/* ----------------------------- R5: Confidence calculation ----------------------------- */

/**
 * R5: Compute confidence from multiple signals instead of relying solely on the LLM.
 * Factors: Vectorize topScore, keyword match score, LLM self-reported confidence,
 * and response length heuristic.
 */
export function computeConfidence(opts: {
  llmConfidence: number;
  topVectorizeScore: number;
  keywordScore: number;
  answerLength: number;
}): number {
  const { llmConfidence, topVectorizeScore, keywordScore, answerLength } = opts;

  // Weights: LLM 40%, Vectorize 30%, keyword 15%, length heuristic 15%
  const vecNorm = clamp01(topVectorizeScore);  // already 0-1
  const kwNorm = clamp01(Math.min(keywordScore / 5, 1));  // normalize to 0-1 (5+ = max)
  const lenNorm = clamp01(answerLength > 200 ? 1 : answerLength > 50 ? 0.7 : answerLength > 10 ? 0.4 : 0);

  const composite = (
    llmConfidence * 0.40 +
    vecNorm * 0.30 +
    kwNorm * 0.15 +
    lenNorm * 0.15
  );

  return clamp01(Number(composite.toFixed(2)));
}
