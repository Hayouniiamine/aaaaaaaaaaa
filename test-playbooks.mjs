// Test script to diagnose playbook issues

const WORKER_URL = "https://tiktak-rag-worker.hayouniamine11.workers.dev";

async function testPlaybooks() {
  console.log("🔍 Diagnosing Playbook System\n");
  console.log("=" .repeat(60));
  
  // Test 1: Check worker health
  console.log("\n1️⃣ Testing worker health...");
  try {
    const healthRes = await fetch(`${WORKER_URL}/health`);
    const health = await healthRes.json();
    console.log("✅ Worker status:", JSON.stringify(health, null, 2));
    
    if (!health.bindings?.playbooks) {
      console.log("❌ PROBLEM: TIKTAK_PLAYBOOKS binding not found!");
      console.log("   Fix: Check wrangler.toml has TIKTAK_PLAYBOOKS binding");
      return;
    }
  } catch (e) {
    console.log("❌ Worker not responding:", e.message);
    return;
  }
  
  // Test 2: Send a domain query and check what happens
  console.log("\n2️⃣ Testing domain query (should match playbook)...");
  try {
    const chatRes = await fetch(`${WORKER_URL}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Mon domaine ne fonctionne pas",
        history: []
      })
    });
    
    const result = await chatRes.json();
    console.log("Response:", JSON.stringify(result, null, 2));
    
    // Check if playbook was used
    if (result.sources?.playbook) {
      console.log("✅ Playbook matched:", result.sources.playbook);
    } else {
      console.log("❌ PROBLEM: No playbook matched!");
      console.log("   This means playbooks either:");
      console.log("   - Weren't ingested to TIKTAK_PLAYBOOKS index");
      console.log("   - Have wrong format/embeddings");
      console.log("   - Triggers don't match the query");
    }
    
    // Check confidence
    if (result.confidence < 0.7) {
      console.log("⚠️  Low confidence:", result.confidence);
      console.log("   Expected 0.85+ if playbook matched");
    }
    
    // Check mode
    if (result.mode === "escalate") {
      console.log("❌ PROBLEM: Escalating (should clarify with timing question)");
      console.log("   Reason:", result.reason);
    } else if (result.mode === "clarify") {
      console.log("✅ Mode: clarify");
      console.log("   Questions:", result.questions);
      
      if (!result.questions?.some(q => q.includes("DNS") || q.includes("quand"))) {
        console.log("⚠️  Generic question - playbook not executing");
      }
    }
    
  } catch (e) {
    console.log("❌ Chat request failed:", e.message);
  }
  
  // Test 3: Try with timing in query
  console.log("\n3️⃣ Testing with timing (should reassure)...");
  try {
    const chatRes = await fetch(`${WORKER_URL}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Mon domaine ne marche pas, je l'ai configuré aujourd'hui",
        history: []
      })
    });
    
    const result = await chatRes.json();
    console.log("Response:", JSON.stringify(result, null, 2));
    
    if (result.mode === "solve" && result.answer?.includes("normal")) {
      console.log("✅ WORKING! Playbook detected < 24h and reassured");
    } else {
      console.log("❌ PROBLEM: Should have reassured (< 24h = normal)");
    }
    
  } catch (e) {
    console.log("❌ Request failed:", e.message);
  }
  
  console.log("\n" + "=" .repeat(60));
  console.log("\n📊 DIAGNOSIS SUMMARY:\n");
  console.log("If you see:");
  console.log("  ❌ 'No playbook matched' → Playbooks not ingested properly");
  console.log("  ❌ 'Generic question' → Playbook format wrong in R2");
  console.log("  ❌ 'Should have reassured' → Timing detection broken");
  console.log("\nFix: Re-run ingestion with ingest-fixed.mjs");
}

testPlaybooks().catch(console.error);
