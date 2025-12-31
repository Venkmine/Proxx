# Burn-Ins V1 Documentation

## Overview

Burn-ins are visual overlays applied to proxy renders that display metadata information directly on the video frame. They are essential for:

- **Editorial workflows**: Timecode and filename visibility during offline editing
- **VFX workflows**: Frame numbers, shot names, and technical metadata for visual effects plates
- **QC workflows**: Full technical specifications for quality control and review

## Architecture

V1 Burn-Ins use a **Preset + Recipe** architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    BURN-IN RECIPES                       │
│    (Ordered stacks of presets)                          │
│                                                          │
│    OFFLINE_EDITORIAL  │  VFX_PLATE  │  QC_REVIEW        │
│         ↓                   ↓              ↓             │
└─────────────────────────────────────────────────────────┘
                    ↓                 ↓
┌─────────────────────────────────────────────────────────┐
│                   BURN-IN PRESETS                        │
│    (Atomic, position-specific configurations)           │
│                                                          │
│    SRC_TC_TL_25  │  FILENAME_BR_50  │  FRAME_BL_50      │
│    QC_METADATA_TR │ SHOT_NAME_TR_50 │  DATE_BR_25       │
└─────────────────────────────────────────────────────────┘
```

### Why Presets + Recipes?

1. **Determinism**: Each preset is fully specified with no optional fields
2. **Composability**: Recipes stack presets in defined order
3. **Immutability**: Selected at job creation, never modified
4. **Simplicity**: Users select ONE recipe, not individual settings

---

## Presets Reference

Each preset defines an atomic burn-in configuration for a specific screen position.

### SRC_TC_TL_25
- **Fields**: Source Timecode
- **Position**: Top-Left
- **Text Opacity**: 25%
- **Background**: Enabled (50% opacity)
- **Font Scale**: Medium

### FILENAME_BR_50
- **Fields**: File Name
- **Position**: Bottom-Right
- **Text Opacity**: 50%
- **Background**: Enabled (50% opacity)
- **Font Scale**: Medium

### FRAME_BL_50
- **Fields**: Source Frame
- **Position**: Bottom-Left
- **Text Opacity**: 50%
- **Background**: Enabled (50% opacity)
- **Font Scale**: Medium

### QC_METADATA_TR
- **Fields**: Codec, Resolution, Frame Rate
- **Position**: Top-Right
- **Text Opacity**: 50%
- **Background**: Enabled (60% opacity)
- **Font Scale**: Small

### SHOT_NAME_TR_50
- **Fields**: Clip Name
- **Position**: Top-Right
- **Text Opacity**: 50%
- **Background**: Enabled (50% opacity)
- **Font Scale**: Medium

### DATE_BR_25
- **Fields**: Render Date, Render Time
- **Position**: Bottom-Right
- **Text Opacity**: 25%
- **Background**: Disabled
- **Font Scale**: Small

---

## Recipes Reference

Recipes are ordered stacks of presets. The order matters for overlay stacking.

### OFFLINE_EDITORIAL
**Use case**: Standard offline editorial proxy

| Order | Preset | Description |
|-------|--------|-------------|
| 1 | SRC_TC_TL_25 | Timecode top-left |
| 2 | FILENAME_BR_50 | Filename bottom-right |

### VFX_PLATE
**Use case**: VFX plate delivery

| Order | Preset | Description |
|-------|--------|-------------|
| 1 | SRC_TC_TL_25 | Timecode top-left |
| 2 | SHOT_NAME_TR_50 | Shot name top-right |
| 3 | FRAME_BL_50 | Frame number bottom-left |

### QC_REVIEW
**Use case**: Quality control and review

| Order | Preset | Description |
|-------|--------|-------------|
| 1 | SRC_TC_TL_25 | Timecode top-left |
| 2 | FILENAME_BR_50 | Filename bottom-right |
| 3 | QC_METADATA_TR | Technical metadata top-right |

### CLEAN_TC
**Use case**: Minimal burn-in

| Order | Preset | Description |
|-------|--------|-------------|
| 1 | SRC_TC_TL_25 | Timecode top-left only |

---

## DaVinci Resolve Studio Requirement

**IMPORTANT**: Burn-ins require **DaVinci Resolve Studio**.

Resolve Free does not support Project Data Burn-In. If burn-ins are requested with Resolve Free:

1. Job creation will **succeed** (burn-in recipe is validated)
2. Execution will **fail** with explicit `ResolveNotStudioError`

### Detection Logic

The system detects Resolve edition at execution time:

- **Studio detected**: Burn-ins are applied via Project Data Burn-In
- **Free detected**: Hard failure with clear error message
- **Unknown edition**: Proceeds with warning (may fail at render)

---

## Usage at Job Creation

Burn-in recipes are specified at job creation and are **immutable** after that point.

```python
from backend.job_creation import create_jobspec_from_user_profile

jobspec = create_jobspec_from_user_profile(
    user_profile=my_profile,
    sources=["/path/to/source.mov"],
    output_directory="/path/to/output",
    naming_template="{source_name}_proxy",
    burnin_recipe_id="QC_REVIEW"  # Optional: Recipe ID or None
)
```

### Behavior

| `burnin_recipe_id` | Result |
|-------------------|--------|
| `None` | No burn-ins applied |
| Valid recipe ID | Recipe validated and snapshotted |
| Invalid recipe ID | `BurnInRecipeError` raised (pre-job failure) |

---

## Execution Flow

When a job with burn-ins is executed:

1. **Validate Resolve Studio** is installed
2. **Connect to Resolve** via scripting API
3. **Save current burn-in settings** (for restoration)
4. **Apply recipe presets** in order
5. **Execute render** with burn-ins active
6. **Tear down**: Restore original settings

```
Job Created          Execution Start        Render          Teardown
     │                     │                   │                │
     ▼                     ▼                   ▼                ▼
 ┌────────┐         ┌──────────────┐    ┌──────────┐    ┌──────────────┐
 │Recipe  │ ──────► │Apply Presets │──► │Resolve   │──► │Restore State │
 │Selected│         │to Project    │    │Render    │    │              │
 └────────┘         └──────────────┘    └──────────┘    └──────────────┘
```

---

## Explicit Non-Goals (V1)

The following are **explicitly out of scope** for V1:

### ❌ Custom UI Controls
- No sliders for opacity
- No font size selectors
- No position pickers
- No color customization

### ❌ Per-Clip Overrides
- No clip-level burn-in differences
- All clips in a job use the same recipe

### ❌ FFmpeg Burn-Ins
- V1 uses Resolve Project Data Burn-In only
- FFmpeg drawtext filters are not implemented

### ❌ User-Created Presets
- Only the 6 predefined presets exist
- No custom preset creation

### ❌ User-Created Recipes
- Only the 4 predefined recipes exist
- No custom recipe creation

### ❌ Preview Rendering
- No burn-in preview before job execution
- WYSIWYG preview is deferred

### ❌ Partial Presets
- Every preset field is required
- No optional or default values

---

## File Locations

```
backend/
├── burnins/
│   ├── __init__.py              # Package exports
│   ├── apply_burnins.py         # Core resolution logic
│   ├── burnin_presets.json      # Preset definitions
│   └── burnin_recipes.json      # Recipe definitions
├── resolve/
│   ├── __init__.py              # Package exports
│   └── resolve_burnin_apply.py  # Resolve scripting integration
└── job_creation.py              # Burn-in hook at job creation
```

---

## Error Handling

### Pre-Job Failures

These prevent job creation entirely:

| Error | Cause | Resolution |
|-------|-------|------------|
| `BurnInRecipeNotFoundError` | Invalid recipe ID | Use valid recipe ID or None |
| `BurnInPresetNotFoundError` | Recipe references missing preset | Bug in config files |
| `BurnInRecipeError` | General recipe validation failure | Check recipe ID |

### Execution Failures

These occur during job execution:

| Error | Cause | Resolution |
|-------|-------|------------|
| `ResolveNotStudioError` | Resolve Free detected | Upgrade to Resolve Studio |
| `ResolveNotRunningError` | Resolve not accessible | Start Resolve application |
| `ResolveBurnInApplicationError` | Burn-in API failed | Check Resolve project state |

---

## API Reference

### Query Available Recipes

```python
from backend.burnins import get_available_recipes

recipes = get_available_recipes()
# [
#   {"id": "OFFLINE_EDITORIAL", "description": "..."},
#   {"id": "VFX_PLATE", "description": "..."},
#   ...
# ]
```

### Validate Recipe ID

```python
from backend.burnins import validate_recipe_id

validated = validate_recipe_id("QC_REVIEW")  # Returns "QC_REVIEW"
validated = validate_recipe_id(None)          # Returns None
validate_recipe_id("INVALID")                 # Raises BurnInRecipeNotFoundError
```

### Check if Job Has Burn-Ins

```python
from backend.job_creation import has_burnins, get_burnin_recipe_id

if has_burnins(jobspec):
    recipe_id = get_burnin_recipe_id(jobspec)
    print(f"Job uses burn-in recipe: {recipe_id}")
```

### Validate Resolve Readiness

```python
from backend.resolve import validate_resolve_for_burnins

result = validate_resolve_for_burnins()
if result["valid"]:
    print(f"Ready: Resolve {result['edition']} {result['version']}")
else:
    print(f"Not ready: {result['error']}")
```
