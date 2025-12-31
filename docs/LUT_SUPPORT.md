# LUT Support in Forge

## Overview

Forge supports deterministic, explicit LUT (Look-Up Table) application for proxy generation. LUTs are applied to transform color information in proxy files, typically to match the look established by a DIT on set or a show-specific color pipeline.

**CRITICAL: LUTs are applied to PROXY OUTPUT ONLY.** Source media is never modified. This is a non-destructive, preview-focused workflow. Final color grading must be performed on source media in a dedicated grading application.

---

## Supported LUT Formats

| Format | Extension | FFmpeg Support | Resolve Support | Notes |
|--------|-----------|----------------|-----------------|-------|
| Cube   | `.cube`   | ✅ Yes         | ✅ Yes          | Industry standard 3D LUT (Adobe, Resolve, FFmpeg) |
| 3DL    | `.3dl`    | ✅ Yes         | ✅ Yes          | Legacy Autodesk/Lustre format |
| DAT    | `.dat`    | ❌ No          | ✅ Yes          | Resolve-specific format (limited compatibility) |

**Recommendation:** Use `.cube` format for maximum compatibility across all execution engines.

---

## LUT Registry

All LUTs must be **explicitly registered** before use. Forge does not auto-discover or guess which LUT to use.

### Registering a LUT

Use the CLI to register a LUT:

```bash
# Register a LUT from a DIT
python backend/lut_registry.py register /path/to/show_lut.cube "Log-C to Rec.709" DIT

# Register with a custom ID
python backend/lut_registry.py register /path/to/camera.cube "RED IPP2 to Rec.709" "Camera LUT" --id="red_camera_lut"

# Register with description
python backend/lut_registry.py register /path/to/facility.cube "Standard Dailies Look" "Facility LUT" --description="Approved by DP"
```

### LUT Entry Metadata

Each registered LUT stores:

| Field | Description |
|-------|-------------|
| `lut_id` | Unique identifier (auto-generated from filename or user-specified) |
| `filename` | Original LUT filename |
| `filepath` | Absolute path to the LUT file |
| `file_hash` | SHA256 hash of file contents (for integrity verification) |
| `format` | LUT format (cube, 3dl, dat) |
| `color_space_note` | Free-text description of the transform (e.g., "ARRI Log-C to Rec.709") |
| `origin` | Classification: DIT, Show LUT, Camera LUT, Facility LUT, Custom |
| `registered_at` | ISO 8601 timestamp of registration |
| `description` | Optional free-text notes |

### Origin Classifications

| Origin | Description |
|--------|-------------|
| `DIT` | On-set DIT-provided LUT |
| `Show LUT` | Production/show-specific LUT |
| `Camera LUT` | Camera manufacturer LUT (e.g., ARRI, RED LogC transforms) |
| `Facility LUT` | Post facility standard LUT |
| `Custom` | User-defined/other |

### Managing the Registry

```bash
# List all registered LUTs
python backend/lut_registry.py list

# Validate a LUT (checks existence and hash)
python backend/lut_registry.py validate my_lut_id

# Validate for specific engine
python backend/lut_registry.py validate my_lut_id --engine=ffmpeg

# Remove a LUT from registry
python backend/lut_registry.py remove my_lut_id
```

---

## JobSpec Integration

LUTs are specified in the JobSpec using the `lut_id` field:

```json
{
  "jobspec_version": "2.1",
  "sources": ["/path/to/source.mov"],
  "output_directory": "/path/to/output",
  "codec": "prores_proxy",
  "container": "mov",
  "resolution": "1920x1080",
  "naming_template": "{source_name}_proxy",
  "proxy_profile": "proxy_prores_proxy",
  "lut_id": "show_lut_v2"
}
```

### LUT Fields in JobSpec

| Field | Type | Description |
|-------|------|-------------|
| `lut_id` | `string \| null` | Reference to a registered LUT (null = no LUT) |
| `lut_applied` | `boolean` | Whether LUT was successfully applied (set by execution) |
| `lut_engine` | `string \| null` | Which engine applied the LUT: "resolve", "ffmpeg", or null |

---

## When LUTs Are Applied

### Resolve Pipeline (RAW formats)

For RAW formats (ARRIRAW, REDCODE, BRAW, etc.) processed through Resolve:

1. LUT is applied at **project level** before rendering
2. Affects all clips in the project uniformly
3. Uses Resolve's Color Management LUT settings
4. Applied via `SetSetting("colorScienceLUT", lut_path)`

### FFmpeg Pipeline (Standard formats)

For standard formats (H.264, ProRes, DNxHD, etc.) processed through FFmpeg:

1. LUT is applied using the `lut3d` video filter
2. Applied **before** resolution scaling in the filter chain
3. Filter syntax: `-vf "lut3d='path/to/lut.cube',scale=..."`

---

## Logging & Audit Trail

All LUT operations are logged with:

- **LUT name**: The filename of the applied LUT
- **LUT hash**: SHA256 hash (first 16 characters shown, full hash available)
- **Engine used**: "ffmpeg" or "resolve"
- **Confirmation**: Explicit log entry confirming successful application

Example log output:
```
INFO: Applying LUT to project: name=show_lut.cube, hash=a1b2c3d4e5f6g7h8..., format=cube
INFO: LUT applied successfully: show_lut.cube [hash: a1b2c3d4...] [engine: resolve]
```

### Audit in FFmpeg Command

For FFmpeg jobs, LUT metadata is appended as comments to the command list:

```
ffmpeg -y -i input.mov -vf "lut3d='/path/to/lut.cube',scale=..." ...
# LUT applied: show_lut.cube
# LUT hash: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
# LUT engine: ffmpeg
```

---

## What Forge Does NOT Do

### ❌ Guess Which LUT to Use
LUTs must be explicitly specified via `lut_id`. Forge never auto-selects a LUT based on camera metadata, filename patterns, or any heuristics.

### ❌ Apply LUTs Implicitly
If no `lut_id` is provided, no LUT is applied. There is no default LUT behavior.

### ❌ Modify LUT Files
LUT files are read-only. Forge never modifies, optimizes, or transforms LUT content.

### ❌ Convert LUT Formats Silently
If a LUT format is incompatible with the execution engine (e.g., `.dat` with FFmpeg), the job **fails with an explicit error**. Forge does not silently convert formats.

### ❌ Chain Multiple LUTs
Forge does not support applying multiple LUTs in sequence. If you need a combined look, create a single merged LUT upstream and register that.

### ❌ Apply LUTs Per-Clip in Resolve
For Resolve jobs, LUTs are applied at the **project level**, not per-clip. All clips in a job receive the same LUT.

---

## Error Handling

### LUT Not Found
```
Error: LUT 'my_lut' not found in registry.
LUTs must be explicitly registered before use.
Use 'python backend/lut_registry.py register <path>' to register.
```

### LUT File Missing
```
Error: LUT file no longer exists: /path/to/deleted.cube.
The LUT was registered but the file has been moved or deleted.
```

### LUT Hash Mismatch
```
Error: LUT file has been modified since registration.
Registered hash: a1b2c3d4..., Current hash: x9y8z7w6...
Re-register the LUT if the modification was intentional.
```

### Format Incompatibility
```
Error: LUT format 'dat' is not supported by FFmpeg.
FFmpeg supports: cube, 3dl.
Convert the LUT to .cube format for FFmpeg compatibility.
```

---

## Proxy-Only Disclaimer

⚠️ **LUTs applied by Forge are for PROXY VIEWING ONLY.**

- Proxy files are **not suitable for final delivery**
- LUT bakes are intended for editorial preview only
- Original source media retains full dynamic range
- Final color grading must be performed on source media
- Do not use proxy LUT bakes for online/finish workflows

---

## Best Practices

1. **Use `.cube` format** for maximum compatibility
2. **Name LUTs clearly** with show/camera/intent information
3. **Register LUTs early** in production setup
4. **Verify LUTs** before batch processing (`python backend/lut_registry.py validate`)
5. **Document color space transforms** in the `color_space_note` field
6. **Track LUT versions** - register new versions with new IDs, don't overwrite
7. **Keep LUT files in version control** or a shared, backed-up location

---

## Technical Reference

### LUT Registry File Location

The registry is stored at: `backend/lut_registry.json`

### Registry JSON Schema

```json
{
  "version": "1.0",
  "luts": [
    {
      "lut_id": "show_lut_v2",
      "filename": "show_lut_v2.cube",
      "filepath": "/absolute/path/to/show_lut_v2.cube",
      "file_hash": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
      "format": "cube",
      "color_space_note": "ARRI Log-C to Show Rec.709",
      "origin": "DIT",
      "registered_at": "2025-12-31T12:00:00+00:00",
      "description": "Approved by DP on 2025-12-30"
    }
  ]
}
```

### Supported Python API

```python
from lut_registry import (
    register_lut,           # Register a new LUT
    get_lut,                # Get LUT entry by ID
    validate_lut,           # Validate LUT exists and hash matches
    validate_lut_for_engine,# Validate LUT for specific engine
    LUTOrigin,              # Enum for origin types
    LUTFormat,              # Enum for format types
)

# Register a LUT
entry = register_lut(
    filepath=Path("/path/to/lut.cube"),
    color_space_note="Log-C to Rec.709",
    origin=LUTOrigin.DIT,
    lut_id="my_lut",
    description="Optional notes",
)

# Validate for FFmpeg
entry = validate_lut_for_engine("my_lut", "ffmpeg")
print(f"LUT path: {entry.filepath}")
print(f"LUT hash: {entry.file_hash}")
```
