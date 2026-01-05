# Output Tab — Quick Reference

## Component Location
`frontend/src/components/OutputTab.tsx`

## Purpose
Pure structural skeleton for Output configuration panel. **NO BEHAVIOR.**

## Test IDs (All Required)

### Root
- `output-tab`

### Column 1: Destination
- `output-destination`
- `output-browse-button`
- `output-path-display`
- `output-path-status`

### Column 2: File Identity
- `output-identity`
- `output-container-select`
- `output-filename-template`

### Column 3: Delivery
- `output-delivery`
- `output-type`
- `output-preset-summary`
- `output-compat-warning`

### Preview
- `output-filename-preview`
- `output-preview-text`

## Layout Constraints

- **Width:** 480px (left panel width)
- **Columns:** 3, equal width, `grid-template-columns: 1fr 1fr 1fr`
- **Gap:** 1rem between columns
- **Preview:** Full width, separate row
- **Scroll:** Vertical only if needed
- **No horizontal overflow**

## Visual Demo

Open `qa/verify/ui/visual_regression/output_tab_demo.html` in browser.

## Test Suite

```bash
cd qa/verify/ui/visual_regression
npx playwright test intent_050_output_tab_layout.spec.ts
```

## Props (Display Only)

```typescript
interface OutputTabProps {
  outputPath?: string          // Default: '/path/to/output'
  containerFormat?: string     // Default: 'mov'
  filenameTemplate?: string    // Default: '{source_name}_proxy'
  deliveryType?: 'proxy' | 'delivery'  // Default: 'proxy'
  presetName?: string          // Default: 'No preset selected'
  compatWarning?: string       // Optional warning message
  previewFilename?: string     // Default: 'PROJECT_SCENE_TAKE_v01.mov'
}
```

## What's Missing (Intentional)

- ❌ Click handlers
- ❌ Validation logic
- ❌ State management
- ❌ Form interactions
- ❌ Error states
- ❌ Tooltips
- ❌ Animations

## Next Steps

1. Create behavior spec (when needed)
2. Wire to state stores
3. Add validation
4. Add interactions

**DO NOT** add logic without a spec.
