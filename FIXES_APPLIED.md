# 🔧 AI Response Quality Fixes Applied

## Problem Identified

Your AI was returning **naive 4-option questions** instead of proper JSON:

```
❌ WRONG: "Quel type d'échange souhaitez-vous effectuer ?
(1) Créer un échange depuis le dashboard
(2) Échange en boutique POS
(3) Le client a reçu un mauvais produit
(4) Problème avec une commande d'échange existante ?"
```

**Root Cause**: LLM was returning plain text instead of JSON, causing the system to fall back to default values (verdict="user_side", category="general", confidence=0).

---

## Changes Made

### 1. **Strengthened Prompt JSON Requirement** (`src/prompt.ts`)

**Added critical warning at the top of the system prompt:**
```typescript
⚠️ CRITICAL REQUIREMENT ⚠️
YOU MUST RESPOND WITH VALID JSON ONLY. NO OTHER TEXT.
Your entire response must be a single JSON object. No preamble, no explanation after.

📋 REMEMBER: Your response MUST be valid JSON. Always. Every time. No exceptions.
```

**Improved JSON format section:**
- Made JSON structure more explicit (showing exact field types)
- Added clear examples of each field value
- Separated "forbidden" vs "allowed" responses
- Added visual emphasis: ❌ FORBIDDEN and ✅ ALLOWED

### 2. **Better Error Diagnostics** (`src/routes.ts`)

**Enhanced logging to catch JSON parsing failures:**
```typescript
// Now logs when LLM returns non-JSON text
console.warn("[parseAiResponse] LLM returned non-JSON text (fallback triggered):", plainAnswer.slice(0, 150));

// Better error context
console.error("[parseAiResponse] Error parsing LLM output:", e, "Content:", content.slice(0, 200));
```

This will help you debug WHY the LLM is not following the JSON format.

---

## Expected Improvements

After rebuild:

✅ **Verdict detection** should work (AI will return "unclear", "user_side", or "tiktak_side")
✅ **Category detection** should work (AI will return proper module category)
✅ **Confidence scores** should populate (0.0-1.0 range instead of 0)
✅ **Test report** should show better gate pass rates

---

## How to Test

### 1. Rebuild the worker
```powershell
npm run build
wrangler dev  # Start local server at localhost:8787
```

### 2. Run manual test
```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "J'\''ai un problème avec ma commande",
    "tenant_id": "tiktak_pro",
    "history": []
  }'
```

**Expected response (valid JSON):**
```json
{
  "verdict": "unclear",
  "confidence": 0.65,
  "category": "orders",
  "ticket_type": "question",
  "sentiment": "calm",
  "severity": "medium",
  "detected_language": "fr",
  "answer": "Je vois ! Pour mieux comprendre...",
  "next_question": "C'est quel type de problème ?",
  "escalate": false,
  "evidence": [],
  "actions": []
}
```

### 3. Re-run full test
```powershell
python test_conversations_v2.py --count 50
```

---

## What to Monitor

Check your worker logs for this warning:
```
[parseAiResponse] LLM returned non-JSON text (fallback triggered):
```

If you see this warning, the LLM is **still** not following the JSON format. In that case, you may need to:
- Check if Claude/GPT model supports JSON mode properly
- Add `"format": "json"` to your LLM request if available
- Use a Claude model with better JSON support (e.g., Claude 3.5)

---

## Files Modified

- ✅ `src/prompt.ts` — Stronger JSON enforcement
- ✅ `src/routes.ts` — Better error logging
- ✅ No breaking changes to other modules
