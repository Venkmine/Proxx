/**
 * Global Setup for Playwright UI Tests
 * 
 * ⚠️ IMPORTANT: Frontend must be started manually before Playwright runs.
 * 
 * This setup is intentionally a NO-OP. Playwright tests assume:
 * - Frontend is running at http://localhost:5173 (pnpm run dev)
 * - Backend is running at http://localhost:8085
 * 
 * Tests use UI-state-based waits (DOM selectors), NOT network probes.
 * If services aren't running, tests will fail with clear browser errors.
 * 
 * For local development:
 *   cd frontend && pnpm run dev
 *   cd backend && uvicorn app.main:app --reload --host 127.0.0.1 --port 8085
 * 
 * Then run:
 *   make verify-ui
 */

import { FullConfig } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8085';

async function globalSetup(config: FullConfig): Promise<void> {
  console.log('\n=== Playwright UI Test Setup ===');
  console.log('⚠️  Frontend must be running at http://localhost:5173');
  console.log('⚠️  Backend must be running at http://localhost:8085');
  console.log('=== No server probing - tests will fail fast if services are down ===\n');
  
  // Reset queue state before tests to ensure test isolation
  try {
    const response = await fetch(`${BACKEND_URL}/control/queue/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.ok) {
      console.log('✓ Queue state cleared before tests');
    }
  } catch (error) {
    // Backend may not be available yet - tests will handle this
  }
}

export default globalSetup;

/**
 *  DO NOT start Vite or backend servers from Playwright or Verify.
 *
 * The frontend MUST be started manually before running UI tests.
 * Copilot must not add webServer, pnpm run dev, or port management here.
 */
