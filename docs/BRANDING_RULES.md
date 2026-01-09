# Branding Rules — Forge Application

**Version:** 1.0.0  
**Status:** NORMATIVE  
**Last Updated:** 2026-01-09

---

## Single Logo Rule

### Core Principle

> **There is exactly ONE Forge logo image in the entire UI.**

This is not a design preference. This is brand authority and cognitive load control.

---

## Allowed Branding

### Forge Logo Image ✅

- **Location:** Top-left application header ONLY
- **Asset:** `FORGE_MOONLANDER_LOGO_WHITE.png`
- **Component:** `App.tsx` header section
- **Implementation:** `<img>` element only
- **Count:** Exactly 1

### Text Branding ✅

Text-based branding is allowed anywhere:

- Plain text: `"Forge"` or `"FORGE"`
- Low-opacity text watermarks (CSS `opacity` only)
- Status indicators: `"Forge Alpha"`

**Text branding is NOT rendered via `<img>` or logo assets.**

### Awaire Text ✅

- Status indicator only: `"Awaire ● Connected"`
- Text-only, no images, no logos, no SVGs

---

## Prohibited Usage

### Logo Images ❌

The following are NEVER allowed outside the header:

- Logo `<img>` elements
- Logo SVGs as branding
- Background image logos
- Splash screen logos
- Preview/monitor logos
- Fallback logo images
- Watermark logo images

### Opacity Tricks ❌

- No background-image logos with opacity
- No positioned logo overlays
- No "helpful" fallback logos

---

## Component Responsibilities

| Component | Logo Image? | Text Branding? |
|-----------|-------------|----------------|
| **App header** | ✅ Yes (ONLY here) | ✅ Yes |
| **SplashScreen** | ❌ No | ✅ Yes ("Forge ALPHA") |
| **MonitorSurface** | ❌ No | ✅ Yes ("FORGE" at 15% opacity) |
| **VisualPreviewWorkspace** | ❌ No | ✅ Optional |
| **TitleBar** | ❌ No | ✅ Yes ("Forge") |
| **Queue empty state** | ❌ No | ✅ Yes (text only) |

---

## QC Enforcement

### Development Guard

The branding guard (`src/utils/brandingGuard.ts`) runs on app mount in development mode:

1. Counts all `<img>` elements with Forge logo src
2. Verifies count === 1
3. Verifies location is in header
4. Logs violations to console

### Build Verification

Before release, verify:

```bash
# Rebuild clean
cd frontend && rm -rf dist && pnpm run build

# Count logo references in bundle (should be 1)
grep -o "FORGE_MOONLANDER_LOGO_WHITE" dist/assets/*.js | wc -l
```

Expected output: `1`

---

## Why This Matters

1. **Brand Authority** — One logo, one identity, one source of truth
2. **Cognitive Load** — Users don't need logo reinforcement on every screen
3. **Regression Prevention** — Clear rules prevent well-meaning additions
4. **QC Automation** — Countable, testable, enforceable

---

## History

| Date | Change |
|------|--------|
| 2026-01-09 | Initial branding authority reset |
| 2026-01-09 | Added QC guard in development |
| 2026-01-09 | Removed logos from splash, monitor, queue |

---

## Violations

If you see a Forge logo image outside the header:

1. It is a bug
2. Remove it
3. Replace with text if needed
4. Run branding guard to verify

**Do not add "helpful" logos. The single-logo rule is non-negotiable.**
