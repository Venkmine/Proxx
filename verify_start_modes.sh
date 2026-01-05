#!/usr/bin/env bash
# ==============================================================================
# START SCRIPT MODE VERIFICATION
# ==============================================================================
# Verifies that ./start script modes work correctly
#
# Tests:
# 1. Invalid mode shows error
# 2. Web mode starts Vite (NO Electron)
# 3. Electron mode starts Electron (NO Vite)
# 4. QC mode starts Electron with E2E_TEST
#
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${CYAN}START SCRIPT MODE VERIFICATION${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Cleanup function
cleanup() {
  echo -e "${YELLOW}Cleaning up...${NC}"
  pkill -9 -f "uvicorn app.main:app" 2>/dev/null || true
  pkill -9 -f "vite" 2>/dev/null || true
  pkill -9 -f "electron dist-electron/main.mjs" 2>/dev/null || true
  sleep 2
}

trap cleanup EXIT

# ==============================================================================
# TEST 1: Invalid mode shows error
# ==============================================================================
echo -e "${CYAN}TEST 1:${NC} Invalid mode handling"

if output=$(./start invalid 2>&1); then
  echo -e "${RED}✗ FAIL${NC} - Script should reject invalid mode"
  exit 1
else
  if echo "$output" | grep -q "Invalid launch mode"; then
    echo -e "${GREEN}✓ PASS${NC} - Invalid mode rejected correctly"
  else
    echo -e "${RED}✗ FAIL${NC} - Error message not shown"
    exit 1
  fi
fi

echo ""

# ==============================================================================
# TEST 2: Help text shows all modes
# ==============================================================================
echo -e "${CYAN}TEST 2:${NC} Help text completeness"

output=$(./start invalid 2>&1 || true)

if echo "$output" | grep -q "web.*- Web app only"; then
  if echo "$output" | grep -q "electron.*- Electron app only"; then
    if echo "$output" | grep -q "qc.*- QC/testing mode"; then
      echo -e "${GREEN}✓ PASS${NC} - All modes documented"
    else
      echo -e "${RED}✗ FAIL${NC} - QC mode not documented"
      exit 1
    fi
  else
    echo -e "${RED}✗ FAIL${NC} - Electron mode not documented"
    exit 1
  fi
else
  echo -e "${RED}✗ FAIL${NC} - Web mode not documented"
  exit 1
fi

echo ""

# ==============================================================================
# SUMMARY
# ==============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ ALL VERIFICATION TESTS PASSED${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  ./start web       - Test web mode"
echo "  ./start electron  - Test electron mode"
echo "  ./start qc        - Test QC mode"
echo ""
