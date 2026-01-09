/**
 * BRANDING QC GUARD
 * 
 * This module enforces branding semantics at runtime during development.
 * 
 * BRANDING MODEL:
 * - LOGO-ICON: Non-text geometric mark (image only) - header only
 * - WORDMARK-TEXT: Text "Forge" - allowed in specific locations
 * 
 * RULES:
 * 1. Header: Logo icon (image) + wordmark text allowed
 * 2. Splash screen: Wordmark text ONLY (no images)
 * 3. Monitor/Preview: NO branding OR neutral text only
 * 4. Title bar: Wordmark text ONLY
 * 
 * VIOLATION DETECTION:
 * - Wordmark-as-image (FORGE_MOONLANDER_LOGO) anywhere = VIOLATION
 * - Multiple logo icons = VIOLATION
 * - Logo icon outside header = VIOLATION
 * 
 * See: src/branding/constants.ts for authoritative rules
 */

// Patterns for detection
const WORDMARK_IMAGE_PATTERN = /FORGE_MOONLANDER|forge-logo\.png|wordmark/i
const LOGO_ICON_PATTERN = /forge-icon/i
const DEPRECATED_BRANDING_IMAGES = [
  'FORGE_MOONLANDER_LOGO_WHITE.png',
  'forge-logo.png',
  'AWAIRE_Logo_Main_PNG.png',
  'awaire-logo.png',
]

/**
 * Checks DOM for branding violations.
 * Only runs in development mode.
 * 
 * @returns Object with violation status and details
 */
export function checkBrandingCompliance(): {
  compliant: boolean
  logoIconCount: number
  wordmarkTextCount: number
  violations: string[]
} {
  if (typeof document === 'undefined') {
    return { compliant: true, logoIconCount: 0, wordmarkTextCount: 0, violations: [] }
  }

  const violations: string[] = []
  let logoIconCount = 0
  let wordmarkTextCount = 0

  // Find all images
  const images = document.querySelectorAll('img')
  
  images.forEach((img) => {
    const src = img.getAttribute('src') || ''
    
    // Check for deprecated wordmark-as-image (VIOLATION)
    if (WORDMARK_IMAGE_PATTERN.test(src)) {
      violations.push(
        `BRANDING VIOLATION: Wordmark-as-image detected: ${src}`
      )
      const parent = img.closest('[data-testid]')
      violations.push(
        `  Location: ${parent?.getAttribute('data-testid') || 'unknown'}`
      )
      violations.push(
        `  Fix: Replace image with text wordmark or logo icon`
      )
    }
    
    // Check for deprecated Awaire/old branding
    for (const deprecated of DEPRECATED_BRANDING_IMAGES) {
      if (src.includes(deprecated)) {
        violations.push(
          `BRANDING VIOLATION: Deprecated asset in use: ${deprecated}`
        )
      }
    }
    
    // Count logo icons (should be exactly 1, in header)
    if (LOGO_ICON_PATTERN.test(src)) {
      logoIconCount++
      
      // Check if in header
      const isInHeader = img.getAttribute('data-testid') === 'forge-logo-icon' ||
                         img.closest('[data-testid="app-header"]') !== null
      
      if (!isInHeader && logoIconCount === 1) {
        violations.push(
          `BRANDING VIOLATION: Logo icon found outside header`
        )
      }
    }
  })

  // Count wordmark text elements (via data attribute)
  const wordmarkElements = document.querySelectorAll('[data-branding-type="wordmark-text"]')
  wordmarkTextCount = wordmarkElements.length

  // Check for multiple logo icons
  if (logoIconCount > 1) {
    violations.push(
      `BRANDING VIOLATION: Found ${logoIconCount} logo icons, expected max 1`
    )
  }

  // Check for logo icon without wordmark in header (should have both)
  if (logoIconCount === 1) {
    const logoIcon = document.querySelector('[data-testid="forge-logo-icon"]')
    const headerWordmark = document.querySelector('[data-testid="forge-wordmark"]')
    
    if (logoIcon && !headerWordmark) {
      violations.push(
        `BRANDING WARNING: Logo icon without wordmark text in header`
      )
    }
  }

  return {
    compliant: violations.length === 0,
    logoIconCount,
    wordmarkTextCount,
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
        '%cFix: See src/branding/constants.ts for branding rules.',
        'color: #ffaa00; font-weight: bold;'
      )
    } else {
      console.log(
        `%c✓ Branding compliant: ${result.logoIconCount} logo icon(s), ${result.wordmarkTextCount} wordmark text(s)`,
        'color: #00aa00;'
      )
    }
  }, 2000) // Wait for app to fully render
}
