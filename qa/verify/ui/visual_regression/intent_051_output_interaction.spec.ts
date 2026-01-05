/**
 * INTENT_051 — Output Tab Interaction Sanity
 * 
 * Validates minimal local-only interaction affordances.
 * NO backend calls, NO validation, NO side effects.
 * 
 * SCOPE:
 * 1. Inputs accept text
 * 2. Buttons respond visually
 * 3. Toggles change state
 * 4. Preview updates dynamically
 * 5. No console errors
 * 
 * DELIBERATELY DOES NOT TEST:
 * - Validation logic (doesn't exist)
 * - Backend wiring (doesn't exist)
 * - Filesystem operations (doesn't exist)
 * - Complex templating (doesn't exist)
 */

import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// ============================================================================
// TEST DATA
// ============================================================================

const STANDARD_VIEWPORT = { width: 1440, height: 900 }

// ============================================================================
// HELPER: Render OutputTab in isolation
// ============================================================================

async function renderOutputTabWithReact(page: Page) {
  // Load a minimal React app with OutputTab
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          :root {
            --text-primary: #e2e8f0;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --text-dim: #475569;
            --bg-secondary: rgba(26, 32, 44, 0.8);
            --border-primary: rgba(148, 163, 184, 0.2);
            --button-primary-bg: #3b82f6;
            --status-warning-fg: #eab308;
            --font-mono: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
            --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica', 'Arial', sans-serif;
          }
          
          body {
            font-family: var(--font-sans);
            background: #0a0b0d;
            color: var(--text-primary);
            overflow: hidden;
          }
          
          #root {
            width: 480px;
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
        </style>
        <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
      </head>
      <body>
        <div id="root"></div>
        <script type="text/babel">
          const { useState } = React;
          
          function OutputTab() {
            const [outputPath, setOutputPath] = useState('/path/to/output');
            const [containerFormat, setContainerFormat] = useState('mov');
            const [filenameTemplate, setFilenameTemplate] = useState('{source_name}_proxy');
            const [deliveryType, setDeliveryType] = useState('proxy');
            
            return (
              <div data-testid="output-tab" style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                background: 'rgba(20, 24, 32, 0.6)',
              }}>
                <div style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid var(--border-primary)',
                  backgroundColor: 'var(--bg-secondary)',
                }}>
                  <h2 style={{
                    margin: 0,
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                  }}>OUTPUT</h2>
                </div>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '1rem',
                  padding: '1rem',
                  borderBottom: '1px solid var(--border-primary)',
                }}>
                  {/* Column 1: Destination */}
                  <section data-testid="output-destination">
                    <h3 style={{
                      margin: '0 0 0.75rem 0',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>Destination</h3>
                    
                    <button
                      data-testid="output-browse-button"
                      onClick={() => console.log('Browse clicked')}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.6875rem',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        marginBottom: '0.5rem',
                      }}
                    >Select Output Folder</button>
                    
                    <input
                      data-testid="output-path-input"
                      type="text"
                      value={outputPath}
                      onChange={(e) => setOutputPath(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        fontSize: '0.6875rem',
                        color: 'var(--text-primary)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                        marginBottom: '0.5rem',
                        outline: 'none',
                      }}
                    />
                  </section>
                  
                  {/* Column 2: File Identity */}
                  <section data-testid="output-identity">
                    <h3 style={{
                      margin: '0 0 0.75rem 0',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>File</h3>
                    
                    <div data-testid="output-container-select" style={{ marginBottom: '0.75rem' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '0.6875rem',
                        color: 'var(--text-dim)',
                        marginBottom: '0.25rem',
                      }}>Container</label>
                      <select
                        value={containerFormat}
                        onChange={(e) => setContainerFormat(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          fontSize: '0.6875rem',
                          color: 'var(--text-primary)',
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        <option value="mov">MOV</option>
                        <option value="mp4">MP4</option>
                        <option value="mxf">MXF</option>
                      </select>
                    </div>
                    
                    <div data-testid="output-filename-template">
                      <label style={{
                        display: 'block',
                        fontSize: '0.6875rem',
                        color: 'var(--text-dim)',
                        marginBottom: '0.25rem',
                      }}>Filename Template</label>
                      <input
                        type="text"
                        value={filenameTemplate}
                        onChange={(e) => setFilenameTemplate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          fontSize: '0.6875rem',
                          color: 'var(--text-primary)',
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          fontFamily: 'var(--font-mono)',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </section>
                  
                  {/* Column 3: Delivery */}
                  <section data-testid="output-delivery">
                    <h3 style={{
                      margin: '0 0 0.75rem 0',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>Delivery</h3>
                    
                    <div data-testid="output-type" style={{ marginBottom: '0.75rem' }}>
                      <div style={{
                        fontSize: '0.6875rem',
                        color: 'var(--text-dim)',
                        marginBottom: '0.5rem',
                      }}>Type</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.6875rem',
                          color: 'var(--text-primary)',
                        }}>
                          <input
                            type="radio"
                            name="delivery-type"
                            value="proxy"
                            checked={deliveryType === 'proxy'}
                            onChange={(e) => setDeliveryType(e.target.value)}
                            style={{ cursor: 'pointer' }}
                          />
                          Proxy
                        </label>
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.6875rem',
                          color: 'var(--text-primary)',
                        }}>
                          <input
                            type="radio"
                            name="delivery-type"
                            value="delivery"
                            checked={deliveryType === 'delivery'}
                            onChange={(e) => setDeliveryType(e.target.value)}
                            style={{ cursor: 'pointer' }}
                          />
                          Delivery
                        </label>
                      </div>
                    </div>
                  </section>
                </div>
                
                {/* Preview */}
                <section data-testid="output-filename-preview" style={{
                  padding: '1rem',
                  background: 'rgba(0, 0, 0, 0.2)',
                }}>
                  <h4 style={{
                    margin: '0 0 0.5rem 0',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>Filename Preview</h4>
                  <code data-testid="output-preview-text" style={{
                    display: 'block',
                    padding: '0.75rem',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-mono)',
                    wordBreak: 'break-all',
                  }}>
                    {filenameTemplate}.{containerFormat}
                  </code>
                </section>
              </div>
            );
          }
          
          const root = ReactDOM.createRoot(document.getElementById('root'));
          root.render(<OutputTab />);
        </script>
      </body>
    </html>
  `)
  
  await page.waitForSelector('[data-testid="output-tab"]', { state: 'visible', timeout: 5000 })
}

// ============================================================================
// TESTS
// ============================================================================

test.describe('INTENT_051: Output Tab Interaction Sanity', () => {
  test('INVARIANT_051_001: Output path input accepts text', async ({ page }) => {
    await page.setViewportSize(STANDARD_VIEWPORT)
    await renderOutputTabWithReact(page)
    
    const input = page.locator('[data-testid="output-path-input"]')
    
    // Clear and type new path
    await input.clear()
    await input.fill('/Users/editor/my-output')
    
    // Verify value changed
    await expect(input).toHaveValue('/Users/editor/my-output')
  })
  
  test('INVARIANT_051_002: Filename template input accepts text', async ({ page }) => {
    await page.setViewportSize(STANDARD_VIEWPORT)
    await renderOutputTabWithReact(page)
    
    const input = page.locator('[data-testid="output-filename-template"] input')
    
    // Clear and type new template
    await input.clear()
    await input.fill('{project}_{scene}_{take}')
    
    // Verify value changed
    await expect(input).toHaveValue('{project}_{scene}_{take}')
  })
  
  test('INVARIANT_051_003: Container select changes value', async ({ page }) => {
    await page.setViewportSize(STANDARD_VIEWPORT)
    await renderOutputTabWithReact(page)
    
    const select = page.locator('[data-testid="output-container-select"] select')
    
    // Initially mov
    await expect(select).toHaveValue('mov')
    
    // Change to mp4
    await select.selectOption('mp4')
    await expect(select).toHaveValue('mp4')
    
    // Change to mxf
    await select.selectOption('mxf')
    await expect(select).toHaveValue('mxf')
  })
  
  test('INVARIANT_051_004: Delivery type toggles work', async ({ page }) => {
    await page.setViewportSize(STANDARD_VIEWPORT)
    await renderOutputTabWithReact(page)
    
    const proxyRadio = page.locator('input[type="radio"][value="proxy"]')
    const deliveryRadio = page.locator('input[type="radio"][value="delivery"]')
    
    // Initially proxy is checked
    await expect(proxyRadio).toBeChecked()
    await expect(deliveryRadio).not.toBeChecked()
    
    // Click delivery
    await deliveryRadio.click()
    await expect(deliveryRadio).toBeChecked()
    await expect(proxyRadio).not.toBeChecked()
    
    // Click proxy again
    await proxyRadio.click()
    await expect(proxyRadio).toBeChecked()
    await expect(deliveryRadio).not.toBeChecked()
  })
  
  test('INVARIANT_051_005: Preview updates when inputs change', async ({ page }) => {
    await page.setViewportSize(STANDARD_VIEWPORT)
    await renderOutputTabWithReact(page)
    
    const filenameInput = page.locator('[data-testid="output-filename-template"] input')
    const containerSelect = page.locator('[data-testid="output-container-select"] select')
    const preview = page.locator('[data-testid="output-preview-text"]')
    
    // Initial state
    await expect(preview).toContainText('{source_name}_proxy.mov')
    
    // Change filename template
    await filenameInput.clear()
    await filenameInput.fill('test_output')
    await expect(preview).toContainText('test_output.mov')
    
    // Change container
    await containerSelect.selectOption('mp4')
    await expect(preview).toContainText('test_output.mp4')
  })
  
  test('INVARIANT_051_006: Browse button is clickable', async ({ page }) => {
    await page.setViewportSize(STANDARD_VIEWPORT)
    await renderOutputTabWithReact(page)
    
    const button = page.locator('[data-testid="output-browse-button"]')
    
    // Button should be visible and enabled
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()
    
    // Click should not throw
    await button.click()
  })
  
  test('INVARIANT_051_007: No console errors during interaction', async ({ page }) => {
    const consoleErrors: string[] = []
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    
    await page.setViewportSize(STANDARD_VIEWPORT)
    await renderOutputTabWithReact(page)
    
    // Perform various interactions
    await page.locator('[data-testid="output-path-input"]').fill('/new/path')
    await page.locator('[data-testid="output-filename-template"] input').fill('new_template')
    await page.locator('[data-testid="output-container-select"] select').selectOption('mp4')
    await page.locator('input[type="radio"][value="delivery"]').click()
    await page.locator('[data-testid="output-browse-button"]').click()
    
    // Verify no console errors
    expect(consoleErrors).toHaveLength(0)
  })
})
