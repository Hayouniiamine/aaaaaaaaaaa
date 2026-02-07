import fs from "fs";
import path from "path";

const WORKER_URL = process.env.WORKER_URL || "https://tiktak-rag-worker.hayouniamine11.workers.dev";
const SECRET = process.env.INTERNAL_SHARED_SECRET || "dev-secret";
const TENANT_ID = process.env.TENANT_ID || "tiktak_pro";

const PLAYBOOKS_DIR = process.env.PLAYBOOKS_DIR || path.resolve("./playbooks");
const DOCS_DIR = process.env.DOCS_DIR || path.resolve("./tiktak_docs");

function readText(p) {
  return fs.readFileSync(p, "utf-8");
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json")).map((f) => path.join(dir, f));
}

function basenameNoExt(p) {
  return path.basename(p).replace(/\.[^.]+$/, "");
}

function stripJsonFences(s) {
  const t = String(s || "").trim();
  // ```json ... ```
  if (t.startsWith("```")) {
    return t.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```$/m, "").trim();
  }
  return t;
}

/**
 * If playbook contains non-JSON garbage (like "Type: A ..."),
 * we fail loudly with a clear preview.
 */
function parsePossiblyFencedJson(raw, filename = "file") {
  const cleaned = stripJsonFences(raw).trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const preview = cleaned.slice(0, 120).replace(/\n/g, "\\n");
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
 * Strong embedding text (what Vectorize “sees”).
 * Keep it natural language, one trigger per line.
 */
function buildPlaybookEmbedText(pb) {
  const title = pb.title || pb.id || "playbook";
  const scope = pb.scope || "general";
  const triggers = Array.isArray(pb.triggers) ? pb.triggers : [];
  const desc = pb.description || "";

  const triggerLines = triggers.map((t) => String(t).trim()).filter(Boolean);

  return [
    `PLAYBOOK: ${title}`,
    `SCOPE: ${scope}`,
    desc ? `DESCRIPTION: ${desc}` : "",
    "TRIGGERS:",
    ...triggerLines,
  ]
    .filter(Boolean)
    .join("\n");
}

function extractDocChunks(docJson, docId) {
  const chunks = [];

  const pushText = (text, module = "general", title = docId) => {
    const t = String(text || "").trim();
    if (!t) return;

    // small chunking (safe)
    const max = 1400;
    if (t.length <= max) {
      chunks.push({ text: t, module, title });
      return;
    }

    const parts = t.split(/\n{2,}/g).map((x) => x.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.length <= max) chunks.push({ text: part, module, title });
    }
  };

  if (Array.isArray(docJson)) {
    for (const item of docJson) {
      if (!item) continue;
      if (typeof item === "string") pushText(item);
      else if (typeof item === "object") {
        pushText(item.text || item.content || item.description || JSON.stringify(item), item.module || "general", item.title || docId);
      }
    }
  } else if (typeof docJson === "object" && docJson) {
    if (docJson.text) pushText(docJson.text, docJson.module || "general", docJson.title || docId);
    else if (docJson.content) pushText(docJson.content, docJson.module || "general", docJson.title || docId);
    else if (docJson.steps) pushText(JSON.stringify(docJson.steps, null, 2), docJson.module || "general", docJson.title || docId);
    else pushText(JSON.stringify(docJson, null, 2));
  } else {
    pushText(String(docJson));
  }

  return chunks;
}

async function ingestPlaybooks() {
  const files = listJsonFiles(PLAYBOOKS_DIR);
  console.log(`📕 STEP 1: Ingesting playbooks... (${files.length} files)`);

  const items = [];

  for (const file of files) {
    const raw = readText(file);
    const pb = parsePossiblyFencedJson(raw, path.basename(file));

    // STABLE ID: never ends with .json
    const playbook_id = (pb.id || basenameNoExt(file)).replace(/\.json$/i, "");
    pb.id = playbook_id;

    // validate minimal schema
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
  }

  const out = await postIngest("playbooks", items);
  console.log("DONE Playbooks ✅", out);
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
      items.push({
        tenant_id: TENANT_ID,
        kind: "doc",
        doc_id,
        chunk_id: String(i).padStart(4, "0"),
        module: c.module || "general",
        title: c.title || doc_id,
        text: c.text,
        source: `docs/${path.basename(file)}`,
      });
    }
  }

  // batch to avoid payload limit
  const BATCH = 60;
  let stored = 0;
  let upserted = 0;

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const out = await postIngest("docs", batch);
    stored += out.stored || 0;
    upserted += out.upserted || 0;
    console.log(`✅ docs batch ${Math.floor(i / BATCH) + 1}:`, out);
  }

  console.log("DONE Docs ✅", { stored, upserted });
}

(async function main() {
  console.log("🚀 TikTak Knowledge Base Ingestion (FIXED)");
  console.log("============================================================");
  console.log("Ingest URL:", `${WORKER_URL}/admin/ingest`);
  console.log("Tenant:", TENANT_ID);
  console.log("Playbooks dir:", PLAYBOOKS_DIR);
  console.log("Docs dir:", DOCS_DIR);

  const health = await fetch(`${WORKER_URL}/health`).then((r) => r.json());
  console.log("\nHealth:", health);

  try {
    await ingestPlaybooks();
    await ingestDocs();
    console.log("\n============================================================");
    console.log("✨ Ingestion complete!");
  } catch (e) {
    console.error("\nFATAL:", e?.message || e);
    process.exit(1);
  }
})();
