/**
 * Global Teardown for Playwright UI Tests
 * 
 * Cleanup after test run completes.
 */

import { FullConfig } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8085';

async function globalTeardown(config: FullConfig): Promise<void> {
  console.log('\n=== Playwright UI Test Teardown ===\n');
  
  // Clear queue state after tests
  try {
    const response = await fetch(`${BACKEND_URL}/control/queue/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.ok) {
      console.log('✓ Queue state cleared');
    }
  } catch (error) {
    // Backend may already be stopped
  }
  
  console.log('\n=== Teardown Complete ===\n');
}

export default globalTeardown;
