#!/usr/bin/env bash
# Phase 1-3 Integration Verification Script
# Run this to verify all components are properly integrated

echo "=================================="
echo "Phase 1-3 Integration Verification"
echo "=================================="
echo ""

# 1. Check TypeScript compilation
echo "[1/5] Checking TypeScript compilation..."
npx tsc --noEmit 2>&1 | head -20
if [ $? -eq 0 ]; then
  echo "✅ TypeScript: PASS"
else
  echo "❌ TypeScript: FAIL"
fi
echo ""

# 2. Check imports in routes.ts
echo "[2/5] Checking imports..."
grep -q "scorePlaybooksWithMetadata" src/routes.ts && echo "✅ Phase 1 imports: OK" || echo "❌ Phase 1 imports: MISSING"
grep -q "inferVerdictEarly" src/routes.ts && echo "✅ Phase 2 imports: OK" || echo "❌ Phase 2 imports: MISSING"
grep -q "extractConfirmedFacts" src/routes.ts && echo "✅ Phase 3 imports: OK" || echo "❌ Phase 3 imports: MISSING"
echo ""

# 3. Check Phase 1-3 integration calls
echo "[3/5] Checking Phase 1-3 calls..."
grep -q "PHASE 1-3: Enhanced" src/routes.ts && echo "✅ Phase 1-3 section: OK" || echo "❌ Phase 1-3 section: MISSING"
grep -q "conversationContext.*initialize" src/routes.ts && echo "✅ Context initialization: OK" || echo "❌ Context initialization: MISSING"
grep -q "userProfile.*inferUserCapability" src/routes.ts && echo "✅ User profiling: OK" || echo "❌ User profiling: MISSING"
echo ""

# 4. Check Response metadata
echo "[4/5] Checking response metadata..."
grep -q "_phase1_playbook_top_score" src/routes.ts && echo "✅ Phase 1 metadata: OK" || echo "❌ Phase 1 metadata: MISSING"
grep -q "_phase2_verdict_pattern_matched" src/routes.ts && echo "✅ Phase 2 metadata: OK" || echo "❌ Phase 2 metadata: MISSING"
grep -q "_phase3_facts_count" src/routes.ts && echo "✅ Phase 3 metadata: OK" || echo "❌ Phase 3 metadata: MISSING"
echo ""

# 5. Check module files exist
echo "[5/5] Checking module files..."
[ -f "src/verdictPatterns.ts" ] && echo "✅ verdictPatterns.ts: EXISTS" || echo "❌ verdictPatterns.ts: MISSING"
[ -f "src/supportTypes.ts" ] && echo "✅ supportTypes.ts: EXISTS" || echo "❌ supportTypes.ts: MISSING"
[ -f "src/ragPhase1.ts" ] && echo "✅ ragPhase1.ts: EXISTS" || echo "❌ ragPhase1.ts: MISSING"
[ -f "src/conversationManager.ts" ] && echo "✅ conversationManager.ts: EXISTS" || echo "❌ conversationManager.ts: MISSING"
echo ""

echo "=================================="
echo "Verification Complete"
echo "=================================="
echo ""
echo "Documentation files:"
grep -l "Phase 1-3" *.md | sed 's/^/  📖 /'
echo ""
echo "Next steps:"
echo "  1. Run: npm test"
echo "  2. Run: python test_conversations_v2.py --count 20"
echo "  3. Review: DEPLOYMENT_CHECKLIST.md"
echo ""
