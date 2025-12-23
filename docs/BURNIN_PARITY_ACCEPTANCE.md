# Phase 9C: Burn-In Preview Parity — Acceptance Checklist

## Purpose

This document defines the **manual acceptance testing procedure** for validating burn-in preview parity. It establishes what "visual equivalence" means within documented alpha constraints.

---

## Key Principle: FFmpeg-Representative, NOT Identical

Preview burn-in rendering is designed to be **representative** of FFmpeg output, not pixel-identical.

### Why Pixel-Perfect Parity is Not Achievable

1. **FFmpeg fonts are platform-dependent**: No `fontfile=` specified means FFmpeg uses system defaults
   - macOS: System fonts via libfreetype
   - Linux: DejaVu Sans, Liberation Sans, etc.
   - Windows: Arial or system fallbacks

2. **Rendering engines differ**: CSS vs libfreetype produce different anti-aliasing

3. **Position systems differ**: Preview uses percentage-based safe areas; FFmpeg uses pixel offsets

---

## Acceptance Criteria

### ✅ MUST PASS (Hard Requirements)

These conditions must be satisfied for the phase to be considered complete:

| Criterion | How to Verify |
|-----------|---------------|
| **Relative position matches** | Overlay appears in same corner/region in preview and output |
| **Anchor alignment correct** | "Top Left" anchor places overlay in top-left area |
| **No font jumps during zoom** | Change zoom preset (Fit → 100% → 200%), text remains stable |
| **No text clipping** | Overlay text fully visible, not cut off at edges |
| **No scaling drift** | Repeat scale operation, overlay returns to same position |
| **Timecode digits stable** | If playing, digit changes don't cause overlay to shift/reflow |

### ⚠️ ALLOWED DIFFERENCES (Alpha Tolerances)

These differences are expected and acceptable:

- **Kerning variations**: Character spacing may differ slightly
- **Font weight appearance**: Preview may appear bolder/lighter than output
- **Exact pixel position**: Percentage vs pixel offset causes small shifts
- **Anti-aliasing rendering**: Edge smoothing will look different
- **Background box padding**: May vary by 1-2 pixels

### ❌ NOT REQUIRED

Do not fail the test for these:

- Pixel-perfect match between preview and output
- Identical font rendering
- Exact same background opacity appearance

---

## Test Procedure

### Prerequisites

1. Backend running (`uvicorn app.main:app --reload`)
2. Frontend running (`npm run dev` or Electron app)
3. Test media file loaded with valid timecode

### Step-by-Step

#### 1. Prepare Test Job

1. Load a source file with embedded timecode
2. Add a **timecode overlay** layer at "Top Left" anchor
3. Add a **metadata overlay** layer at "Bottom Right" anchor
4. Configure both with:
   - Font size: 24pt
   - Background: enabled
   - Opacity: 1.0

#### 2. Preview Verification

1. **Zoom Test**:
   - Set zoom to "Fit"
   - Verify overlays visible and positioned correctly
   - Change to "100%", then "200%"
   - ✅ PASS: No jumping, reflow, or unexpected repositioning

2. **Anchor Test**:
   - Change timecode anchor to each position (all 9 anchors)
   - ✅ PASS: Overlay moves to expected screen region each time

3. **Mode Switch Test**:
   - Switch between View → Overlays → Burn-In modes
   - ✅ PASS: Overlays visible in all modes (behavior may differ)
   - ✅ PASS: Overlays not draggable in View mode

#### 3. Screenshot Comparison

1. Set preview to 100% zoom
2. Take screenshot of preview (Cmd+Shift+4 on macOS)
3. Render the job to output
4. Extract frame from output at same timecode:
   ```bash
   ffmpeg -i output.mov -vf "select=eq(n\,0)" -vframes 1 frame.png
   ```
5. Open both images side-by-side
6. Compare against acceptance criteria above

#### 4. Record Results

| Test | Result | Notes |
|------|--------|-------|
| Relative position | ☐ PASS / ☐ FAIL | |
| Anchor alignment | ☐ PASS / ☐ FAIL | |
| Font stability (zoom) | ☐ PASS / ☐ FAIL | |
| No clipping | ☐ PASS / ☐ FAIL | |
| No scaling drift | ☐ PASS / ☐ FAIL | |
| TC digit stability | ☐ PASS / ☐ FAIL | |

---

## Known Discrepancies (Document, Don't Fix)

These are **alpha constraints**, not bugs:

1. **Safe Area Position Offset**
   - Preview: Uses 10% title-safe inset (percentage-based)
   - FFmpeg: Uses `x=10:y=10` (pixel-based)
   - Result: Overlay position may differ by a few percent

2. **Font Fallback Chain**
   - Preview: `Menlo, Monaco, "Courier New", monospace`
   - FFmpeg: System default (varies by platform)
   - Result: Character shapes may appear slightly different

3. **Background Box Rendering**
   - Preview: CSS `border-radius` and `padding`
   - FFmpeg: `boxborderw=5` parameter
   - Result: Box corners and padding may differ

---

## Invariant Validation

The following invariants should NOT be triggered during testing:

- `BURNIN_FONT_MISMATCH` — Would indicate preview is not using expected font constant
- `BURNIN_FONT_SIZE_DRIFT` — Would indicate font size instability
- `PREVIEW_TRANSFORM_BYPASS` — Would indicate coordinates outside valid range

Check the Invariant Banner in the UI for any violations during testing.

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Lead | | | |

---

*Phase 9C — Burn-In Preview Parity*
*Last Updated: 2025-12-23*
