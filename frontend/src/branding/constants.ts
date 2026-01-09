/**
 * FORGE BRANDING CONSTANTS
 * 
 * CRITICAL: This is the SINGLE SOURCE OF TRUTH for all branding assets.
 * 
 * BRANDING TYPES:
 * - LOGO_ICON: Non-text geometric mark (image only)
 * - WORDMARK: Text "Forge" (text only, never an image)
 * 
 * USAGE RULES:
 * - Header: Logo icon (image) + optional small "Forge" text
 * - Splash screen: Wordmark TEXT ONLY (no images)
 * - Monitor idle/preview empty: NO branding OR very subtle TEXT (15% opacity)
 * - Queue empty: TEXT ONLY
 * - Title bar: TEXT ONLY
 * 
 * HARD RULE:
 * There must NEVER be a case where the same wordmark appears both as 
 * image AND text in the same UI state.
 */

// === LOGO ICON (non-text geometric mark) ===
export const FORGE_LOGO_ICON = {
  /** SVG icon - use for header, scalable contexts */
  svg: './branding/forge-icon.svg',
  /** PNG icon for light backgrounds (32x32) */
  pngLight: './branding/forge-icon-light-32x32.png',
  /** PNG icon for dark backgrounds (32x32) */
  pngDark: './branding/forge-icon-dark-32x32.png',
} as const;

// === WORDMARK (text only, never render as image) ===
export const FORGE_WORDMARK = {
  /** Full name for headers, titles */
  full: 'Forge',
  /** Uppercase for subtle backgrounds */
  uppercase: 'FORGE',
  /** Version label */
  version: 'ALPHA',
} as const;

// === DEPRECATED - DO NOT USE ===
// These are wordmark-as-image assets that cause branding ambiguity.
// They exist in the repo but should NOT be used in UI.
export const DEPRECATED_ASSETS = {
  /** @deprecated Wordmark image - causes visual duplication with text */
  FORGE_MOONLANDER_LOGO_WHITE: './branding/FORGE_MOONLANDER_LOGO_WHITE.png',
  /** @deprecated Wordmark image - causes visual duplication with text */
  forgeLogo: './branding/forge-logo.png',
} as const;

// === BRANDING TYPES (for runtime validation) ===
export type BrandingType = 'logo-icon' | 'wordmark-text';

export interface BrandingUsage {
  component: string;
  allowedTypes: BrandingType[];
  description: string;
}

export const BRANDING_RULES: BrandingUsage[] = [
  {
    component: 'Header',
    allowedTypes: ['logo-icon', 'wordmark-text'],
    description: 'Logo icon (image) + optional small "Forge" text',
  },
  {
    component: 'SplashScreen',
    allowedTypes: ['wordmark-text'],
    description: 'Wordmark TEXT ONLY (no images)',
  },
  {
    component: 'MonitorSurface',
    allowedTypes: ['wordmark-text'],
    description: 'Very subtle TEXT at 15% opacity or nothing',
  },
  {
    component: 'VisualPreviewWorkspace',
    allowedTypes: [],
    description: 'NO branding',
  },
  {
    component: 'TitleBar',
    allowedTypes: ['wordmark-text'],
    description: 'TEXT ONLY',
  },
  {
    component: 'QueueEmpty',
    allowedTypes: ['wordmark-text'],
    description: 'TEXT ONLY',
  },
];
