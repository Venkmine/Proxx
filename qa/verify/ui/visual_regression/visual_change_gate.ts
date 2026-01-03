/**
 * Visual Change Gate
 * 
 * PURPOSE:
 * Hard gate that fails QC immediately if semantic actions don't produce
 * visible UI changes. This prevents false positives where actions appear
 * to succeed but leave the UI unchanged.
 * 
 * DESIGN:
 * - Uses pixel diff comparison (no GLM)
 * - Threshold: 5% minimum change required
 * - Compares before/after screenshots
 * - Throws VisualChangeError on insufficient change
 * - Logs diff metrics for debugging
 * 
 * This is a TRUST FIX - no retries, no optimistic summaries.
 */

import { Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

export class VisualChangeError extends Error {
  constructor(
    message: string,
    public readonly actionId: string,
    public readonly diffPercent: number,
    public readonly beforePath: string,
    public readonly afterPath: string
  ) {
    super(message)
    this.name = 'VisualChangeError'
  }
}

export interface VisualDiffMetrics {
  action_id: string
  before_screenshot: string
  after_screenshot: string
  pixels_changed: number
  total_pixels: number
  diff_percent: number
  threshold_percent: number
  passed: boolean
  timestamp: string
}

/**
 * Compare two PNG screenshots and calculate pixel difference percentage
 */
export async function compareScreenshots(
  beforePath: string,
  afterPath: string
): Promise<{ diffPixels: number; totalPixels: number; diffPercent: number }> {
  // Read both images
  const img1 = PNG.sync.read(fs.readFileSync(beforePath))
  const img2 = PNG.sync.read(fs.readFileSync(afterPath))

  // Ensure same dimensions
  if (img1.width !== img2.width || img1.height !== img2.height) {
    throw new Error(
      `Screenshot dimensions mismatch: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`
    )
  }

  const { width, height } = img1
  const totalPixels = width * height

  // Create diff image
  const diff = new PNG({ width, height })

  // Compare pixels
  const diffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    {
      threshold: 0.1, // Sensitivity to color differences
      includeAA: false, // Don't count anti-aliasing as differences
    }
  )

  const diffPercent = (diffPixels / totalPixels) * 100

  return {
    diffPixels,
    totalPixels,
    diffPercent,
  }
}

/**
 * Visual Change Gate: Compare before/after screenshots and fail if change is too small
 * 
 * @param actionId - Semantic action identifier
 * @param beforePath - Path to screenshot before action
 * @param afterPath - Path to screenshot after action
 * @param thresholdPercent - Minimum required change (default: 5%)
 * @returns VisualDiffMetrics
 * @throws VisualChangeError if change is below threshold
 */
export async function assertVisualChange(
  actionId: string,
  beforePath: string,
  afterPath: string,
  thresholdPercent: number = 5.0
): Promise<VisualDiffMetrics> {
  // Skip if before screenshot doesn't exist (first action)
  if (!fs.existsSync(beforePath)) {
    return {
      action_id: actionId,
      before_screenshot: beforePath,
      after_screenshot: afterPath,
      pixels_changed: 0,
      total_pixels: 0,
      diff_percent: 100.0, // Assume significant change for first action
      threshold_percent: thresholdPercent,
      passed: true,
      timestamp: new Date().toISOString(),
    }
  }

  // Skip if after screenshot doesn't exist
  if (!fs.existsSync(afterPath)) {
    throw new Error(`After screenshot not found: ${afterPath}`)
  }

  // Compare screenshots
  const { diffPixels, totalPixels, diffPercent } = await compareScreenshots(
    beforePath,
    afterPath
  )

  const metrics: VisualDiffMetrics = {
    action_id: actionId,
    before_screenshot: beforePath,
    after_screenshot: afterPath,
    pixels_changed: diffPixels,
    total_pixels: totalPixels,
    diff_percent: diffPercent,
    threshold_percent: thresholdPercent,
    passed: diffPercent >= thresholdPercent,
    timestamp: new Date().toISOString(),
  }

  // FAIL if change is below threshold
  if (!metrics.passed) {
    throw new VisualChangeError(
      `No visible UI change after semantic action ${actionId}`,
      actionId,
      diffPercent,
      beforePath,
      afterPath
    )
  }

  return metrics
}

/**
 * Write visual diff metrics to execution metadata
 */
export function recordVisualDiffMetrics(
  artifactDir: string,
  metrics: VisualDiffMetrics
): void {
  const metadataPath = path.join(artifactDir, 'execution_metadata.json')
  
  let metadata: any = {}
  if (fs.existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
    } catch (e) {
      // Ignore parse errors, start fresh
    }
  }

  if (!metadata.visual_change_gates) {
    metadata.visual_change_gates = []
  }

  metadata.visual_change_gates.push(metrics)

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
}
