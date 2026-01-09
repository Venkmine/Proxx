# Branding Rules — Forge Application

**Version:** 2.0.0  
**Status:** NORMATIVE  
**Last Updated:** 2026-01-09

---

## Branding Semantics Model

### CRITICAL: Logo vs Wordmark Distinction

This document defines the **authoritative** branding model. Copilot and all engineers MUST follow these rules.

| Type | Definition | Example |
|------|------------|---------|
| **Logo Icon** | Non-text geometric mark (image only) | `forge-icon.svg` |
| **Wordmark** | Text "Forge" rendered as text (never image) | `<span>Forge</span>` |

### The Problem This Solves

Previously, the Forge logo was a **wordmark-as-image** (`FORGE_MOONLANDER_LOGO_WHITE.png` — the word "Forge" styled as a PNG). This caused visual duplication when shown alongside text "Forge", even when code-level rules were technically correct.

### The Solution

1. **Logo Icon**: Use `forge-icon.svg` (geometric mark) in header
2. **Wordmark**: Use text `"Forge"` (never an image)
3. **Never**: Use `FORGE_MOONLANDER_LOGO_WHITE.png` (deprecated)

---

## Allowed Branding by Location

### Header (Top-Left) ✅

- Logo icon (image): `forge-icon.svg`
- Wordmark text: `"Forge"`
- Both allowed together (icon + text)

### SplashScreen ✅

- Wordmark TEXT ONLY: `"Forge"`
- NO images allowed

### MonitorSurface / Preview ✅

- NO branding OR neutral instructional text only
- Example: "Drop media here" (not "FORGE")

### TitleBar ✅

- Wordmark TEXT ONLY: `"Forge"`
- NO images allowed

### Queue Empty State ✅

- TEXT ONLY
- NO images allowed

---

## Prohibited Usage ❌

### Wordmark-as-Image (DEPRECATED)

The following assets are DEPRECATED and must NOT be used:

```
❌ FORGE_MOONLANDER_LOGO_WHITE.png  (wordmark image)
❌ forge-logo.png                   (wordmark image)
❌ AWAIRE_Logo_Main_PNG.png         (old branding)
❌ awaire-logo.png                  (old branding)
```

### Visual Duplication

Never show:
- Logo icon AND wordmark image together
- Wordmark image AND wordmark text together
- Same branding appearing twice in one viewport
grep -o "FORGE_MOONLANDER_LOGO_WHITE" dist/assets/*.js | wc -l
```

Expected output: `1`

---

## Why This Matters

---

## Asset Reference

### Approved Assets

| Asset | Type | Location | Usage |
|-------|------|----------|-------|
| `forge-icon.svg` | Logo Icon | Header only | Primary brand mark |
| `forge-icon-light-32x32.png` | Logo Icon | Header (fallback) | Light backgrounds |
| `forge-icon-dark-32x32.png` | Logo Icon | Header (fallback) | Dark backgrounds |

### Deprecated Assets (DO NOT USE)

| Asset | Reason |
|-------|--------|
| `FORGE_MOONLANDER_LOGO_WHITE.png` | Wordmark-as-image causes duplication |
| `forge-logo.png` | Wordmark-as-image causes duplication |
| `AWAIRE_Logo_Main_PNG.png` | Old branding |
| `awaire-logo.png` | Old branding |

---

## QC Enforcement

### Development Guard

The branding guard (`src/utils/brandingGuard.ts`) runs on app mount in development mode:

1. Detects deprecated wordmark-as-image usage
2. Counts logo icons (should be max 1)
3. Verifies logo icon is in header
4. Logs violations to console

### Build Verification

```bash
# Rebuild clean
cd frontend && rm -rf dist && pnpm run build

# Verify no deprecated assets in bundle
grep -c "FORGE_MOONLANDER" dist/assets/*.js  # Should be 0
grep -c "forge-icon" dist/assets/*.js        # Should be 1
```

---

## Rationale

1. **Brand Authority** — One logo, one identity, one source of truth
2. **Semantic Clarity** — Icon ≠ wordmark, never confuse them
3. **Visual Deduplication** — User sees branding ONCE per viewport
4. **Regression Prevention** — Clear rules prevent well-meaning additions
5. **QC Automation** — Countable, testable, enforceable

---

## History

| Date | Change |
|------|--------|
| 2026-01-09 | v2.0.0: Branding semantics model (logo icon vs wordmark) |
| 2026-01-09 | Deprecated FORGE_MOONLANDER wordmark-as-image |
| 2026-01-09 | Introduced forge-icon.svg as primary brand mark |
| 2026-01-09 | Updated QC guard for new model |

---

## Violations

If you see a deprecated branding asset:

1. It is a bug
2. Remove the deprecated image
3. Use logo icon OR wordmark text (never both as images)
4. Run branding guard to verify

**The branding semantics model is non-negotiable.**
