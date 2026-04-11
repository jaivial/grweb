#!/bin/bash
# Run Playwright tests with xvfb (virtual display for headed mode on servers)
# Usage: ./scripts/test-headed.sh [test-pattern]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  ${GREEN}Playwright Headed Tests (Xvfb)${NC}                       ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

# Check if xvfb is installed
if ! command -v xvfb-run &> /dev/null; then
    echo -e "${YELLOW}⚠ xvfb-run not found. Installing...${NC}"
    sudo apt-get update && sudo apt-get install -y xvfb
fi

# Set virtual display resolution
export DISPLAY=:99

# Navigate to frontend directory
cd "$(dirname "$0")/../frontend"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ Installing dependencies...${NC}"
    npm install
fi

# Run tests
if [ -n "$1" ]; then
    echo -e "${GREEN}▶ Running tests matching: $1${NC}"
    xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" \
        npx playwright test -g "$1" --reporter=list
else
    echo -e "${GREEN}▶ Running all custom raffle tests...${NC}"
    xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" \
        npx playwright test tests/e2e/backoffice/custom-raffle.spec.ts --reporter=list
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  ${GREEN}✅ Tests Complete${NC}                                      ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}  View report: npx playwright show-report           ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
