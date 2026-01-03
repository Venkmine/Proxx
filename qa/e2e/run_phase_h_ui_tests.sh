#!/usr/bin/env bash
#
# Phase H-UI Test Validation
# Checks prerequisites and runs Playwright tests
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================================="
echo "Phase H-UI: Delivery Progress Test Validation"
echo "=================================================="
echo ""

# Check backend
echo -n "Checking backend health... "
if curl -s -f http://127.0.0.1:8085/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend running${NC}"
else
    echo -e "${RED}✗ Backend not running${NC}"
    echo "  Start with: python forge.py"
    exit 1
fi

# Check frontend
echo -n "Checking frontend... "
if curl -s -f http://127.0.0.1:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend running${NC}"
else
    echo -e "${RED}✗ Frontend not running${NC}"
    echo "  Start with: cd frontend && npm run dev"
    exit 1
fi

# Check test files
echo ""
echo "Checking test files:"
TEST_H264="forge-tests/samples/standard/mp4_h264/sample_h264.mp4"
TEST_BRAW="forge-tests/samples/RAW/BLACKMAGIC/BMPCC6K Indie Film BRAW/A001_06260430_C007.braw"

if [ -f "$TEST_H264" ]; then
    echo -e "  ${GREEN}✓${NC} H.264 test file found"
else
    echo -e "  ${YELLOW}⚠${NC} H.264 test file missing (tests will skip)"
fi

if [ -f "$TEST_BRAW" ]; then
    echo -e "  ${GREEN}✓${NC} BRAW test file found"
else
    echo -e "  ${YELLOW}⚠${NC} BRAW test file missing (tests will skip)"
fi

# Check Playwright
echo ""
echo -n "Checking Playwright installation... "
if cd qa/e2e && npx playwright --version > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Playwright installed${NC}"
else
    echo -e "${RED}✗ Playwright not installed${NC}"
    echo "  Install with: cd qa/e2e && npm install && npx playwright install"
    exit 1
fi

# Run tests
echo ""
echo "=================================================="
echo "Running Phase H-UI Tests"
echo "=================================================="
echo ""

cd qa/e2e
if [ "${1:-}" = "--headed" ]; then
    echo "Running in headed mode (browser visible)..."
    npx playwright test phase_h_delivery_progress.spec.ts --headed
elif [ "${1:-}" = "--debug" ]; then
    echo "Running in debug mode..."
    npx playwright test phase_h_delivery_progress.spec.ts --debug
else
    echo "Running in headless mode..."
    npx playwright test phase_h_delivery_progress.spec.ts
fi

echo ""
echo "=================================================="
echo -e "${GREEN}Phase H-UI Tests Complete${NC}"
echo "=================================================="
