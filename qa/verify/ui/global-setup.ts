/**
 * Global Setup for Playwright UI Tests
 * 
 * Ensures backend and frontend are accessible before running tests.
 * Does NOT start services - they must be running externally.
 * 
 * For local development:
 *   make dev  # or run backend/frontend separately
 * 
 * For CI:
 *   Services are started via CI workflow before tests run.
 */

import { FullConfig } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8085';
const MAX_WAIT_MS = 60000; // 60 seconds max wait
const POLL_INTERVAL_MS = 2000; // Check every 2 seconds

async function waitForService(url: string, name: string): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < MAX_WAIT_MS) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok || response.status === 404) {
        console.log(`✓ ${name} is accessible at ${url}`);
        return;
      }
    } catch (error) {
      // Service not ready yet
    }
    
    console.log(`⏳ Waiting for ${name} at ${url}...`);
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  
  throw new Error(`${name} not accessible at ${url} after ${MAX_WAIT_MS / 1000}s`);
}

async function clearQueueState(): Promise<void> {
  try {
    // Reset queue to clean state before tests
    const response = await fetch(`${BACKEND_URL}/control/queue/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.ok) {
      console.log('✓ Queue state cleared');
    } else {
      console.log('⚠ Could not clear queue state (may be empty)');
    }
  } catch (error) {
    console.log('⚠ Could not connect to backend for queue reset');
  }
}

async function globalSetup(config: FullConfig): Promise<void> {
  console.log('\n=== Playwright UI Test Setup ===\n');
  
  // Wait for backend
  await waitForService(`${BACKEND_URL}/health`, 'Backend');
  
  // Wait for frontend
  await waitForService(FRONTEND_URL, 'Frontend');
  
  // Clear queue state for clean test runs
  await clearQueueState();
  
  console.log('\n=== Setup Complete ===\n');
}

export default globalSetup;
