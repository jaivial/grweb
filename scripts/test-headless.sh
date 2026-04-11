#!/bin/bash
# Run Playwright tests in headless mode (for CI/production)
# Usage: ./scripts/test-headless.sh [test-pattern]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  ${GREEN}Playwright Headless Tests${NC}                            ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

# Navigate to frontend directory
cd "$(dirname "$0")/../frontend"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ Installing dependencies...${NC}"
    npm install
fi

# Run tests in headless mode
if [ -n "$1" ]; then
    echo -e "${GREEN}▶ Running tests matching: $1${NC}"
    npx playwright test -g "$1" --reporter=list
else
    echo -e "${GREEN}▶ Running all tests...${NC}"
    npx playwright test --reporter=list
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  ${GREEN}✅ Tests Complete${NC}                                      ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}  View report: npx playwright show-report           ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
