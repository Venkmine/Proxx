# V2 JobSpec: Deterministic Job Specification

**Status:** V2 Phase 1 (Parallel Structure - Not Yet Wired to Execution)  
**Introduced:** December 2025  
**Module:** `backend/job_spec.py`

---

## Overview

The `JobSpec` dataclass is the foundation of the V2 Reliable Proxy Engine. It provides a **deterministic, serializable, UI-independent** specification for proxy transcoding jobs.

---

## Why JobSpec Exists

### The Problem with V1

In V1, job configuration was derived from UI state at execution time. This created several failure modes:

1. **Race Conditions:** UI state could change between user intent and job execution
2. **Non-Reproducibility:** Jobs couldn't be reliably re-run with identical configuration
3. **Debugging Difficulty:** No canonical record of what was actually requested
4. **State Coupling:** Backend logic was tightly coupled to frontend data structures
5. **No Audit Trail:** Job parameters weren't captured for post-mortem analysis

### The V2 Solution

JobSpec introduces a **single source of truth** that:

- Is created once and becomes immutable
- Contains all information needed to execute a job
- Can be serialized to JSON for persistence and logging
- Validates itself before execution
- Is completely independent of UI components

---

## What Problems JobSpec Solves

### 1. Deterministic Execution
```
JobSpec → FFmpeg Commands → Output Files
```
The same JobSpec will always produce the same FFmpeg commands. No hidden state, no implicit configuration.

### 2. Serialization & Persistence
```python
# Save job spec for debugging or retry
spec.to_json()  # → Stable JSON with ordered keys

# Restore from saved state
JobSpec.from_json(saved_json)
```

### 3. Validation Before Execution
```python
spec.validate()  # Raises JobSpecValidationError with explicit messages
```
- Are all source files present?
- Is the codec/container combination valid?
- Are naming template tokens resolvable?

### 4. Audit Trail
Every job can log its complete JobSpec at creation time, providing:
- Exact configuration used
- Timestamp of creation
- Full list of source files in order

---

## Why UI State Must Never Be the Source of Truth

### UI State is Ephemeral

- Users can navigate away, close tabs, or refresh
- React state can be reset by component remounts
- Selection order in the UI may not match internal data structures
- Form values may be stale or partially updated

### UI State is Unversioned

- No guarantee of shape consistency
- Harder to migrate as the application evolves
- No schema validation at runtime

### UI State is Coupled to Presentation

- What the user *sees* may not match what's *stored*
- Formatting, filtering, and sorting affect display but shouldn't affect execution
- Derived values (like "half resolution") need explicit resolution before execution

### The JobSpec Contract

```
┌─────────────────┐
│   UI / Forms    │
└────────┬────────┘
         │ User clicks "Start Job"
         ▼
┌─────────────────┐
│ JobSpec Created │  ← Snapshot taken here
│  (Immutable)    │
└────────┬────────┘
         │ 
         ▼
┌─────────────────┐
│ Job Execution   │  ← Uses JobSpec only
│   (Backend)     │
└─────────────────┘
```

Once a JobSpec is created, the UI can change arbitrarily without affecting the running job.

---

## JobSpec Fields

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | `str` | Unique identifier (auto-generated if not provided) |
| `sources` | `List[str]` | Ordered list of absolute paths to source media |
| `output_directory` | `str` | Absolute path for output proxies |
| `codec` | `str` | Video codec (e.g., `prores_proxy`, `h264`) |
| `container` | `str` | Container format (e.g., `mov`, `mp4`) |
| `resolution` | `str` | Target resolution (e.g., `1920x1080`, `half`) |
| `fps_mode` | `FpsMode` | `same-as-source` or `explicit` |
| `fps_explicit` | `float?` | Frame rate value (required if fps_mode is explicit) |
| `naming_template` | `str` | Output filename template with tokens |
| `resolved_tokens` | `Dict` | Resolved token values (populated during execution) |
| `created_at` | `str` | ISO 8601 timestamp |

---

## Usage Example

```python
from backend.job_spec import JobSpec, FpsMode

# Create a job specification
spec = JobSpec(
    sources=[
        "/media/project/clip_001.mov",
        "/media/project/clip_002.mov",
    ],
    output_directory="/media/project/proxies",
    codec="prores_proxy",
    container="mov",
    resolution="1280x720",
    fps_mode=FpsMode.SAME_AS_SOURCE,
    naming_template="{source_name}_proxy.{source_ext}",
)

# Validate before execution
spec.validate()

# Serialize for logging/persistence
print(spec.to_json())

# Restore from JSON
restored = JobSpec.from_json(spec.to_json())
```

---

## JobSpec Versioning & Contract Enforcement

**Added:** V2.1 (December 2025)

### Why Versioning Exists

JobSpec is a **locked contract**. Automation systems depend on a stable, predictable schema.
Version numbers make compatibility explicit and prevent silent failures when specs evolve.

- **`jobspec_version`** is **REQUIRED** in all JobSpec JSON
- Missing version → **hard failure**
- Wrong version → **hard failure** (no coercion, no fallback)

### Contract Rules

| Rule | Behavior |
|------|----------|
| Missing `jobspec_version` | `JobSpecValidationError` - cannot be deserialized |
| Version mismatch | `JobSpecValidationError` - upgrade the spec |
| Unknown fields | `JobSpecValidationError` - lists unexpected fields |
| Invalid enum values | `JobSpecValidationError` - lists allowed values |
| Missing required fields | `JobSpecValidationError` - lists missing fields |

### Why Unknown Fields Fail

Permissive parsing creates silent compatibility bugs:

- Typos in field names go unnoticed
- Removed fields continue to appear "valid"
- Future additions could conflict with user extensions

**This is not recoverable.** Unknown fields are contract violations.

### How Upgrades Should Be Handled

When the JobSpec schema changes:

1. `JOBSPEC_VERSION` in `job_spec.py` is incremented
2. All existing JobSpec JSON files become invalid
3. Automation systems must regenerate specs with the new engine

**There is no migration path.** JobSpecs are ephemeral job definitions, not persistent data.
If you need to re-run an old job, regenerate the spec with current tools.

### Valid Enums (V2.1)

| Field | Allowed Values |
|-------|----------------|
| `codec` | `prores_proxy`, `prores_lt`, `prores_standard`, `prores_hq`, `prores_4444`, `h264`, `h265`, `hevc`, `dnxhd`, `dnxhr`, `vp9`, `av1` |
| `container` | `mov`, `mp4`, `mkv`, `webm`, `mxf` |
| `fps_mode` | `same-as-source`, `explicit` |
| `resolution` | `same`, `half`, `quarter`, or explicit `WIDTHxHEIGHT` (e.g., `1920x1080`) |

### Codec/Container Pairing Rules (V2.1)

**DNxHD and DNxHR have specific container requirements:**

| Codec | Allowed Containers | Notes |
|-------|-------------------|-------|
| `dnxhd` | `mxf` only | DNxHD must be wrapped in MXF (industry standard) |
| `dnxhr` | `mov`, `mxf` | DNxHR supports both MOV and MXF |

**Why DNxHD is MXF-only:**

1. **Interoperability** - DNxHD in MOV causes relinking issues in Avid Media Composer
2. **Broadcast QC** - Many broadcast QC systems do not recognize DNxHD-in-MOV
3. **Industry standard** - DNxHD was designed for MXF container in broadcast workflows

**If you need MOV container with Avid codec, use DNxHR instead.** DNxHR was designed for cross-platform flexibility and works in both MXF and MOV containers.

**Requesting DNxHD + MOV will fail validation:**

```
JobSpecValidationError:
  DNxHD must be wrapped in MXF. DNxHD-in-MOV is non-standard and unsupported.
  Use MXF container for DNxHD output, or switch to DNxHR which supports MOV.
```

---

## Proxy Profiles (V2 Step 5)

**Added:** V2 Step 5 (December 2025)

### The `proxy_profile` Field

Starting in V2 Step 5, all JobSpecs **MUST** include a `proxy_profile` field. This field specifies the **canonical proxy profile** that determines all output characteristics.

**No ad-hoc codec/container settings are permitted.** All proxy outputs must be produced via named, deterministic proxy profiles.

### Required Field

```json
{
  "jobspec_version": "2.1",
  "sources": ["/path/to/source.mp4"],
  "output_directory": "/output",
  "codec": "h264",
  "container": "mp4",
  "resolution": "half",
  "naming_template": "{source_name}_proxy",
  "proxy_profile": "proxy_h264_low"  // REQUIRED
}
```

### Validation Rules

| Condition | Result |
|-----------|--------|
| Missing `proxy_profile` | ❌ `JobSpecValidationError` |
| Empty `proxy_profile` (`""`) | ❌ `JobSpecValidationError` |
| Unknown `proxy_profile` | ❌ `JobSpecValidationError` |
| Profile engine mismatch | ❌ `JobSpecValidationError` |

### Engine Matching

Profiles must match the job's engine routing:

- **FFmpeg jobs** → Must use FFmpeg profiles (e.g., `proxy_h264_low`, `proxy_prores_proxy`)
- **Resolve jobs** → Must use Resolve profiles (e.g., `proxy_prores_proxy_resolve`, `proxy_dnxhr_lb_resolve`)

**Mismatches fail validation:**

```python
# FAIL: FFmpeg profile for RAW source
job_spec = JobSpec(
    sources=["clip.ari"],  # ARRIRAW → routes to Resolve
    proxy_profile="proxy_h264_low",  # FFmpeg profile
    ...
)
# Raises: JobSpecValidationError: "Profile 'proxy_h264_low' requires ffmpeg engine, but job routes to resolve"

# FAIL: Resolve profile for standard source
job_spec = JobSpec(
    sources=["clip.mp4"],  # H.264 → routes to FFmpeg
    proxy_profile="proxy_prores_proxy_resolve",  # Resolve profile
    ...
)
# Raises: JobSpecValidationError: "Profile 'proxy_prores_proxy_resolve' requires resolve engine, but job routes to ffmpeg"
```

### Available Profiles

See [V2_PROXY_PROFILES.md](V2_PROXY_PROFILES.md) for:
- Complete profile table
- Profile selection guidance
- FFmpeg vs Resolve profiles
- RAW vs non-RAW rules
- Usage examples

### Why Proxy Profiles Exist

1. **Determinism** - Same profile → same output characteristics
2. **Validation** - Invalid codec/container combinations prevented at profile level
3. **Engine Awareness** - Profiles explicitly declare which engine they require
4. **Discoverability** - Named profiles make valid configurations obvious
5. **No Silent Fallback** - Missing profile is hard error, not guesswork

---

## Supported Source Formats

**Added:** V2.1 (December 2025)

JobSpec validates source files against a formal **Source Capability Matrix** before execution.
This ensures deterministic behavior by rejecting formats that cannot be reliably decoded.

### Supported Formats (Allowlist)

These container/codec combinations are known to work reliably:

| Container | Codec | Notes |
|-----------|-------|-------|
| `mp4` | `h264` | Universally supported, deterministic decode |
| `mp4` | `hevc`/`h265` | Modern compression, well-supported |
| `mp4` | `av1` | Next-gen open codec |
| `mov` | `h264` | QuickTime H.264, standard editorial |
| `mov` | `hevc`/`h265` | Apple ecosystem standard |
| `mov` | `prores` (all variants) | Intra-frame, proxy-friendly, editorial standard |
| `mov` | `dnxhr` | DNxHR supports MOV (modern Avid codec) |
| `mov` | `mjpeg` | Simple intra-frame |
| `mkv` | `h264`, `hevc`, `vp9`, `av1` | Flexible open container |
| `mxf` | `dnxhd` | DNxHD MXF-only (broadcast standard) |
| `mxf` | `dnxhr` | DNxHR supports MXF (modern broadcast) |
| `mxf` | `mpeg2video` | Broadcast legacy |
| `mxf` | `h264` | Sony XAVC/XDCAM |
| `webm` | `vp9`, `av1` | Open web codecs |
| `ts` | `mpeg2video` | Transport stream broadcast |
| `avi` | `mjpeg` | Legacy format |

**Note:** DNxHD in MOV is explicitly rejected as a source format.
See "Codec/Container Pairing Rules" above for details.

### Rejected Formats (Blocklist)

**Note:** Camera RAW formats are now **SUPPORTED via DaVinci Resolve**, not rejected.
The previous blocklist has been replaced with deterministic engine routing.

See [ENGINE_CAPABILITIES.md](ENGINE_CAPABILITIES.md) for the complete camera RAW matrix.

### Engine Routing for RAW Formats

Camera RAW formats (ARRIRAW, REDCODE, BRAW, Sony X-OCN, Canon Cinema RAW Light, Nikon N-RAW, DJI RAW, ProRes RAW, CinemaDNG) are **automatically routed to DaVinci Resolve**.

**Why RAW always routes to Resolve:**

1. **Proprietary SDKs** - Each camera manufacturer provides their own decode library. FFmpeg does not have access to these SDKs and cannot decode proprietary RAW formats.

2. **Debayering is creative** - RAW data is sensor mosaic data, not RGB video. Converting it requires debayering decisions (color science, white balance, exposure) that vary by software and settings.

3. **FFmpeg returns errors** - Attempting to decode RAW with FFmpeg produces decode failures, not proxies.

4. **Determinism** - Proxx requires predictable output. The only way to guarantee this for RAW is to route to Resolve, which has native manufacturer SDK integration.

**Routing is not configurable.** There is no user override. If your source is ARRIRAW, it routes to Resolve. Period.

```
┌─────────────────────────────────────────────────────────────────┐
│              DETERMINISTIC ENGINE ROUTING                       │
│                                                                 │
│   Standard codecs (H.264, ProRes, DNxHD, etc.)  ───► FFmpeg    │
│                                                                 │
│   Camera RAW (ARRIRAW, REDCODE, BRAW, etc.)  ──────► Resolve   │
│                                                                 │
│   Unknown codec (ffprobe returns "unknown")  ──────► Resolve   │
│                                                                 │
│   Mixed RAW + non-RAW in same job  ────────────────► REJECTED  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Proxx Does Not Decode RAW

Camera RAW formats (ARRIRAW, REDCODE, BRAW, etc.) are **sensor data**, not video. They require:

1. **Proprietary SDKs** - Each manufacturer provides their own decode library, which may have licensing restrictions, platform limitations, or version compatibility issues.
2. **Debayering decisions** - RAW data must be debayered (converted from sensor mosaic to RGB), and the result depends on color science parameters, white balance, exposure adjustments, and other creative decisions.
3. **Non-deterministic output** - Different software versions or settings produce different results from the same RAW file, violating Proxx's determinism guarantee.

**The correct workflow is to decode RAW in your NLE (DaVinci Resolve, Premiere, etc.) and export to an intermediate codec (ProRes, DNxHR) before generating proxies.**

### Validation Behavior

Source format validation happens **before execution**:

```python
try:
    job_spec.validate(check_paths=True)
except JobSpecValidationError as e:
    # Example error:
    # "Source format not supported: A001_C001.ari
    #   Container: ari
    #   Codec: arriraw
    #   Reason: Proprietary ARRI RAW codec requires manufacturer SDK.
    #   Action: Export ProRes or DNxHR from DaVinci Resolve before proxy generation."
```

The validation uses `ffprobe` to detect container and codec, then checks against the capability matrix.
No execution is attempted for unsupported formats.

---

## Phase 1 Status

This is **Phase 1** of the V2 Reliable Proxy Engine:

- ✅ JobSpec dataclass defined
- ✅ Serialization (to_dict, from_dict, to_json, from_json)
- ✅ Validation methods
- ✅ **Contract locking with strict versioning (V2.1)**
- ✅ Wired to headless execution and watch folders

Future phases will:
1. Create JobSpec from UI state at job start
2. Route all execution through JobSpec
3. Persist JobSpec alongside job output
4. Enable job retry from saved JobSpec
