#!/usr/bin/env node

/**
 * E2E Audit Report Generator
 * 
 * Reads artifacts from artifacts/ui/<timestamp>/ and generates a unified HTML report.
 * 
 * Usage:
 *   node scripts/build_e2e_audit_report.mjs [timestamp]
 * 
 * If no timestamp provided, uses the most recent artifacts directory.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '..')
const artifactsBaseDir = path.join(projectRoot, 'artifacts/ui')

/**
 * Find the most recent timestamp directory
 */
function findLatestTimestamp() {
  if (!fs.existsSync(artifactsBaseDir)) {
    throw new Error(`Artifacts directory not found: ${artifactsBaseDir}`)
  }

  const dirs = fs.readdirSync(artifactsBaseDir)
    .filter(name => {
      const fullPath = path.join(artifactsBaseDir, name)
      return fs.statSync(fullPath).isDirectory()
    })
    .sort()
    .reverse()

  if (dirs.length === 0) {
    throw new Error(`No artifact directories found in ${artifactsBaseDir}`)
  }

  return dirs[0]
}

/**
 * Scan artifacts directory and collect test results
 */
function collectArtifacts(timestampDir) {
  const artifacts = {
    timestamp: path.basename(timestampDir),
    scenarios: []
  }

  const scenarioDirs = fs.readdirSync(timestampDir).filter(name => {
    const fullPath = path.join(timestampDir, name)
    return fs.statSync(fullPath).isDirectory()
  })

  for (const scenarioName of scenarioDirs) {
    const scenarioPath = path.join(timestampDir, scenarioName)
    const scenario = {
      name: scenarioName,
      steps: []
    }

    const stepDirs = fs.readdirSync(scenarioPath).filter(name => {
      const fullPath = path.join(scenarioPath, name)
      return fs.statSync(fullPath).isDirectory()
    })

    for (const stepName of stepDirs) {
      const stepPath = path.join(scenarioPath, stepName)
      const step = {
        name: stepName,
        screenshot: null,
        dom: null,
        console: null,
        network: null
      }

      // Check for artifacts
      const screenshotPath = path.join(stepPath, 'screenshot.png')
      if (fs.existsSync(screenshotPath)) {
        step.screenshot = path.relative(timestampDir, screenshotPath)
      }

      const domPath = path.join(stepPath, 'dom.html')
      if (fs.existsSync(domPath)) {
        step.dom = fs.readFileSync(domPath, 'utf8')
      }

      const consolePath = path.join(stepPath, 'console.log')
      if (fs.existsSync(consolePath)) {
        step.console = fs.readFileSync(consolePath, 'utf8')
      }

      const networkPath = path.join(stepPath, 'network.log')
      if (fs.existsSync(networkPath)) {
        step.network = fs.readFileSync(networkPath, 'utf8')
      }

      scenario.steps.push(step)
    }

    artifacts.scenarios.push(scenario)
  }

  return artifacts
}

/**
 * Generate HTML report
 */
function generateHtmlReport(artifacts) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E2E Audit Report - ${artifacts.timestamp}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 2rem;
      line-height: 1.6;
    }
    
    .header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      border: 1px solid #334155;
    }
    
    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      color: #f1f5f9;
    }
    
    .timestamp {
      color: #94a3b8;
      font-size: 0.875rem;
    }
    
    .scenario {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .scenario-title {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: #60a5fa;
      font-weight: 600;
    }
    
    .step {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    
    .step-title {
      font-size: 1.125rem;
      margin-bottom: 1rem;
      color: #cbd5e1;
      font-weight: 500;
    }
    
    .artifact-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    
    .screenshot-container {
      grid-column: 1 / -1;
    }
    
    .screenshot {
      max-width: 100%;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    
    .log-container {
      background: #020617;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 1rem;
      overflow: auto;
      max-height: 300px;
    }
    
    .log-title {
      font-size: 0.875rem;
      color: #94a3b8;
      margin-bottom: 0.5rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .log-content {
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 0.75rem;
      color: #cbd5e1;
      white-space: pre-wrap;
      word-break: break-all;
    }
    
    .dom-link {
      display: inline-block;
      color: #60a5fa;
      text-decoration: none;
      padding: 0.5rem 1rem;
      background: #1e293b;
      border-radius: 6px;
      border: 1px solid #334155;
      margin-top: 0.5rem;
    }
    
    .dom-link:hover {
      background: #334155;
    }
    
    .summary {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .summary-title {
      font-size: 1.25rem;
      margin-bottom: 1rem;
      color: #f1f5f9;
    }
    
    .summary-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }
    
    .stat {
      background: #0f172a;
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid #1e293b;
    }
    
    .stat-label {
      font-size: 0.75rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
    }
    
    .stat-value {
      font-size: 1.5rem;
      color: #60a5fa;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>E2E Audit Report</h1>
    <div class="timestamp">Generated: ${new Date().toISOString()}</div>
    <div class="timestamp">Artifacts: ${artifacts.timestamp}</div>
  </div>

  <div class="summary">
    <div class="summary-title">Summary</div>
    <div class="summary-stats">
      <div class="stat">
        <div class="stat-label">Scenarios</div>
        <div class="stat-value">${artifacts.scenarios.length}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Total Steps</div>
        <div class="stat-value">${artifacts.scenarios.reduce((sum, s) => sum + s.steps.length, 0)}</div>
      </div>
    </div>
  </div>

  ${artifacts.scenarios.map(scenario => `
    <div class="scenario">
      <div class="scenario-title">${escapeHtml(scenario.name)}</div>
      
      ${scenario.steps.map(step => `
        <div class="step">
          <div class="step-title">${escapeHtml(step.name)}</div>
          
          ${step.screenshot ? `
            <div class="screenshot-container">
              <img src="${step.screenshot}" alt="Screenshot" class="screenshot" />
            </div>
          ` : ''}
          
          <div class="artifact-grid">
            ${step.console ? `
              <div class="log-container">
                <div class="log-title">Console Logs</div>
                <div class="log-content">${escapeHtml(step.console.slice(0, 5000))}${step.console.length > 5000 ? '\n... (truncated)' : ''}</div>
              </div>
            ` : ''}
            
            ${step.network ? `
              <div class="log-container">
                <div class="log-title">Network Logs</div>
                <div class="log-content">${escapeHtml(step.network.slice(0, 5000))}${step.network.length > 5000 ? '\n... (truncated)' : ''}</div>
              </div>
            ` : ''}
          </div>
          
          ${step.dom ? `
            <details>
              <summary class="dom-link">View DOM Snapshot (${(step.dom.length / 1024).toFixed(1)} KB)</summary>
              <div class="log-container" style="margin-top: 1rem; max-height: 500px;">
                <pre class="log-content">${escapeHtml(step.dom.slice(0, 10000))}${step.dom.length > 10000 ? '\n... (truncated)' : ''}</pre>
              </div>
            </details>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `).join('')}

</body>
</html>`

  return html
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2)
  let timestamp = args[0]

  if (!timestamp) {
    console.log('No timestamp provided, using latest...')
    timestamp = findLatestTimestamp()
    console.log(`Using timestamp: ${timestamp}`)
  }

  const timestampDir = path.join(artifactsBaseDir, timestamp)

  if (!fs.existsSync(timestampDir)) {
    console.error(`Timestamp directory not found: ${timestampDir}`)
    process.exit(1)
  }

  console.log(`Collecting artifacts from: ${timestampDir}`)
  const artifacts = collectArtifacts(timestampDir)

  console.log(`Found ${artifacts.scenarios.length} scenarios with ${artifacts.scenarios.reduce((sum, s) => sum + s.steps.length, 0)} total steps`)

  console.log('Generating HTML report...')
  const html = generateHtmlReport(artifacts)

  const reportPath = path.join(timestampDir, 'report.html')
  fs.writeFileSync(reportPath, html, 'utf8')

  console.log(`✅ Report generated: ${reportPath}`)
  console.log(`   Open in browser: file://${reportPath}`)
}

main()
