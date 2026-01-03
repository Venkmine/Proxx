# UI Visual Verification Policy

**Version:** 1.0  
**Status:** MANDATORY  
**Effective Date:** 2026-01-03

---

## The Rule

> **NO SCREENSHOTS = NO VERIFIED FIX**

Any UI change (layout, visibility, interaction, styling, UX behavior) is **INVALID** unless accompanied by **Electron screenshots**.

This rule applies to:
- Layout changes (positioning, sizing, alignment)
- Visibility changes (showing/hiding elements)
- Styling changes (colors, borders, shadows, fonts)
- Interaction changes (hover states, focus, animations)
- Any change that affects what the user sees

---

## What Counts as Valid Visual Proof

### REQUIRED: Electron Screenshots Only

Valid visual verification requires:

1. **Electron-launched app only** (not browser, not Vite dev server)
2. **Screenshots captured via Playwright Electron API**
3. **Stored under `artifacts/ui/visual/<timestamp>/<test-name>/`**
4. **Must clearly show the claimed change**

### Required Baseline Screenshots

Every UI change must include screenshots for these states:

| State | When to Capture | Purpose |
|-------|----------------|---------|
| **idle** | App loaded, no active jobs | Baseline state |
| **job_started** | Job created, PENDING status | Pre-execution state |
| **progress_visible** | Job RUNNING, progress shown | Active execution state |
| **completed** | Job finished successfully | Post-execution state |

Additional screenshots may be required depending on the change:
- Error states
- Intermediate stages (e.g., "analyzing", "encoding")
- Different viewport sizes (if layout is responsive)
- Edge cases (e.g., very long filenames, overflow conditions)

### Screenshot Quality Requirements

- **Full window capture** (not clipped regions)
- **Minimum 1280x800 viewport**
- **PNG format with lossless compression**
- **File size > 1KB** (empty/blank screenshots are invalid)
- **Clear visibility** of the element being changed

---

## Why This Rule Exists

### 1. Copilot Cannot See UI

Copilot operates on code, not visual output. It can:
- ✅ Modify CSS properties
- ✅ Change HTML structure
- ✅ Update component logic

But it **cannot** see:
- ❌ Whether elements are actually visible
- ❌ Layout bugs (clipping, overflow, z-index issues)
- ❌ Visual artifacts (glitches, rendering bugs)
- ❌ Accessibility issues (contrast, readability)

**Code-level reasoning is insufficient for UI verification.**

### 2. Layout Bugs are Perceptual, Not Logical

A progress bar may:
- ✅ Exist in the DOM
- ✅ Have correct CSS styles
- ✅ Have proper data bindings

But still be:
- ❌ Hidden behind another element (z-index)
- ❌ Clipped by parent overflow
- ❌ Too small to see (1px height)
- ❌ Off-screen due to positioning

**Visual verification is the only way to confirm UI correctness.**

### 3. Electron ≠ Browser

The Vite dev server (http://localhost:5173) runs in a browser environment, which differs from Electron:

| Aspect | Browser (Vite) | Electron |
|--------|---------------|----------|
| **Rendering engine** | System WebKit/Blink | Chromium (bundled) |
| **Window chrome** | Browser UI | Custom titlebar |
| **IPC** | N/A | Main ↔ Renderer |
| **File access** | Restricted | Full system access |
| **Playback codecs** | Limited | Extensive (FFmpeg) |

A UI fix that works in the browser may fail in Electron due to:
- Different layout behavior
- Window constraints
- IPC timing issues

**Testing must happen in the actual Electron app.**

### 4. Prevents False Confidence and Regression Loops

Without visual verification:
1. Developer makes CSS change
2. Code review passes (CSS looks correct)
3. Tests pass (element exists in DOM)
4. Deploy to production
5. User reports: "I still can't see the progress bar"
6. **Regression loop** begins

With visual verification:
1. Developer makes CSS change
2. **Captures Electron screenshots**
3. **Reviews screenshots** before commit
4. Issues are caught **before** deployment

**Visual verification breaks the regression loop.**

---

## Enforcement

### Pre-Commit Checklist

Before committing any UI change:

- [ ] Electron app launched via `pnpm run dev:electron`
- [ ] Visual test created or updated in `qa/verify/ui/visual_regression/`
- [ ] Screenshots captured for all required states
- [ ] Screenshots reviewed and confirm the fix
- [ ] Screenshot paths logged in test output
- [ ] Commit message references screenshot locations

### Code Review Requirements

Reviewers must verify:
- [ ] Screenshots exist in `artifacts/ui/visual/` directory
- [ ] Screenshots clearly show the claimed change
- [ ] Screenshots are from Electron (not browser)
- [ ] Test assertions include screenshot existence checks

### CI/CD Requirements

**Future:** CI pipeline will reject commits that:
- Modify UI code without corresponding visual tests
- Have failing visual tests
- Have missing screenshot artifacts

---

## How to Capture Electron Screenshots

### 1. Launch Electron App

```bash
cd /path/to/Proxx
pnpm run dev:electron
```

**Do not** use `pnpm run dev` (Vite only) for UI verification.

### 2. Run Visual Tests

```bash
cd qa/verify/ui/visual_regression
pnpm test visual_progress_visibility.spec.ts
```

### 3. Verify Screenshots

Check `artifacts/ui/visual/<timestamp>/<test-name>/` for:
- `idle.png`
- `job_started.png`
- `progress_visible.png`
- Any additional state screenshots

### 4. Review Screenshots

Open each screenshot and verify:
- The changed element is visible
- The change matches the intended design
- No unexpected side effects (clipping, layout shifts)

### 5. Commit with Evidence

```bash
git add artifacts/ui/visual/
git commit -m "fix(ui): enhance progress bar visibility

Visual verification screenshots:
- artifacts/ui/visual/2026-01-03T17-28-00-000Z/progress_visibility/idle.png
- artifacts/ui/visual/2026-01-03T17-28-00-000Z/progress_visibility/progress_visible.png

Progress bar now 6-8px height, enhanced contrast, visible in running jobs."
```

---

## Helper Functions

### captureElectronScreenshot

```typescript
import { captureElectronScreenshot } from './helpers'

const screenshotPath = await captureElectronScreenshot(page, visualCollector, 'idle')
expect(fs.existsSync(screenshotPath)).toBe(true)
```

### waitForJobRunning

```typescript
import { waitForJobRunning } from './helpers'

const isRunning = await waitForJobRunning(page, 15000)
if (isRunning) {
  // Capture progress screenshot
}
```

### waitForProgressVisible

```typescript
import { waitForProgressVisible } from './helpers'

const progressVisible = await waitForProgressVisible(page, 10000)
expect(progressVisible).toBe(true)
```

---

## Examples of Valid Visual Verification

### Example 1: Progress Bar Height Increase

**Claim:** "Progress bar height increased from 3-4px to 6-8px"

**Required Evidence:**
- `before.png` - Shows old 3-4px progress bar
- `after.png` - Shows new 6-8px progress bar
- Both captured from Electron with same job state

### Example 2: Zoom Indicator Always Visible

**Claim:** "Zoom indicator now always visible, shows 'Fit' or '100%'"

**Required Evidence:**
- `zoom_fit_mode.png` - Shows "Fit" indicator in fit mode
- `zoom_actual_mode.png` - Shows "100%" indicator in actual size mode
- Both captured from Electron

### Example 3: Status Panel Width Increase

**Claim:** "Status panel width increased from 360px to 440px"

**Required Evidence:**
- `status_panel_before.png` - Shows 360px width (if available)
- `status_panel_after.png` - Shows 440px width
- Captured from Electron with visible status messages

---

## Invalid Visual Verification (Examples)

### ❌ Invalid: Browser Screenshot

```
Screenshot captured from http://localhost:5173 in Chrome
```

**Why invalid:** Not Electron, different rendering environment.

### ❌ Invalid: Code Reasoning Only

```
"Progress bar should be visible because I set height: 6px and display: block"
```

**Why invalid:** No visual proof, assumptions about rendering.

### ❌ Invalid: Missing Screenshots

```
Test passed, but no screenshot files in artifacts/
```

**Why invalid:** No evidence that UI change is visible.

### ❌ Invalid: Blank/Empty Screenshots

```
Screenshot file exists but is 0 bytes or completely blank
```

**Why invalid:** Screenshot capture failed, no visual information.

---

## Cross-References

### Related Documentation

- **[docs/QA.md](./QA.md)** - General QA principles and test structure
- **[docs/OBSERVABILITY_PRINCIPLES.md](./OBSERVABILITY_PRINCIPLES.md)** - Observability and honesty principles
- **[qa/verify/ui/README.md](../qa/verify/ui/README.md)** - E2E test suite overview

### Relationship to Other Testing

| Test Type | What It Validates | UI Visual Verification |
|-----------|------------------|----------------------|
| **Truth Surface E2E** | Honesty (no fake progress) | **Complements** - validates perception |
| **Unit Tests** | Logic and state machines | **Does not replace** - different concerns |
| **Integration Tests** | API and data flow | **Does not replace** - different concerns |
| **Visual Regression** | UI appearance and layout | **This document** |

**Both Truth Surface E2E and Visual Verification are required for UI changes.**

- **Truth Surface E2E** ensures the app is honest (no fake progress, no misleading UI)
- **Visual Verification** ensures the app is perceivable (users can actually see what the app claims)

---

## FAQ

### Q: Do I need screenshots for every CSS change?

**A:** Yes, if the CSS change affects what the user sees. This includes:
- Layout (position, size, margins, padding)
- Visibility (display, opacity, z-index)
- Styling (colors, borders, shadows, fonts)

### Q: What if the backend isn't running?

**A:** You can still capture screenshots for:
- Idle state
- Job creation UI
- Static elements (zoom indicator, status panel layout)

For progress visibility, you may need to mock backend responses or run a real backend locally.

### Q: Can I use jest-image-snapshot or similar tools?

**A:** Not yet. Currently, visual verification is manual review of screenshots. Automated pixel-diff testing may be added in the future.

### Q: What if I'm fixing a bug that only happens sometimes?

**A:** Capture screenshots of:
- The bug state (if reproducible)
- The fixed state after your change
- Any edge cases that triggered the bug

### Q: Do I need screenshots for documentation changes?

**A:** No, this policy applies only to code changes that affect the UI.

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-03 | Initial policy document |

---

## Acknowledgments

This policy was created in response to repeated UI regression loops where:
- CSS changes appeared correct in code
- Tests passed with elements existing in DOM
- Users reported elements were still not visible
- Root cause: **No visual verification step**

Visual verification is mandatory to prevent false confidence and ensure UI changes are actually perceivable by users.

---

**Remember: Code-level reasoning is insufficient for UI verification. Screenshots are the source of truth.**
