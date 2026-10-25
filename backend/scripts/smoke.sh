#!/usr/bin/env bash
# smoke.sh — FandomLoop India smoke test
#
# Usage:
#   bash scripts/smoke.sh http://localhost:4000
#   bash scripts/smoke.sh https://your-api.onrender.com
#
# Requires: curl (jq is optional — falls back to grep if absent)
# Exit code: 0 = all pass, 1 = one or more failures

set -uo pipefail

BASE="${1:-http://localhost:4000}"
STUDIO_KEY="${STUDIO_API_KEY:-}"

PASS=0
FAIL=0

# ── Helpers ────────────────────────────────────────────────────────────────

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }

check() {
  local label="$1"
  local result="$2"   # "pass" or anything else = fail
  if [ "$result" = "pass" ]; then
    green "  PASS  $label"
    PASS=$((PASS + 1))
  else
    red   "  FAIL  $label  ($result)"
    FAIL=$((FAIL + 1))
  fi
}

# curl that returns the body on success, empty string on failure
# -s = silent, -f = fail on 4xx/5xx, --max-time = timeout
api() {
  curl -sf --max-time 15 "$@" 2>/dev/null || true
}

# Extract a JSON string value — uses jq if available, otherwise grep+sed
json_get() {
  local json="$1"
  local key="$2"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq -r ".$key" 2>/dev/null || echo ""
  else
    # Minimal grep fallback: handles "key":"value" and "key": value (numbers/true/false)
    printf '%s' "$json" | grep -o "\"${key}\"[[:space:]]*:[[:space:]]*[^,}]*" \
      | sed 's/.*:[[:space:]]*//' | tr -d '"' | tr -d ' ' | head -1
  fi
}

# Extract array length — uses jq if available, otherwise counts commas in top-level array
json_length() {
  local json="$1"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq 'length' 2>/dev/null || echo "0"
  else
    # Count objects: number of id fields is a reasonable proxy
    printf '%s' "$json" | grep -o '"id"' | wc -l | tr -d ' '
  fi
}

echo ""
echo "Smoke test → $BASE"
echo "───────────────────────────────────────────────────────"

# ── 1. Health check ────────────────────────────────────────────────────────
BODY=$(api "${BASE}/api/health")
STATUS=$(json_get "$BODY" "status")
check "GET /api/health returns ok" "$([ "$STATUS" = "ok" ] && echo pass || echo "status=${STATUS:-empty}")"

# ── 2. Campaigns — at least 3 ─────────────────────────────────────────────
BODY=$(api "${BASE}/api/campaigns")
N=$(json_length "$BODY")
check "GET /api/campaigns returns ≥3 campaigns (got ${N})" "$([ "${N:-0}" -ge 3 ] && echo pass || echo "count=${N:-0}")"

# ── 3. Evaluate-gate: price 999 → GO ──────────────────────────────────────
BODY=$(api -X POST "${BASE}/api/campaigns/evaluate-gate" \
  -H "Content-Type: application/json" \
  -d '{"price":999,"format":"TEE","orders":120,"rightsCleared":true}')
VERDICT=$(json_get "$BODY" "status")
check "evaluate-gate price=999 → GO" "$([ "$VERDICT" = "GO" ] && echo pass || echo "verdict=${VERDICT:-empty}")"

# ── 4. Evaluate-gate: price 799 → ADAPT ───────────────────────────────────
BODY=$(api -X POST "${BASE}/api/campaigns/evaluate-gate" \
  -H "Content-Type: application/json" \
  -d '{"price":799,"format":"TEE","orders":120,"rightsCleared":true}')
VERDICT=$(json_get "$BODY" "status")
check "evaluate-gate price=799 → ADAPT" "$([ "$VERDICT" = "ADAPT" ] && echo pass || echo "verdict=${VERDICT:-empty}")"

# ── 5. Evaluate-gate: price 499 → STOP ────────────────────────────────────
BODY=$(api -X POST "${BASE}/api/campaigns/evaluate-gate" \
  -H "Content-Type: application/json" \
  -d '{"price":499,"format":"TEE","orders":120,"rightsCleared":true}')
VERDICT=$(json_get "$BODY" "status")
check "evaluate-gate price=499 → STOP" "$([ "$VERDICT" = "STOP" ] && echo pass || echo "verdict=${VERDICT:-empty}")"

# ── 6. Verify known serial ─────────────────────────────────────────────────
BODY=$(api "${BASE}/api/verify/FL-DEMO-0001")
VERIFIED=$(json_get "$BODY" "verified")
check "GET /api/verify/FL-DEMO-0001 → verified:true" "$([ "$VERIFIED" = "true" ] && echo pass || echo "verified=${VERIFIED:-empty}")"

# ── 7. Verify unknown serial ───────────────────────────────────────────────
BODY=$(api "${BASE}/api/verify/FAKE-0000")
VERIFIED=$(json_get "$BODY" "verified")
check "GET /api/verify/FAKE-0000 → verified:false" "$([ "$VERIFIED" = "false" ] && echo pass || echo "verified=${VERIFIED:-empty}")"

# ── 8. POST /api/orders returns 404 ───────────────────────────────────────
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
  -X POST "${BASE}/api/orders" \
  -H "Content-Type: application/json" \
  -d '{"campaignSlug":"any"}' 2>/dev/null || echo "000")
check "POST /api/orders returns 404" "$([ "$HTTP_CODE" = "404" ] && echo pass || echo "http=${HTTP_CODE}")"

# ── 9. Settle without studio key → 401 (only when STUDIO_API_KEY is set) ──
if [ -n "$STUDIO_KEY" ]; then
  SLUG_BODY=$(api "${BASE}/api/campaigns")
  # Grab first slug value
  if command -v jq >/dev/null 2>&1; then
    SLUG=$(printf '%s' "$SLUG_BODY" | jq -r '.[0].slug' 2>/dev/null || echo "")
  else
    SLUG=$(printf '%s' "$SLUG_BODY" | grep -o '"slug":"[^"]*"' | head -1 | sed 's/"slug":"//;s/"//')
  fi

  if [ -n "$SLUG" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
      -X POST "${BASE}/api/campaigns/${SLUG}/settle" \
      -H "Content-Type: application/json" 2>/dev/null || echo "000")
    check "POST /api/campaigns/${SLUG}/settle without key → 401" \
      "$([ "$HTTP_CODE" = "401" ] && echo pass || echo "http=${HTTP_CODE}")"
  else
    echo "  SKIP  Settle auth check (no campaigns found)"
  fi
else
  echo "  SKIP  Settle auth check (STUDIO_API_KEY not set in env — 401 not expected)"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo "───────────────────────────────────────────────────────"
echo "  ${PASS} passed, ${FAIL} failed"
echo ""

if [ "$FAIL" -gt 0 ]; then
  red "SMOKE TEST FAILED"
  exit 1
else
  green "SMOKE TEST PASSED"
  exit 0
fi
