/**
 * test.ts — TikTak Worker diagnosis script
 *
 * What it tells you (with proof):
 * 1) Are you hitting the correct Worker URL?
 * 2) Does /admin/ingest actually write into the CURRENT bound TIKTAK_PLAYBOOKS index?
 * 3) Are playbook query results returning metadata (module/title/r2_key/kind)?
 * 4) Can the worker retrieve the playbook from R2 (via r2_key) and execute it?
 *
 * Usage (recommended):
 *   # Using tsx (easy)
 *   npm i -D tsx
 *   npx tsx test.ts
 *
 * Or with ts-node:
 *   npm i -D ts-node typescript
 *   npx ts-node test.ts
 *
 * Config via env vars:
 *   WORKER_URL="https://tiktak-rag-worker.hayouniamine11.workers.dev"
 *   INTERNAL_SHARED_SECRET="dev-secret"
 */

type Json = Record<string, any>;

const WORKER_URL = (process.env.WORKER_URL || "https://tiktak-rag-worker.hayouniamine11.workers.dev").replace(/\/+$/, "");
const SECRET = process.env.INTERNAL_SHARED_SECRET || "dev-secret";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowId() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

async function fetchText(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  return { res, text };
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ res: Response; json: any; raw: string }> {
  const { res, text } = await fetchText(url, init);
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep null, but return raw
  }
  return { res, json, raw: text };
}

function must(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function banner(title: string) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

function pretty(obj: any) {
  return JSON.stringify(obj, null, 2);
}

async function postChat(message: string, history: any[] = [], debug = false) {
  const url = `${WORKER_URL}/chat${debug ? "?debug=1" : ""}`;
  return fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
}

async function postIngest(kind: "playbooks" | "docs", items: any[]) {
  const url = `${WORKER_URL}/admin/ingest`;
  return fetchJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": SECRET,
    },
    body: JSON.stringify({ kind, items }),
  });
}

async function getHealth() {
  return fetchJson(`${WORKER_URL}/health`);
}

/**
 * Probe playbook that is guaranteed to match the user query exactly.
 * We use a unique trigger phrase, then we query debug and normal mode.
 */
function makeProbePlaybook(tenantId: string, probePhrase: string) {
  const playbookId = `probe_playbook_${nowId()}`;

  const playbook = {
    id: playbookId,
    scope: "domains",
    title: "PROBE — Domain diagnostics",
    triggers: [probePhrase],
    description: "Internal diagnostic probe playbook",
    steps: [
      {
        kind: "solve",
        condition: "dns_age < 24h",
        response:
          "PROBE_OK: dns_age < 24h branch executed. ✅\n" +
          "Action: reassure user about DNS propagation.\n" +
          "Next: ask them to wait and re-check.",
        actions: ["check_dns_propagation"],
      },
      {
        kind: "solve",
        condition: "dns_age >= 24h",
        response:
          "PROBE_OK: dns_age >= 24h branch executed. ✅\n" +
          "Action: tell user to verify A/CNAME and Nameservers and then escalate if correct.",
        actions: ["verify_dns_records", "verify_nameservers"],
      },
      {
        kind: "ask",
        question: "PROBE_ASK: Vous avez modifié les DNS quand exactement ? (il y a X heures / jours)",
      },
    ],
  };

  // embedding text MUST contain natural language + triggers
  const embedText =
    [
      "TikTak Pro Support Playbook",
      `ID: ${playbookId}`,
      "Topic: domaine / DNS",
      `Trigger: ${probePhrase}`,
      "User may say: mon domaine n'apparait pas / domaine ne fonctionne pas",
      "Decision logic: dns_age < 24h reassure; dns_age >= 24h investigate",
    ].join("\n") + "\n";

  const ingestItem = {
    tenant_id: tenantId,
    kind: "playbook",
    playbook_id: playbookId,
    module: "domains",
    title: "PROBE — domains_not_visible",
    text: embedText,
    playbook,
    source: "probe",
  };

  return { playbookId, ingestItem };
}

async function main() {
  console.log(`WORKER_URL = ${WORKER_URL}`);
  console.log(`SECRET     = ${SECRET ? "(set)" : "(missing)"}`);

  // 1) Health
  banner("1) HEALTH CHECK");
  const health = await getHealth();
  console.log("status:", health.res.status);
  console.log("body:", health.json ?? health.raw);
  must(health.res.ok, `Health endpoint failed: HTTP ${health.res.status}`);
  must(health.json?.ok === true, "Health json missing ok:true");
  must(health.json?.bindings?.playbooks === true, "bindings.playbooks is false/missing (TIKTAK_PLAYBOOKS not bound?)");

  // 2) Baseline debug query
  banner("2) BASELINE /chat?debug=1 (before probe ingest)");
  const baseline = await postChat("Mon domaine n'apparait pas", [], true);
  console.log("status:", baseline.res.status);
  console.log(pretty(baseline.json ?? baseline.raw));
  must(baseline.res.ok, `Debug chat failed: HTTP ${baseline.res.status}`);

  // 3) Ingest PROBE playbook
  banner("3) INGEST PROBE PLAYBOOK (this proves /admin/ingest -> Vectorize + R2 works)");
  const probePhrase = `zz_probe_${nowId()}_mon_domaine`;
  const tenantId = "tiktak_pro";
  const { playbookId, ingestItem } = makeProbePlaybook(tenantId, probePhrase);

  console.log("Probe phrase:", probePhrase);
  console.log("Probe playbookId:", playbookId);

  const ingest = await postIngest("playbooks", [ingestItem]);
  console.log("status:", ingest.res.status);
  console.log("body:", ingest.json ?? ingest.raw);

  must(ingest.res.ok, `Ingest failed: HTTP ${ingest.res.status}`);
  must(ingest.json?.ok === true, "Ingest response missing ok:true");
  must(Number(ingest.json?.upserted) >= 1, "Ingest did not upsert (upserted < 1) — playbooks not written to Vectorize");

  // small delay (Vectorize is usually immediate, but we give a tiny buffer)
  await sleep(350);

  // 4) Debug query using probe phrase
  banner("4) DEBUG QUERY (should show probe playbook with metadata + r2_key)");
  const dbg = await postChat(probePhrase, [], true);
  console.log("status:", dbg.res.status);
  console.log(pretty(dbg.json ?? dbg.raw));
  must(dbg.res.ok, `Debug chat failed: HTTP ${dbg.res.status}`);

  const matches: any[] = Array.isArray(dbg.json?.playbooks) ? dbg.json.playbooks : [];
  must(matches.length > 0, "❌ No playbooks matched the probe phrase. This means the worker is NOT querying the index you ingested into OR ingestion is going to a different worker URL.");

  const probeMatch = matches.find((m) => m?.id === playbookId) || matches[0];
  console.log("\nSelected match:", pretty(probeMatch));

  // Metadata presence check
  const hasR2Key = typeof probeMatch?.r2_key === "string" && probeMatch.r2_key.length > 0;
  const hasKind = typeof probeMatch?.kind === "string" && probeMatch.kind.length > 0;
  const hasModule = typeof probeMatch?.module === "string" && probeMatch.module.length > 0;
  const hasTitle = typeof probeMatch?.title === "string" && probeMatch.title.length > 0;

  console.log("\nMetadata checks:");
  console.log("r2_key :", hasR2Key ? "✅" : "❌", probeMatch?.r2_key);
  console.log("kind   :", hasKind ? "✅" : "❌", probeMatch?.kind);
  console.log("module :", hasModule ? "✅" : "❌", probeMatch?.module);
  console.log("title  :", hasTitle ? "✅" : "❌", probeMatch?.title);

  if (!hasR2Key) {
    console.log(
      "\n❌ ROOT CAUSE FOUND: Vectorize matches have NO r2_key metadata.\n" +
        "That means your worker's /admin/ingest upsert is not setting metadata properly,\n" +
        "or you are querying a different index that contains old vectors without metadata.\n"
    );
  }

  // 5) Execute playbook (normal /chat)
  banner("5) EXECUTE PLAYBOOK (normal /chat, must return PROBE_OK or PROBE_ASK)");
  const exec1 = await postChat(`${probePhrase}. J’ai modifié les DNS il y a 2 heures`, [], false);
  console.log("status:", exec1.res.status);
  console.log(pretty(exec1.json ?? exec1.raw));
  must(exec1.res.ok, `Chat failed: HTTP ${exec1.res.status}`);

  const ans = exec1.json?.answer ?? exec1.json?.questions?.join("\n") ?? "";
  const textAns = typeof ans === "string" ? ans : JSON.stringify(ans);

  if (textAns.includes("PROBE_OK: dns_age < 24h")) {
    console.log("\n✅ Playbook executed the <24h solve branch correctly.");
  } else if (textAns.includes("PROBE_OK: dns_age >= 24h")) {
    console.log("\n✅ Playbook executed the >=24h solve branch correctly.");
  } else if (textAns.includes("PROBE_ASK")) {
    console.log("\n⚠️ Playbook ran, but asked for DNS timing (dns_age not detected). Timing extraction may be failing.");
  } else if (exec1.json?.reason === "playbook_metadata_missing_r2_key") {
    console.log(
      "\n❌ ROOT CAUSE CONFIRMED: playbook matched, but worker cannot load it from R2 because r2_key is missing.\n" +
        "Fix ingestion metadata or ensure you re-ingest AFTER switching bindings.\n"
    );
  } else {
    console.log(
      "\n⚠️ Unexpected response. The playbook may not be selected/executed.\n" +
        "Check if the worker’s playbook threshold is too high OR if debug is showing a different playbook than expected.\n"
    );
  }

  // 6) Quick summary
  banner("6) SUMMARY (what to fix based on what you saw)");
  if (matches.length === 0) {
    console.log(
      "❌ No playbook matched the probe phrase.\n" +
        "Most likely causes:\n" +
        "1) You ingested to a different URL than WORKER_URL\n" +
        "2) You deployed a worker that is bound to playbooks-v2, but you ingested into old bindings\n" +
        "3) /admin/ingest is not upserting into env.TIKTAK_PLAYBOOKS at all\n"
    );
  } else if (!hasR2Key) {
    console.log(
      "❌ Playbook matches exist but metadata is missing (especially r2_key).\n" +
        "Most likely causes:\n" +
        "1) You are querying old vectors in the index created before you added metadata\n" +
        "   → Create a fresh index and re-ingest everything (you already did: v2) BUT ingest AFTER deploy.\n" +
        "2) Your /admin/ingest upsert payload is missing metadata fields.\n"
    );
  } else {
    console.log(
      "✅ Playbook indexing + metadata looks correct.\n" +
        "If the UI still feels dumb, the next bottleneck is:\n" +
        "- playbook logic (conditions/questions)\n" +
        "- timing extraction in worker (dns_age parsing)\n" +
        "- and finally doc RAG coverage.\n"
    );
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("\nFATAL:", e?.message || e);
  process.exit(1);
});
