import fs from "fs";
import path from "path";

const WORKER_URL =
  process.env.WORKER_URL ||
  "https://tiktak-rag-worker.hayouniamine11.workers.dev";
const SECRET = process.env.INTERNAL_SHARED_SECRET || "dev-secret";
const TENANT_ID = process.env.TENANT_ID || "tiktak_pro";

const PLAYBOOKS_DIR = process.env.PLAYBOOKS_DIR || path.resolve("./playbooks");
const DOCS_DIR = process.env.DOCS_DIR || path.resolve("./tiktak_docs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readText(p) {
  return fs.readFileSync(p, "utf-8");
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .map((f) => path.join(dir, f));
}

function basenameNoExt(p) {
  return path.basename(p).replace(/\.[^.]+$/, "");
}

function stripJsonFences(s) {
  const t = String(s || "").trim();
  if (t.startsWith("```")) {
    return t
      .replace(/^```[a-zA-Z]*\s*/m, "")
      .replace(/```$/m, "")
      .trim();
  }
  return t;
}

function parsePossiblyFencedJson(raw, filename = "file") {
  const cleaned = stripJsonFences(raw).trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const preview = cleaned.slice(0, 160).replace(/\n/g, "\\n");
    throw new Error(`Invalid JSON in ${filename}. Preview: ${preview}`);
  }
}

async function postIngest(kind, items) {
  const res = await fetch(`${WORKER_URL}/admin/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": SECRET,
    },
    body: JSON.stringify({ kind, items }),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`/admin/ingest failed ${res.status}: ${txt}`);
  return JSON.parse(txt);
}

/**
 * Enhanced playbook text builder - extracts all relevant fields for better embedding
 */
function buildPlaybookEmbedText(pb) {
  const title = pb.title || pb.id || "playbook";
  const scope = pb.scope || "general";
  const triggers = Array.isArray(pb.triggers) ? pb.triggers : [];
  const desc = pb.description || "";

  const parts = [
    `PLAYBOOK: ${title}`,
    `MODULE: ${scope}`,
    desc ? `DESCRIPTION: ${desc}` : "",
    "",
    "TRIGGERS:",
    ...triggers.map((t) => `- ${String(t).trim()}`),
    "",
  ];

  if (Array.isArray(pb.steps)) {
    parts.push("STEPS:");
    pb.steps.forEach((step, idx) => {
      parts.push(`\n[Step ${idx + 1}] ${String(step.kind || "").toUpperCase()}`);

      if (step.kind === "ask") {
        parts.push(String(step.question || "").trim());
      } else if (step.kind === "solve") {
        const response = String(step.response || "");
        const responsePreview = response.substring(0, 300);
        parts.push(responsePreview);

        if (step.success_indicator) parts.push(`SUCCESS: ${step.success_indicator}`);
        if (step.time_estimate) parts.push(`TIMING: ${step.time_estimate}`);

        if (Array.isArray(step.common_errors)) {
          parts.push("ERRORS:", ...step.common_errors.map((e) => `- ${e}`));
        }

        if (Array.isArray(step.actions)) {
          parts.push("ACTIONS:", ...step.actions.map((a) => `- ${a}`));
        }
      } else if (step.kind === "escalate") {
        parts.push(`REASON: ${step.reason || ""}`);
        if (Array.isArray(step.required_info)) {
          parts.push("REQUIRED INFO:", ...step.required_info.map((i) => `- ${i}`));
        }
      }
    });
  }

  if (Array.isArray(pb.best_practices) && pb.best_practices.length > 0) {
    parts.push("", "BEST PRACTICES:");
    pb.best_practices.forEach((p) => parts.push(`- ${p}`));
  }

  if (Array.isArray(pb.common_workflows) && pb.common_workflows.length > 0) {
    parts.push("", "COMMON WORKFLOWS:");
    pb.common_workflows.forEach((w) => parts.push(`- ${w}`));
  }

  if (Array.isArray(pb.related_docs) && pb.related_docs.length > 0) {
    parts.push("", "RELATED DOCS:");
    pb.related_docs.forEach((d) => parts.push(`- ${d}`));
  }

  if (Array.isArray(pb.common_errors) && pb.common_errors.length > 0) {
    parts.push("", "COMMON ISSUES:");
    pb.common_errors.forEach((err) => {
      parts.push(`SYMPTOM: ${err.symptom || ""}`);
      parts.push(`CAUSE: ${err.cause || ""}`);
      parts.push(`SOLUTION: ${err.solution || ""}`);
      parts.push("");
    });
  }

  if (pb.diagnostic_checklist && typeof pb.diagnostic_checklist === "object") {
    parts.push("", "DIAGNOSTIC CHECKLIST:");
    Object.entries(pb.diagnostic_checklist).forEach(([key, value]) => {
      parts.push(`${key}:`);
      if (Array.isArray(value)) value.forEach((v) => parts.push(`- ${v}`));
      else if (typeof value === "object") parts.push(JSON.stringify(value, null, 2));
      else parts.push(String(value));
    });
  }

  return parts.filter(Boolean).join("\n");
}

/**
 * ✅ Enhanced chunking that never drops text.
 * - Splits by paragraphs first
 * - If a paragraph is still too big, hard-splits into windows
 */
function extractDocChunks(docJson, docId) {
  const chunks = [];
  const MAX = 1400;

  const pushChunked = (text, module = "general", title = docId) => {
    const t = String(text || "").replace(/\r/g, "").trim();
    if (!t) return;

    const parts = t.split(/\n{2,}/g).map((x) => x.trim()).filter(Boolean);
    const effectiveParts = parts.length <= 1 ? [t] : parts;

    for (const part of effectiveParts) {
      const p = String(part || "").trim();
      if (!p) continue;

      if (p.length <= MAX) {
        chunks.push({ text: p, module, title });
        continue;
      }

      for (let i = 0; i < p.length; i += MAX) {
        const slice = p.slice(i, i + MAX).trim();
        if (slice) chunks.push({ text: slice, module, title });
      }
    }
  };

  if (Array.isArray(docJson)) {
    for (const item of docJson) {
      if (!item) continue;

      if (typeof item === "string") {
        pushChunked(item);
        continue;
      }

      if (typeof item === "object") {
        const textParts = [];

        if (item.nom) textParts.push(`NOM: ${item.nom}`);
        if (item.title) textParts.push(`TITLE: ${item.title}`);
        if (item.description) textParts.push(`DESCRIPTION: ${item.description}`);
        if (item.lien) textParts.push(`URL: ${item.lien}`);

        if (Array.isArray(item.actions)) {
          textParts.push("\nACTIONS:");
          item.actions.forEach((action) => {
            if (action?.label) textParts.push(`\n${action.label}:`);
            if (Array.isArray(action?.instructions)) {
              textParts.push(...action.instructions.map((i) => `- ${i}`));
            }
            if (action?.resultat) textParts.push(`RÉSULTAT: ${action.resultat}`);
            if (action?.notes) textParts.push(`NOTES: ${action.notes}`);
          });
        }

        if (Array.isArray(item.problemes_recurrents)) {
          textParts.push("\nPROBLÈMES FRÉQUENTS:");
          item.problemes_recurrents.forEach((prob) => {
            textParts.push(`SYMPTÔME: ${prob.symptome || ""}`);
            textParts.push(`CAUSE: ${prob.cause_probable || ""}`);
            textParts.push(`SOLUTION: ${prob.solution || ""}`);
            textParts.push("");
          });
        }

        const combinedText = textParts.join("\n");
        if (combinedText.trim()) {
          pushChunked(
            combinedText,
            item.module || "general",
            item.title || item.nom || docId
          );
          continue;
        }

        pushChunked(
          item.text ||
            item.content ||
            item.description ||
            JSON.stringify(item, null, 2),
          item.module || "general",
          item.title || docId
        );
      }
    }
    return chunks;
  }

  if (typeof docJson === "object" && docJson) {
    if (docJson.text) pushChunked(docJson.text, docJson.module || "general", docJson.title || docId);
    else if (docJson.content) pushChunked(docJson.content, docJson.module || "general", docJson.title || docId);
    else if (docJson.steps) pushChunked(JSON.stringify(docJson.steps, null, 2), docJson.module || "general", docJson.title || docId);
    else pushChunked(JSON.stringify(docJson, null, 2));
    return chunks;
  }

  pushChunked(String(docJson));
  return chunks;
}

async function ingestPlaybooks() {
  const files = listJsonFiles(PLAYBOOKS_DIR);
  console.log(`📕 STEP 1: Ingesting enhanced playbooks... (${files.length} files)`);

  const items = [];

  for (const file of files) {
    const raw = readText(file);
    const pb = parsePossiblyFencedJson(raw, path.basename(file));

    const playbook_id = (pb.id || basenameNoExt(file)).replace(/\.json$/i, "");
    pb.id = playbook_id;

    if (!Array.isArray(pb.steps) || pb.steps.length === 0) {
      console.log(`⚠️ Skipping invalid playbook: ${path.basename(file)} (missing steps[])`);
      continue;
    }

    const module = pb.scope || pb.module || "general";
    const title = pb.title || playbook_id;

    const text = buildPlaybookEmbedText(pb);

    items.push({
      tenant_id: TENANT_ID,
      kind: "playbook",
      playbook_id,
      module,
      title,
      text,
      playbook: pb,
      source: `playbooks/${path.basename(file)}`,
    });

    console.log(
      `  ✓ ${playbook_id} (${module}) - ${pb.steps.length} steps, ${(text.length / 1024).toFixed(
        1
      )}KB embed text`
    );
  }

  const out = await postIngest("playbooks", items);
  console.log("DONE Playbooks ✅", out);
}


function inferModuleFromDocId(docId) {
  const id = String(docId || "").toLowerCase();

  if (id.includes("domain")) return "domains";
  if (id.includes("ssl")) return "ssl";
  if (id.includes("coupon")) return "coupons";
  if (id.includes("payment")) return "checkout";
  if (id.includes("checkout")) return "checkout";
  if (id.includes("order")) return "orders";
  if (id.includes("pos")) return "pos";
  if (id.includes("template")) return "templates";
  if (id.includes("settings")) return "settings";
  if (id.includes("module")) return "modules";
  if (id.includes("customer")) return "customers";
  if (id.includes("product")) return "products";
  if (id.includes("return")) return "returns";
  if (id.includes("complaint")) return "complaints";

  return "general";
}

async function ingestDocs() {
  const files = listJsonFiles(DOCS_DIR);
  console.log(`📖 STEP 2: Ingesting docs... (${files.length} files)`);

  const items = [];
  for (const file of files) {
    const raw = readText(file);
    const docJson = parsePossiblyFencedJson(raw, path.basename(file));

    const doc_id = basenameNoExt(file);
    const extracted = extractDocChunks(docJson, doc_id);

    let i = 0;
    for (const c of extracted) {
      i++;
      const chunk_id = String(i).padStart(4, "0");

      // Deterministic, debuggable chunk key (Worker will store to R2 using this pattern)
      const chunk_key = `docs/${TENANT_ID}/${doc_id}/${chunk_id}.json`;

      items.push({
        tenant_id: TENANT_ID,
        kind: "doc",
        doc_id,
        chunk_id,
        module: inferModuleFromDocId(doc_id),
        title: c.title || doc_id,
        text: c.text,
        source: `docs/${path.basename(file)}`,
        chunk_key, // ✅ extra field: harmless if Worker ignores it
      });
    }

    console.log(`  ✓ ${doc_id} - ${extracted.length} chunks`);
  }

  // ✅ throttle + smaller batches to avoid Worker 1101 (AI embedding per item)
  const BATCH = Number(process.env.BATCH || 10); // if still throws 1101, set to 5
  let stored = 0;
  let upserted = 0;

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const out = await postIngest("docs", batch);
    stored += out.stored || 0;
    upserted += out.upserted || 0;
    console.log(
      `  ✅ docs batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(items.length / BATCH)}:`,
      out
    );
    await sleep(250);
  }

  console.log("DONE Docs ✅", { stored, upserted, total_chunks: items.length });
}

(async function main() {
  console.log("🚀 TikTak Knowledge Base Ingestion (ENHANCED)");
  console.log("============================================================");
  console.log("Ingest URL:", `${WORKER_URL}/admin/ingest`);
  console.log("Tenant:", TENANT_ID);
  console.log("Playbooks dir:", PLAYBOOKS_DIR);
  console.log("Docs dir:", DOCS_DIR);
  console.log("");

  const health = await fetch(`${WORKER_URL}/health`).then((r) => r.json());
  console.log("Health check:", health.ok ? "✅ OK" : "❌ FAILED");
  console.log("  - AI:", health.bindings?.ai ? "✅" : "❌");
  console.log("  - Docs KB:", health.bindings?.docs_kb ? "✅" : "❌");
  console.log("  - Playbooks:", health.bindings?.playbooks ? "✅" : "❌");
  console.log("  - R2:", health.bindings?.r2 ? "✅" : "❌");
  console.log("");

  if (!health.ok) {
    console.error("❌ Health check failed, aborting ingestion");
    process.exit(1);
  }

  try {
    await ingestPlaybooks();
    console.log("");
    await ingestDocs();
    console.log("");
    console.log("============================================================");
    console.log("✨ Ingestion complete!");
    console.log("");
    console.log("Next steps:");
    console.log(`  1) Test with: curl '${WORKER_URL}/chat?debug=1' \\`);
    console.log("       -H 'content-type: application/json' \\");
    console.log(`       -d '{\"message\":\"mon domaine ne marche pas\",\"tenant_id\":\"${TENANT_ID}\",\"history\":[]}'`);
    console.log("");
  } catch (e) {
    console.error("\n❌ FATAL:", e?.message || e);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
})();
