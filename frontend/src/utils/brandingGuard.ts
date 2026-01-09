/**
 * BRANDING QC GUARD
 * 
 * This module enforces the single-logo rule at runtime during development.
 * 
 * RULE: Exactly ONE Forge logo image in the entire UI (header only)
 * 
 * Allowed:
 * - ONE <img> with src containing "FORGE_MOONLANDER_LOGO_WHITE"
 * - Located in app header only
 * 
 * NOT Allowed:
 * - Multiple logo images
 * - Logo images outside header
 * - Logo SVGs as branding
 * - Background image logos
 * 
 * Text-only branding ("Forge", "FORGE") is always allowed.
 */

const FORGE_LOGO_PATTERN = /FORGE_MOONLANDER_LOGO_WHITE/
const EXPECTED_LOGO_COUNT = 1

/**
 * Checks DOM for branding violations.
 * Only runs in development mode.
 * 
 * @returns Object with violation status and details
 */
export function checkBrandingCompliance(): {
  compliant: boolean
  logoCount: number
  violations: string[]
} {
  if (typeof document === 'undefined') {
    return { compliant: true, logoCount: 0, violations: [] }
  }

  const violations: string[] = []
  let logoCount = 0

  // Find all images
  const images = document.querySelectorAll('img')
  const logoImages: HTMLImageElement[] = []

  images.forEach((img) => {
    const src = img.getAttribute('src') || ''
    if (FORGE_LOGO_PATTERN.test(src)) {
      logoCount++
      logoImages.push(img)
    }
  })

  // Check count
  if (logoCount > EXPECTED_LOGO_COUNT) {
    violations.push(
      `BRANDING VIOLATION: Found ${logoCount} Forge logo images, expected ${EXPECTED_LOGO_COUNT}`
    )
    logoImages.forEach((img, i) => {
      const parent = img.closest('[data-testid]')
      const testId = parent?.getAttribute('data-testid') || 'unknown'
      violations.push(`  [${i + 1}] Location: ${testId}, src: ${img.src}`)
    })
  }

  // Check location (should be in header)
  if (logoCount === 1 && logoImages[0]) {
    const img = logoImages[0]
    const isInHeader = img.closest('header') !== null || 
                       img.getAttribute('data-testid') === 'forge-app-logo'
    
    if (!isInHeader) {
      violations.push(
        `BRANDING VIOLATION: Logo found outside header at ${img.closest('[data-testid]')?.getAttribute('data-testid') || 'unknown'}`
      )
    }
  }

  return {
    compliant: violations.length === 0,
    logoCount,
    violations,
  }
}

/**
 * Runs branding check and logs violations to console.
 * Only active in development mode.
 */
export function enforceBrandingGuard(): void {
  // Only run in development
  if (import.meta.env.PROD) return

  // Delay to allow DOM to settle
  setTimeout(() => {
    const result = checkBrandingCompliance()
    
    if (!result.compliant) {
      console.error(
        '%c🚨 BRANDING GUARD VIOLATION',
        'background: #ff0000; color: white; font-weight: bold; padding: 4px 8px;'
      )
      result.violations.forEach((v) => console.error(v))
      console.error(
        '%cFix: Only App header should contain the Forge logo image.',
        'color: #ffaa00; font-weight: bold;'
      )
    } else if (result.logoCount === 1) {
      console.log(
        '%c✓ Branding compliant: 1 logo in header',
        'color: #00aa00;'
      )
    }
  }, 2000) // Wait for app to fully render
}
