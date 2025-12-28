# V2 Proxy Profiles

**Status:** Implemented (V2 Step 5)  
**Phase:** V2 Phase 1 - Reliable Proxy Engine  
**Date:** December 2025

---

## Overview

Canonical proxy profiles are the **only** way to specify proxy output settings in Proxx V2. All proxy generation must reference exactly one named profile. No ad-hoc codec/container settings are permitted.

This is a **hardening step**, not a feature. It ensures deterministic, reproducible proxy outputs across all execution paths.

---

## Why Proxy Profiles Exist

### Problems Solved

1. **Ambiguous Output Intent**: Previously, users could specify codec and container independently, leading to invalid combinations (e.g., DNxHD in MOV)
2. **Non-Deterministic Rendering**: Resolve could silently choose render formats, causing output unpredictability
3. **Inconsistent Naming**: Output container extensions didn't always match actual container format
4. **Poor Discoverability**: Users had to know which codec/container/quality combinations made sense

### Design Principles

- **Immutable Constants**: Profiles cannot be modified at runtime
- **Deterministic Selection**: Profile → exact output characteristics mapping
- **Engine Awareness**: Profiles explicitly declare which engine they require
- **No Defaults**: Missing profile is a hard error, not a silent fallback
- **Fail-Fast Validation**: Invalid profile/engine combinations rejected before execution

---

## Available Proxy Profiles

### FFmpeg Profiles

Use these for standard video formats (H.264, ProRes, DNxHD/DNxHR from standard sources).

| Profile Name | Codec | Container | Resolution | Audio | Notes |
|--------------|-------|-----------|------------|-------|-------|
| `proxy_h264_low` | H.264 | MP4 | Half (50%) | AAC | Low-bandwidth proxy for remote editing and low-storage workflows |
| `proxy_h264_quarter` | H.264 | MP4 | Quarter (25%) | AAC | Ultra-lightweight for mobile/tablet editing or bandwidth-constrained scenarios |
| `proxy_prores_proxy` | ProRes Proxy | MOV | Source | Copy | Standard for professional NLE workflows with Apple ecosystem |
| `proxy_prores_lt` | ProRes LT | MOV | Source | Copy | Higher quality than Proxy, suitable for color-sensitive work |
| `proxy_dnxhr_lb` | DNxHR LB | MXF | Source | PCM | Avid/broadcast standard for edit proxies (Low Bandwidth) |

### Resolve Profiles

Use these for RAW formats that require DaVinci Resolve for debayering (ARRIRAW, REDCODE, BRAW, etc.).

| Profile Name | Codec | Container | Resolution | Audio | Notes |
|--------------|-------|-----------|------------|-------|-------|
| `proxy_prores_proxy_resolve` | ProRes Proxy | MOV | Source | Copy | Required for RAW formats, standard proxy quality |
| `proxy_prores_lt_resolve` | ProRes LT | MOV | Source | Copy | Higher quality RAW debayer for color-critical work |
| `proxy_prores_hq_resolve` | ProRes HQ | MOV | Source | Copy | High-quality RAW debayer for finishing-grade proxies |
| `proxy_dnxhr_lb_resolve` | DNxHR LB | MXF | Source | PCM | Broadcast-standard RAW proxy for Avid workflows |
| `proxy_dnxhr_sq_resolve` | DNxHR SQ | MXF | Source | PCM | Higher quality RAW proxy for broadcast finishing |

---

## Engine Routing Rules

Proxx V2 automatically routes jobs to the correct engine based on source format:

### FFmpeg Engine
- **Source Formats**: H.264, H.265/HEVC, ProRes (standard), DNxHD, DNxHR, AV1, VP9, etc.
- **Required Profile Type**: FFmpeg profiles (no `_resolve` suffix)
- **Example**: `proxy_h264_low`, `proxy_prores_proxy`

### Resolve Engine
- **Source Formats**: ARRIRAW, REDCODE (R3D), BRAW, Cinema DNG, ProRes RAW, Sony RAW (X-OCN), Canon RAW, etc.
- **Required Profile Type**: Resolve profiles (`_resolve` suffix)
- **Example**: `proxy_prores_proxy_resolve`, `proxy_dnxhr_lb_resolve`

### Validation Rules

| Job Source | Required Profile Engine | Example Profile | Result |
|------------|------------------------|-----------------|--------|
| `clip.mp4` (H.264) | FFmpeg | `proxy_h264_low` | ✅ Success |
| `clip.mp4` (H.264) | Resolve | `proxy_prores_proxy_resolve` | ❌ **FAIL** - Engine mismatch |
| `clip.ari` (ARRIRAW) | Resolve | `proxy_prores_proxy_resolve` | ✅ Success |
| `clip.ari` (ARRIRAW) | FFmpeg | `proxy_h264_low` | ❌ **FAIL** - Engine mismatch |

---

## JobSpec Integration

### Required Field

Every V2 JobSpec **must** include `proxy_profile`:

```json
{
  "jobspec_version": "2.1",
  "sources": ["/path/to/source.mp4"],
  "output_directory": "/output",
  "codec": "h264",
  "container": "mp4",
  "resolution": "half",
  "naming_template": "{source_name}_proxy",
  "proxy_profile": "proxy_h264_low"
}
```

### Validation Behavior

```python
# Missing proxy_profile → FAIL
job_spec = JobSpec(
    sources=["source.mp4"],
    output_directory="/output",
    codec="h264",
    container="mp4",
    resolution="half",
    naming_template="{source_name}_proxy",
    # No proxy_profile specified
)
# Raises: JobSpecValidationError: "V2 jobs must specify proxy_profile"

# Unknown proxy_profile → FAIL
job_spec.proxy_profile = "nonexistent_profile"
# Raises: JobSpecValidationError: "Unknown proxy profile 'nonexistent_profile'"

# Engine mismatch → FAIL
job_spec.sources = ["raw_clip.ari"]  # ARRIRAW requires Resolve
job_spec.proxy_profile = "proxy_h264_low"  # FFmpeg profile
# Raises: JobSpecValidationError: "Profile requires ffmpeg engine, but job routes to resolve"
```

---

## Usage Examples

### Example 1: H.264 Proxy for Remote Editing

```json
{
  "jobspec_version": "2.1",
  "sources": ["/footage/A001_C001.mov"],
  "output_directory": "/proxies",
  "codec": "h264",
  "container": "mp4",
  "resolution": "half",
  "naming_template": "{source_name}_proxy",
  "proxy_profile": "proxy_h264_low"
}
```

**Output**: `/proxies/A001_C001_proxy.mp4` (H.264, 50% resolution, AAC audio)

### Example 2: ProRes Proxy for Professional NLE

```json
{
  "jobspec_version": "2.1",
  "sources": ["/footage/A001_C001.mov"],
  "output_directory": "/proxies",
  "codec": "prores_proxy",
  "container": "mov",
  "resolution": "same",
  "naming_template": "{source_name}_proxy",
  "proxy_profile": "proxy_prores_proxy"
}
```

**Output**: `/proxies/A001_C001_proxy.mov` (ProRes Proxy, full resolution, audio copied)

### Example 3: ARRIRAW to ProRes Proxy via Resolve

```json
{
  "jobspec_version": "2.1",
  "sources": ["/footage/A001_C001.ari"],
  "output_directory": "/proxies",
  "codec": "prores_proxy",
  "container": "mov",
  "resolution": "same",
  "naming_template": "{source_name}_proxy",
  "proxy_profile": "proxy_prores_proxy_resolve",
  "resolve_preset": "ProRes Proxy"
}
```

**Output**: `/proxies/A001_C001_proxy.mov` (ProRes Proxy, full resolution, debayered via Resolve)

### Example 4: DNxHR Proxy for Avid Workflows

```json
{
  "jobspec_version": "2.1",
  "sources": ["/footage/A001_C001.mov"],
  "output_directory": "/proxies",
  "codec": "dnxhr",
  "container": "mxf",
  "resolution": "same",
  "naming_template": "{source_name}_proxy",
  "proxy_profile": "proxy_dnxhr_lb"
}
```

**Output**: `/proxies/A001_C001_proxy.mxf` (DNxHR LB, full resolution, PCM audio)

---

## Invalid JobSpec Examples

### ❌ Missing proxy_profile

```json
{
  "jobspec_version": "2.1",
  "sources": ["/footage/clip.mp4"],
  "output_directory": "/proxies",
  "codec": "h264",
  "container": "mp4",
  "resolution": "half",
  "naming_template": "{source_name}_proxy"
  // Missing proxy_profile → FAIL
}
```

**Error**: `JobSpecValidationError: V2 jobs must specify proxy_profile`

### ❌ Unknown proxy_profile

```json
{
  "proxy_profile": "my_custom_profile"  // Not in canonical profiles → FAIL
}
```

**Error**: `JobSpecValidationError: Unknown proxy profile 'my_custom_profile'`

### ❌ FFmpeg profile for RAW source

```json
{
  "sources": ["/footage/clip.ari"],  // ARRIRAW
  "proxy_profile": "proxy_h264_low"  // FFmpeg profile → FAIL
}
```

**Error**: `JobSpecValidationError: Profile 'proxy_h264_low' requires ffmpeg engine, but job routes to resolve`

### ❌ Resolve profile for standard source

```json
{
  "sources": ["/footage/clip.mp4"],  // H.264
  "proxy_profile": "proxy_prores_proxy_resolve"  // Resolve profile → FAIL
}
```

**Error**: `JobSpecValidationError: Profile 'proxy_prores_proxy_resolve' requires resolve engine, but job routes to ffmpeg`

---

## Watch Folder Integration

When dropping JobSpec JSON files into the watch folder:

1. **JobSpec without `proxy_profile`** → Immediately moved to `failed/` with validation error
2. **JobSpec with invalid `proxy_profile`** → Immediately moved to `failed/` with validation error
3. **JobSpec with engine mismatch** → Immediately moved to `failed/` with clear error message
4. **Valid JobSpec** → Processed normally, result includes `proxy_profile_used` in metadata

### Result Metadata

Successful execution results include:

```json
{
  "job_id": "abc123",
  "final_status": "COMPLETED",
  "_metadata": {
    "engine_used": "ffmpeg",
    "proxy_profile_used": "proxy_h264_low",
    "jobspec_version": "2.1"
  }
}
```

For Resolve jobs, additionally includes:

```json
{
  "_metadata": {
    "engine_used": "resolve",
    "proxy_profile_used": "proxy_prores_proxy_resolve",
    "resolve_preset_used": "ProRes Proxy"
  }
}
```

---

## How to Choose a Profile

### By Use Case

| Use Case | Recommended Profile | Rationale |
|----------|---------------------|-----------|
| Remote editing | `proxy_h264_low` | Small file size, network-friendly |
| Mobile/tablet review | `proxy_h264_quarter` | Ultra-compact for limited storage |
| Premiere/FCP proxy workflow | `proxy_prores_proxy` | Industry standard, native NLE support |
| Avid Media Composer | `proxy_dnxhr_lb` | Broadcast standard, MXF container |
| Color-critical grading | `proxy_prores_lt` or `proxy_prores_hq_resolve` | Higher quality debayer |
| RAW footage (ARRI/RED/BRAW) | `proxy_prores_proxy_resolve` | Requires Resolve debayer |
| Broadcast deliverables from RAW | `proxy_dnxhr_lb_resolve` or `proxy_dnxhr_sq_resolve` | Avid-compatible RAW proxy |

### By Source Format

| Source Format | Required Engine | Example Profiles |
|---------------|-----------------|------------------|
| H.264, H.265 | FFmpeg | `proxy_h264_low`, `proxy_prores_proxy` |
| ProRes (standard) | FFmpeg | `proxy_prores_proxy`, `proxy_h264_low` |
| DNxHD, DNxHR | FFmpeg | `proxy_dnxhr_lb`, `proxy_h264_low` |
| ARRIRAW (.ari) | Resolve | `proxy_prores_proxy_resolve`, `proxy_dnxhr_lb_resolve` |
| REDCODE (.r3d) | Resolve | `proxy_prores_proxy_resolve`, `proxy_prores_hq_resolve` |
| Blackmagic RAW (.braw) | Resolve | `proxy_prores_proxy_resolve`, `proxy_dnxhr_sq_resolve` |
| ProRes RAW | Resolve | `proxy_prores_proxy_resolve` |
| Cinema DNG | Resolve | `proxy_prores_proxy_resolve` |

---

## Programmatic Access

### List All Profiles

```python
from backend.v2.proxy_profiles import PROXY_PROFILES

for name, profile in PROXY_PROFILES.items():
    print(f"{name}: {profile.codec} in {profile.container} via {profile.engine.value}")
```

### Get Profile Details

```python
from backend.v2.proxy_profiles import get_profile, get_profile_metadata

profile = get_profile("proxy_h264_low")
print(profile.notes)  # "H.264 low-bandwidth proxy at half resolution..."

metadata = get_profile_metadata("proxy_prores_proxy")
print(metadata)  # {"name": "proxy_prores_proxy", "engine": "ffmpeg", ...}
```

### List Profiles by Engine

```python
from backend.v2.proxy_profiles import list_profiles_for_engine, EngineType

ffmpeg_profiles = list_profiles_for_engine(EngineType.FFMPEG)
resolve_profiles = list_profiles_for_engine(EngineType.RESOLVE)

print(f"FFmpeg profiles: {list(ffmpeg_profiles.keys())}")
print(f"Resolve profiles: {list(resolve_profiles.keys())}")
```

---

## Constraints

### What You Cannot Do

❌ **No ad-hoc codec/container selection**  
All output settings must come from a profile. You cannot mix-and-match codec and container.

❌ **No profile mutation at runtime**  
Profiles are immutable constants. You cannot modify profile settings during execution.

❌ **No custom profiles**  
The set of profiles is fixed at the module level. You cannot add custom profiles at runtime.

❌ **No engine override**  
The profile determines which engine is used. You cannot force a Resolve profile to run with FFmpeg or vice versa.

❌ **No silent fallback**  
If `proxy_profile` is missing or invalid, execution fails immediately. No default profile is chosen.

❌ **No profile auto-selection**  
Proxx will not guess which profile you want. You must explicitly specify one.

### What You Can Do

✅ **Choose any canonical profile**  
Select from the predefined list based on your workflow requirements.

✅ **Rely on deterministic output**  
The same profile always produces the same output format.

✅ **Trust engine routing**  
Proxx automatically routes to the correct engine based on source format.

✅ **Get clear error messages**  
Profile validation errors explain exactly what's wrong and how to fix it.

---

## Migration from V1/Legacy

If you have existing JobSpecs without `proxy_profile`:

1. **Identify the closest matching profile** based on current `codec` and `container` fields
2. **Add `proxy_profile` field** to JobSpec JSON
3. **Test validation** before deploying to watch folder
4. **Update automation** that generates JobSpecs to always include `proxy_profile`

### Migration Examples

**Before (V1 style):**
```json
{
  "codec": "h264",
  "container": "mp4",
  "resolution": "half"
}
```

**After (V2 with profile):**
```json
{
  "codec": "h264",
  "container": "mp4",
  "resolution": "half",
  "proxy_profile": "proxy_h264_low"
}
```

---

## Related Documentation

- [V2_JOB_SPEC.md](V2_JOB_SPEC.md) - JobSpec contract and fields
- [ENGINE_CAPABILITIES.md](ENGINE_CAPABILITIES.md) - Engine routing and source format support
- [V2_REAL_WORLD_LOG.md](V2_REAL_WORLD_LOG.md) - Implementation decisions and rationale
- [ARCHITECTURE.md](ARCHITECTURE.md) - Overall system architecture

---

## Technical Implementation

### Module: `backend/v2/proxy_profiles.py`

Defines all canonical proxy profiles as immutable `ProxyProfile` dataclasses.

### Key Functions

- `get_profile(name) -> ProxyProfile` - Retrieve a profile by name
- `validate_profile_for_engine(name, engine)` - Validate profile/engine match
- `resolve_ffmpeg_codec_args(profile) -> List[str]` - Get FFmpeg codec arguments
- `resolve_ffmpeg_resolution_args(profile) -> List[str]` - Get FFmpeg scaling arguments
- `resolve_ffmpeg_audio_args(profile) -> List[str]` - Get FFmpeg audio arguments
- `resolve_resolve_preset(profile) -> str` - Get Resolve preset name

### Integration Points

- **JobSpec validation** - `JobSpec.validate_proxy_profile()`
- **FFmpeg command building** - `_build_ffmpeg_command()` in `headless_execute.py`
- **Resolve output naming** - `ResolveEngine._resolve_output_path()`
- **Result metadata** - `JobExecutionResult.proxy_profile_used`

---

**Last Updated:** December 28, 2025  
**Specification Version:** V2.1  
**Implementation Status:** ✅ Complete
