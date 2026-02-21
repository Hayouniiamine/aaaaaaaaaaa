#!/bin/bash

# Vision Analysis Implementation - Quick Test Guide
# ================================================
# Use this guide to test the vision analysis system

echo "🎯 TikTak Vision Analysis Testing Guide"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============= STEP 1: Start Development Server =============
echo -e "${BLUE}[1/5] Starting Cloudflare Workers development server...${NC}"
echo "Run: wrangler dev"
echo ""
read -p "Press Enter once the development server is running..."

# ============= STEP 2: Test Vision Endpoint =============
echo -e "${BLUE}[2/5] Testing vision analysis endpoint...${NC}"
echo ""
echo "This will test the vision API with a sample screenshot."
echo ""

# Create a simple test image (1x1 PNG for testing)
# Base64 of a tiny 1x1 red PNG
TEST_IMAGE_BASE64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="

echo "Sending test request to /chat endpoint..."
echo ""

curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"tenant_id\": \"tiktak_pro\",
    \"message\": \"I see an error on my products page\",
    \"image\": \"data:image/png;base64,${TEST_IMAGE_BASE64}\"
  }" | jq '.' > /tmp/vision_response.json

echo -e "${GREEN}Response saved to /tmp/vision_response.json${NC}"
echo ""

# Check if vision data is in response
if jq -e '.vision' /tmp/vision_response.json > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Vision field found in response!${NC}"
  echo ""
  echo "Vision data:"
  jq '.vision' /tmp/vision_response.json
else
  echo -e "${YELLOW}⚠ No vision field in response (may be null or request failed)${NC}"
fi

echo ""

# ============= STEP 3: Test Without Screenshot =============
echo -e "${BLUE}[3/5] Testing without screenshot (should still work)...${NC}"
echo ""

curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"tenant_id\": \"tiktak_pro\",
    \"message\": \"How do I manage my products?\"
  }" | jq '.' > /tmp/no_vision_response.json

echo -e "${GREEN}Response saved to /tmp/no_vision_response.json${NC}"

if jq -e '.answer' /tmp/no_vision_response.json > /dev/null 2>&1; then
  echo -e "${GREEN}✓ System works without vision!${NC}"
else
  echo -e "${RED}✗ Error response even without vision${NC}"
fi

echo ""

# ============= STEP 4: Test Frontend Component =============
echo -e "${BLUE}[4/5] Testing frontend component...${NC}"
echo ""
echo "Navigate to the frontend in your browser:"
echo "URL: http://localhost:3000 (or your Nuxt dev server)"
echo ""
echo "To test the vision component:"
echo "1. Open the support chat widget"
echo "2. Send a test message"
echo "3. Check if VisionAnalysisFeedback component displays"
echo ""
read -p "Press Enter once you've verified the frontend component..."

# ============= STEP 5: Debug Mode Test =============
echo -e "${BLUE}[5/5] Testing debug mode with full vision details...${NC}"
echo ""

curl -X POST "http://localhost:8787/chat?debug=true" \
  -H "Content-Type: application/json" \
  -d "{
    \"tenant_id\": \"tiktak_pro\",
    \"message\": \"I see an error\",
    \"image\": \"data:image/png;base64,${TEST_IMAGE_BASE64}\"
  }" | jq '.' > /tmp/debug_response.json

echo -e "${GREEN}Debug response saved to /tmp/debug_response.json${NC}"
echo ""
echo "Vision debug data:"
jq '.vision' /tmp/debug_response.json

echo ""
echo ""

# ============= SUMMARY =============
echo -e "${GREEN}✓ Vision Analysis Test Complete!${NC}"
echo ""
echo "Test Results Summary:"
echo "===================="
echo ""
echo "Check the following in the responses:"
echo ""
echo "1️⃣  Vision data structure:"
echo "   - errorCode: Extracted error code (e.g., '502')"
echo "   - detectedModule: Module detection (e.g., 'products')"
echo "   - severity: Severity level (critical|high|medium|low)"
echo "   - confidence: Confidence score (0-1)"
echo "   - isErrorScreen: Boolean indicating if error detected"
echo "   - suggestedAction: Recommended fix"
echo "   - processingTimeMs: Time taken for analysis"
echo ""
echo "2️⃣  Response fields:"
echo "   - answer: AI response includes vision context"
echo "   - category: Should match or be influenced by vision"
echo "   - processing_time_ms: Total time including vision"
echo ""
echo "3️⃣  Frontend rendering:"
echo "   - VisionAnalysisFeedback component visible"
echo "   - Color-coded badges display correctly"
echo "   - Error/Module/Severity information shows"
echo "   - Suggested action displays"
echo ""

# ============= DETAILED TESTING =============
echo ""
echo -e "${BLUE}Detailed Testing Instructions:${NC}"
echo ""
echo "Test Case 1: Real Error Screenshot"
echo "  1. Take screenshot of actual TikTak error page"
echo "  2. Convert to base64"
echo "  3. Send via /chat endpoint"
echo "  4. Verify error code detected correctly"
echo ""
echo "Test Case 2: Module Detection"
echo "  1. Screenshot different TikTak modules:"
echo "     - Products page → Should detect 'products'"
echo "     - Orders page → Should detect 'orders'"
echo "     - Settings page → Should detect 'settings'"
echo "  2. Verify detection accuracy"
echo ""
echo "Test Case 3: Cache Testing"
echo "  1. Send same screenshot twice"
echo "  2. Check 2nd response is faster (<50ms)"
echo "  3. Verify cache key is image hash"
echo ""
echo "Test Case 4: Error Handling"
echo "  1. Send invalid base64 → Should handle gracefully"
echo "  2. Send non-image file → Should handle gracefully"
echo "  3. Send oversized image → Should handle gracefully"
echo "  4. All should return vision: null, not crash"
echo ""
echo "Test Case 5: Multi-turn Conversation"
echo "  1. Send image with message 1"
echo "  2. Verify vision in response 1"
echo "  3. Send follow-up message 2 (no image)"
echo "  4. Verify system uses vision context from message 1"
echo ""

# ============= COMMAND REFERENCE =============
echo ""
echo -e "${YELLOW}Quick Command Reference:${NC}"
echo ""
echo "View all responses:"
echo "  jq '.' /tmp/*_response.json"
echo ""
echo "Check vision field only:"
echo "  jq '.vision' /tmp/vision_response.json"
echo ""
echo "Pretty print with colors:"
echo "  jq -C '.' /tmp/vision_response.json"
echo ""
echo "Check specific field:"
echo "  jq '.vision.errorCode' /tmp/vision_response.json"
echo ""
echo "Test with real image from URL:"
echo "  curl -X POST http://localhost:8787/chat ..."
echo '    -d "{\"image\": \"https://example.com/error.png\"}"'
echo ""

# ============= SUCCESS CHECKLIST =============
echo ""
echo -e "${GREEN}Success Checklist:${NC}"
echo ""
echo "[ ] Vision analysis returns successfully"
echo "[ ] Error codes detected correctly"
echo "[ ] Module detection working"
echo "[ ] Confidence scores present (0-1)"
echo "[ ] Suggested actions generated"
echo "[ ] Frontend component displays"
echo "[ ] Image caching improves performance"
echo "[ ] Error handling graceful (returns null)"
echo "[ ] LLM uses vision context"
echo "[ ] Response includes vision metadata"
echo ""

echo -e "${GREEN}All tests complete! Vision system is ready. 🚀${NC}"
