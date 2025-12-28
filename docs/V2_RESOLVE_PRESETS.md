# V2 Resolve Presets Contract

## Overview

V2 RAW execution via DaVinci Resolve requires **explicit preset specification**. This ensures deterministic output format selection - Resolve will NEVER silently choose a render format.

## Why Presets Are Required

1. **Determinism**: Same JobSpec → Same output, every time
2. **Auditability**: The preset name is logged in execution results
3. **Fail-Fast**: Missing presets fail immediately with actionable errors
4. **No Surprises**: No hidden defaults or "smart" selections by Resolve

## JobSpec Configuration

Add `resolve_preset` to your JobSpec JSON when routing to Resolve:

```json
{
  "jobspec_version": "2.1",
  "job_id": "raw_job_001",
  "sources": ["/path/to/source.BRAW"],
  "output_directory": "/path/to/output",
  "codec": "prores_proxy",
  "container": "mov",
  "resolution": "same",
  "naming_template": "{source_name}_proxy",
  "resolve_preset": "ProRes 422 Proxy"
}
```

### Validation Rules

| Job Routes To | resolve_preset Required? | Fails If |
|---------------|-------------------------|----------|
| Resolve (RAW) | **YES** | Missing or empty |
| FFmpeg | **NO** | Present (must be null/absent) |

## How to Create Presets in Resolve

1. Open DaVinci Resolve Studio
2. Go to **Project Settings** (gear icon in lower-right)
3. Navigate to **Deliver** page
4. Configure your desired render settings:
   - Format (QuickTime, MP4, etc.)
   - Codec (ProRes, H.264, DNxHR, etc.)
   - Quality/Profile settings
5. Click **Save Preset** in the preset dropdown
6. Enter an **exact name** that will be used in JobSpec

### Naming Requirements

- **Case-sensitive**: `ProRes 422 Proxy` ≠ `prores 422 proxy`
- **Exact match**: Must match the preset name in Resolve exactly
- **No auto-discovery**: You must know the preset name beforehand

## Common Preset Names

These are typical Resolve built-in presets (may vary by installation):

| Preset Name | Format | Codec |
|-------------|--------|-------|
| `ProRes 422 Proxy` | QuickTime | Apple ProRes 422 Proxy |
| `ProRes 422 LT` | QuickTime | Apple ProRes 422 LT |
| `ProRes 422` | QuickTime | Apple ProRes 422 |
| `ProRes 422 HQ` | QuickTime | Apple ProRes 422 HQ |
| `ProRes 4444` | QuickTime | Apple ProRes 4444 |
| `H.264 Master` | MP4 | H.264 |
| `H.265 Master` | MP4 | H.265/HEVC |
| `DNxHR HQ` | MXF OP1A | Avid DNxHR |

## Error Messages

### Missing Preset (JobSpec)

```
JobSpec contract violation: Resolve jobs must specify resolve_preset 
(e.g., 'ProRes 422 Proxy'). The preset determines the exact output 
format and quality. Create the preset in Resolve: Preferences → System → 
Render Presets, or use an existing preset like 'ProRes 422 Proxy', 
'H.264 Master', etc.
```

### Preset Not Found (Resolve)

```
Resolve preset 'My Custom Preset' not found. Available presets: 
[ProRes 422 Proxy, ProRes 422 LT, H.264 Master, ...]. Create this 
preset in Resolve: Preferences → System → Render Presets, or use 
an existing preset name exactly as shown above.
```

### Preset on FFmpeg Job

```
FFmpeg jobs must not specify resolve_preset (got: 'ProRes 422 Proxy'). 
The resolve_preset field is only valid for jobs that route to Resolve 
engine. Remove the resolve_preset field or change source format to a 
RAW format.
```

## Execution Result Metadata

When a Resolve job completes, the result includes:

```json
{
  "final_status": "COMPLETED",
  "_metadata": {
    "engine_used": "resolve",
    "resolve_preset_used": "ProRes 422 Proxy",
    "jobspec_version": "2.1"
  }
}
```

## Testing Your Setup

1. Create a JobSpec with `resolve_preset` specified
2. Drop it in the watch folder's `pending/` directory
3. Check the result JSON for success or failure message
4. If failed, the error message will indicate what went wrong

## Troubleshooting

### "Resolve scripting API not available"

- Ensure DaVinci Resolve **Studio** is installed (free version has limited scripting)
- Verify Resolve is running
- Enable scripting: Preferences → System → General → External scripting using

### "Unable to connect to DaVinci Resolve"

- Restart Resolve
- Check that no other scripting clients are connected
- Verify scripting is enabled in Resolve preferences

### Preset exists but not found

- Check for typos in preset name (case-sensitive)
- Ensure preset was saved in Resolve's global presets, not project-specific
- Try listing presets programmatically to verify exact names

## API Reference

### Python Functions

```python
from backend.v2.engines.resolve_engine import (
    list_available_resolve_presets,
    validate_resolve_preset,
    clear_preset_cache,
    ResolvePresetError,
)

# List all available presets
presets = list_available_resolve_presets()
print(presets)  # ['ProRes 422 Proxy', 'H.264 Master', ...]

# Validate a specific preset
validate_resolve_preset("ProRes 422 Proxy")  # Raises ResolvePresetError if not found

# Clear cached preset list (after adding new presets)
clear_preset_cache()
```

## Design Rationale

The deterministic preset contract exists because:

1. **Silent Defaults Are Dangerous**: Resolve has many "smart" behaviors that can change output format based on project settings, timeline settings, or user preferences. In automation, this leads to unpredictable results.

2. **Auditability Requirements**: Professional workflows need to know exactly what settings produced a given output. The preset name provides this.

3. **Fail-Fast Debugging**: When a preset is missing, you want to know immediately, not after hours of rendering.

4. **No Heuristics**: The V2 engine philosophy is explicit over implicit. If you want ProRes, you say "ProRes 422 Proxy" - not "prores_proxy" mapped to some internal setting.
