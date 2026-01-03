#!/usr/bin/env node
/**
 * PHASE 2 — VISUAL JUDGMENT (GLM)
 * 
 * Sends screenshots to GLM-4.6V Vision API and asks explicit visual questions.
 * 
 * INPUTS:
 * - Artifact path from Phase 1
 * - Question set version (default: v1)
 * 
 * OUTPUTS:
 * - artifacts/ui/visual/<timestamp>/glm_report.json
 * 
 * GLM-4.6V API:
 * - Endpoint: https://open.bigmodel.cn/api/paas/v4/chat/completions
 * - Requires: GLM_API_KEY environment variable
 * 
 * STRICT RULES:
 * - Only ask visually answerable questions
 * - GLM provides factual observations only
 * - No interpretation in this phase
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

// GLM API Configuration (z.ai)
const GLM_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions'
const GLM_MODEL = 'glm-4.6v' // Vision-capable model

/**
 * Load question set by version
 */
function loadQuestionSet(version = 'v1') {
  const questionsPath = path.join(projectRoot, 'scripts/qc/question_sets', `${version}.json`)
  
  if (!fs.existsSync(questionsPath)) {
    // Fall back to embedded v1 questions
    console.log(`⚠️  Question set ${version} not found, using embedded v1`)
    return getEmbeddedQuestionSet()
  }
  
  return JSON.parse(fs.readFileSync(questionsPath, 'utf-8'))
}

/**
 * Embedded v1 question set (fallback)
 */
function getEmbeddedQuestionSet() {
  return {
    version: 'v1',
    description: 'Core UI visibility questions for Awaire Proxy',
    questions: [
      {
        id: 'splash_visible',
        question: 'Is there a splash screen or loading screen visible that covers most of the window?',
        type: 'boolean',
        significance: 'Splash presence may indicate app not fully loaded',
      },
      {
        id: 'progress_bar_visible',
        question: 'Is there a horizontal progress bar visible anywhere in the interface?',
        type: 'boolean',
        significance: 'Progress bar visibility during jobs',
      },
      {
        id: 'queue_panel_visible',
        question: 'Is there a queue or job list panel visible on the left or right side?',
        type: 'boolean',
        significance: 'Queue panel layout verification',
      },
      {
        id: 'player_area_visible',
        question: 'Is there a video player or preview area visible in the center?',
        type: 'boolean',
        significance: 'Main content area visibility',
      },
      {
        id: 'zoom_controls_visible',
        question: 'Are there zoom controls (buttons with + or -, or a slider) visible near the player area?',
        type: 'boolean',
        significance: 'Zoom control accessibility',
      },
      {
        id: 'ui_elements_clipped',
        question: 'Are any UI elements cut off, clipped, or extending beyond the visible window boundaries?',
        type: 'boolean',
        significance: 'Layout overflow detection',
      },
      {
        id: 'error_message_visible',
        question: 'Is there any error message, warning banner, or red-colored alert visible?',
        type: 'boolean',
        significance: 'Error state detection',
      },
      {
        id: 'primary_action_button',
        question: 'Is there a prominent action button (like "Start", "Render", or "Add") visible?',
        type: 'boolean',
        significance: 'Primary CTA visibility',
      },
    ],
  }
}

/**
 * Convert image to base64
 */
function imageToBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath)
  return imageBuffer.toString('base64')
}

/**
 * Build GLM request payload for a single screenshot
 */
function buildGLMRequest(base64Image, questions, imageName) {
  const questionList = questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')
  
  const prompt = `You are a visual UI inspector. Analyze this screenshot and answer each question with ONLY "yes" or "no".

Screenshot: ${imageName}

Questions:
${questionList}

Respond in this EXACT JSON format:
{
  "answers": {
    "${questions[0].id}": "yes" or "no",
    "${questions[1].id}": "yes" or "no",
    ...
  },
  "observations": "Brief factual description of what you see (2-3 sentences max)"
}

RULES:
- Answer based ONLY on what is visible in the image
- Do not guess or infer
- If uncertain, answer "no"
- Keep observations purely factual`

  return {
    model: GLM_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64Image}`,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
    max_tokens: 1024,
    temperature: 0.1, // Low temperature for factual responses
  }
}

/**
 * Call GLM API
 */
async function callGLMAPI(payload) {
  const apiKey = process.env.GLM_API_KEY
  
  if (!apiKey) {
    throw new Error('GLM_API_KEY environment variable not set')
  }
  
  const response = await fetch(GLM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GLM API error: ${response.status} - ${errorText}`)
  }
  
  return response.json()
}

/**
 * Parse GLM response into structured format
 */
function parseGLMResponse(glmResponse) {
  try {
    const content = glmResponse.choices[0].message.content
    
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    
    // If no JSON found, return raw content wrapped
    return {
      answers: {},
      observations: content,
      parseError: 'Could not extract structured JSON from response',
    }
  } catch (error) {
    return {
      answers: {},
      observations: '',
      parseError: error.message,
    }
  }
}

/**
 * Process a single screenshot
 */
async function processScreenshot(screenshotPath, questions) {
  const imageName = path.basename(screenshotPath)
  console.log(`  📷 Processing: ${imageName}`)
  
  const base64Image = imageToBase64(screenshotPath)
  const payload = buildGLMRequest(base64Image, questions, imageName)
  
  const startTime = Date.now()
  const glmResponse = await callGLMAPI(payload)
  const duration = Date.now() - startTime
  
  const parsed = parseGLMResponse(glmResponse)
  
  return {
    screenshot: imageName,
    screenshotPath: screenshotPath,
    answers: parsed.answers,
    observations: parsed.observations,
    parseError: parsed.parseError || null,
    apiDuration: duration,
    tokenUsage: glmResponse.usage || null,
  }
}

/**
 * Collect all screenshots from artifact directory
 */
function collectScreenshots(artifactDir) {
  const screenshots = []
  
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name.endsWith('.png')) {
        screenshots.push(fullPath)
      }
    }
  }
  
  walk(artifactDir)
  return screenshots
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2)
  
  // Parse arguments
  let artifactPath = null
  let questionSetVersion = 'v1'
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--artifact-path' && args[i + 1]) {
      artifactPath = args[++i]
    } else if (args[i] === '--question-set' && args[i + 1]) {
      questionSetVersion = args[++i]
    } else if (!artifactPath && !args[i].startsWith('--')) {
      artifactPath = args[i]
    }
  }
  
  if (!artifactPath) {
    console.error('Usage: run_glm_visual_judge.mjs <artifact-path> [--question-set v1]')
    process.exit(1)
  }
  
  if (!fs.existsSync(artifactPath)) {
    console.error(`Artifact path not found: ${artifactPath}`)
    process.exit(1)
  }
  
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  PHASE 2 — VISUAL JUDGMENT: GLM-4.6V Analysis')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  Artifact Path: ${artifactPath}`)
  console.log(`  Question Set: ${questionSetVersion}`)
  console.log('')
  
  try {
    // Load question set
    const questionSet = loadQuestionSet(questionSetVersion)
    console.log(`📋 Loaded ${questionSet.questions.length} questions from ${questionSet.version}`)
    console.log('')
    
    // Collect screenshots
    const screenshots = collectScreenshots(artifactPath)
    console.log(`📸 Found ${screenshots.length} screenshot(s)`)
    
    if (screenshots.length === 0) {
      console.error('❌ No screenshots found in artifact path')
      process.exit(1)
    }
    
    // Process each screenshot
    console.log('')
    console.log('🔍 Analyzing screenshots with GLM-4.6V...')
    
    const results = []
    for (const screenshot of screenshots) {
      try {
        const result = await processScreenshot(screenshot, questionSet.questions)
        results.push(result)
      } catch (error) {
        console.error(`  ❌ Failed to process ${path.basename(screenshot)}: ${error.message}`)
        results.push({
          screenshot: path.basename(screenshot),
          screenshotPath: screenshot,
          error: error.message,
          answers: {},
          observations: '',
        })
      }
    }
    
    // Build GLM report
    const glmReport = {
      version: '1.0.0',
      phase: 'VISUAL_JUDGMENT',
      generatedAt: new Date().toISOString(),
      artifactPath,
      questionSet: {
        version: questionSet.version,
        questionCount: questionSet.questions.length,
        questions: questionSet.questions,
      },
      results,
      summary: {
        totalScreenshots: screenshots.length,
        processedSuccessfully: results.filter(r => !r.error).length,
        processingErrors: results.filter(r => r.error).length,
      },
    }
    
    // Write report
    const reportPath = path.join(artifactPath, 'glm_report.json')
    fs.writeFileSync(reportPath, JSON.stringify(glmReport, null, 2))
    
    console.log('')
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('  VISUAL JUDGMENT COMPLETE')
    console.log('═══════════════════════════════════════════════════════════════')
    console.log(`  Report: ${reportPath}`)
    console.log(`  Screenshots Processed: ${glmReport.summary.processedSuccessfully}/${glmReport.summary.totalScreenshots}`)
    console.log('')
    
    // Output for orchestrator
    const output = {
      glmReportPath: reportPath,
      artifactPath,
      processedCount: glmReport.summary.processedSuccessfully,
      errorCount: glmReport.summary.processingErrors,
    }
    
    fs.writeFileSync(path.join(artifactPath, 'phase2_output.json'), JSON.stringify(output, null, 2))
    console.log('OUTPUT_JSON:' + JSON.stringify(output))
    
    process.exit(glmReport.summary.processingErrors > 0 ? 1 : 0)
    
  } catch (error) {
    console.error('❌ GLM analysis failed:', error.message)
    process.exit(1)
  }
}

main()
