# Awaire Proxy Makefile

.PHONY: verify-fast verify verify-ui verify-ui-debug verify-full verify-dogfood dev clean help

# Default target
help:
	@echo "Awaire Proxy - Available targets:"
	@echo ""
	@echo "  make verify-fast     - Run fast checks (lint, unit tests, schema)"
	@echo "  make verify          - Run standard verification (+ integration tests)"
	@echo "  make verify-ui       - Run UI end-to-end tests (Playwright)"
	@echo "  make verify-ui-debug - Run UI tests in headed mode (visible browser)"
	@echo "  make verify-full     - Run full verification (+ E2E + UI tests)"
	@echo "  make verify-dogfood  - Run exhaustive dogfood verification suite"
	@echo ""
	@echo "  make dev             - Start development environment"
	@echo "  make clean           - Clean build artifacts"
	@echo ""

# Verify targets - 1:1 mapping to Verify commands
verify-fast:
	@echo "Running Verify Proxy Fast..."
	python -m qa.verify.verify proxy fast

verify:
	@echo "Running Verify Proxy..."
	python -m qa.verify.verify proxy

verify-ui:
	@echo "Running Verify Proxy UI..."
	python -m qa.verify.verify proxy ui

verify-ui-debug:
	@echo "Running Verify Proxy UI (Debug Mode - Headed)..."
	cd qa/verify/ui && DEBUG=1 npx playwright test --headed --project=browser

verify-full:
	@echo "Running Verify Proxy Full..."
	python -m qa.verify.verify proxy full

# Dogfood Verification Suite — Exhaustive UI + E2E + Contract Tests
# Runs all dogfood-grade tests for Alpha trust validation
verify-dogfood:
	@echo "==================================================="
	@echo "Dogfood Verification Suite — Exhaustive Pass"
	@echo "==================================================="
	@echo ""
	@echo "Phase 1: Backend Contract Tests"
	@echo "---------------------------------------------------"
	cd qa && python -m pytest proxy/contract/test_dogfood_contracts.py -v --tb=short || true
	@echo ""
	@echo "Phase 2: E2E Transcode Tests (FFprobe Validation)"
	@echo "---------------------------------------------------"
	cd qa && python -m pytest proxy/e2e/test_dogfood_transcode.py -v --tb=short || true
	@echo ""
	@echo "Phase 3: Playwright UI Tests (Dogfood Suite)"
	@echo "---------------------------------------------------"
	@echo "NOTE: Frontend must be running on localhost:5173"
	@echo "NOTE: Backend must be running on localhost:8085"
	cd qa/verify/ui && npx playwright test dogfood --reporter=list || true
	@echo ""
	@echo "==================================================="
	@echo "Dogfood Verification Complete"
	@echo "==================================================="

# Development
dev:
	./START

# Backend only
backend:
	cd backend && source ../.venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8085

# Frontend only
frontend:
	cd frontend && pnpm dev

# Clean
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/dist frontend/dist-electron 2>/dev/null || true
	rm -f backend/*.db 2>/dev/null || true
	@echo "Cleaned build artifacts"

# Install dependencies
install:
	cd backend && pip install -r requirements.txt
	cd frontend && pnpm install

# Lint only (subset of verify-fast)
lint:
	cd backend && python -m ruff check app/

# Unit tests only
test-unit:
	cd qa && python -m pytest proxy/unit/ -v

# Integration tests only
test-integration:
	cd qa && python -m pytest proxy/integration/ -v

# E2E tests only
test-e2e:
	cd qa && python -m pytest proxy/e2e/ -v

#  DO NOT start Vite or backend servers from Playwright or Verify.
#
# The frontend MUST be started manually before running UI tests.
# Copilot must not add webServer, pnpm run dev, or port management here.
