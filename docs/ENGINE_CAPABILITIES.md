# Engine Capabilities: Camera RAW and Format Routing

**Status:** V2 Phase 1  
**Updated:** December 2025  
**Module:** `backend/v2/source_capabilities.py`

---

## Overview

Proxx V2 uses **deterministic engine routing** for all source formats. There is no user override, no fallback logic, and no heuristics. The routing decision is based entirely on the source container and codec.

- **FFmpeg Engine:** Standard video codecs (H.264, ProRes, DNxHD, etc.)
- **Resolve Engine:** Proprietary camera RAW formats (ARRIRAW, REDCODE, BRAW, etc.)

---

## Why This Matters

Camera RAW formats are **sensor data**, not video. They require:

1. **Proprietary SDKs** - Each manufacturer provides their own decode library
2. **Debayering decisions** - RAW must be converted from sensor mosaic to RGB
3. **Non-deterministic output** - Different software versions produce different results

FFmpeg cannot decode proprietary RAW formats. Attempting to process them with FFmpeg will fail. Proxx routes these formats to DaVinci Resolve, which has native support for all major camera RAW formats.

---

## Routing Rules

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENGINE ROUTING DECISION                      │
│                                                                 │
│   1. Is codec in RAW_CODECS_RESOLVE?  ──────────────► RESOLVE  │
│                                                                 │
│   2. Is codec "unknown" (ffprobe)?  ────────────────► RESOLVE  │
│                                                                 │
│   3. Is container/codec in RESOLVE_SOURCES?  ───────► RESOLVE  │
│                                                                 │
│   4. Is container/codec in SUPPORTED_SOURCES?  ─────► FFMPEG   │
│                                                                 │
│   5. Otherwise ─────────────────────────────────────► ERROR    │
└─────────────────────────────────────────────────────────────────┘
```

**There is no fallback.** If a format cannot be routed deterministically, the job fails with a clear error message.

---

## Camera RAW Formats → Resolve

All proprietary camera RAW formats are routed to DaVinci Resolve. This is **not configurable**.

### ARRI RAW

| Container | Codec | Notes |
|-----------|-------|-------|
| `mxf` | `arriraw` | ARRI Alexa, Alexa Mini, Alexa 35 |
| `ari` | `arriraw` | ARRI native container |

### RED RAW (REDCODE)

| Container | Codec | Notes |
|-----------|-------|-------|
| `r3d` | `redcode` | RED DSMC, DSMC2, V-RAPTOR |
| `r3d` | `redraw` | Alternate identifier |

### Blackmagic RAW (BRAW)

| Container | Codec | Notes |
|-----------|-------|-------|
| `braw` | `braw` | BMPCC 4K/6K, URSA Mini Pro |
| `braw` | `blackmagic_raw` | Alternate identifier |

### Sony RAW (X-OCN)

| Container | Codec | Notes |
|-----------|-------|-------|
| `mxf` | `sony_raw` | Sony Venice, FX6, FX9 |
| `mxf` | `x-ocn` | Sony X-OCN XT/ST/LT |
| `mxf` | `xocn` | Alternate identifier |

### Canon RAW (Cinema RAW Light)

| Container | Codec | Notes |
|-----------|-------|-------|
| `crm` | `canon_raw` | Canon C70, C300 Mark III, C500 Mark II |
| `crm` | `craw` | Canon Cinema RAW |
| `crm` | `cinema_raw_light` | Canon CRL |

### Panasonic RAW (V-RAW)

| Container | Codec | Notes |
|-----------|-------|-------|
| `vraw` | `panasonic_raw` | Panasonic VariCam |
| `vraw` | `vraw` | V-RAW native |

### Nikon N-RAW

| Container | Codec | Notes |
|-----------|-------|-------|
| `nev` | `nikon_raw` | Nikon Z8, Z9 internal RAW |
| `nev` | `nraw` | N-RAW format |
| `mov` | `nikon_raw` | N-RAW in MOV container |

### DJI RAW

| Container | Codec | Notes |
|-----------|-------|-------|
| `mov` | `dji_raw` | Zenmuse X7, Inspire 3 |
| `dng` | `dji_raw` | DJI CinemaDNG |

### Apple ProRes RAW

| Container | Codec | Notes |
|-----------|-------|-------|
| `mov` | `prores_raw` | ProRes RAW (sensor data) |
| `mov` | `prores_raw_hq` | ProRes RAW HQ |

**Note:** ProRes RAW is sensor RAW data, NOT standard ProRes. Standard ProRes (Proxy, LT, 422, HQ, 4444) routes to FFmpeg.

### CinemaDNG

| Container | Codec | Notes |
|-----------|-------|-------|
| `dng` | `cinemadng` | Open RAW format (frame sequences) |
| `dng` | `cdng` | Alternate identifier |

---

## Unknown Codec Handling

When `ffprobe` returns `codec_name="unknown"`, the format is routed to Resolve.

This handles:
- Proprietary formats ffprobe cannot identify
- New camera formats not yet in ffprobe's codec database
- Manufacturer-specific containers with non-standard codecs

**Rationale:** If ffprobe cannot identify the codec, FFmpeg cannot decode it. Resolve is the fallback for proprietary formats.

---

## Standard Formats → FFmpeg

These formats are decoded by FFmpeg without issue:

### H.264/AVC

| Container | Notes |
|-----------|-------|
| `mp4`, `mov`, `mkv` | Universally supported |

### H.265/HEVC

| Container | Notes |
|-----------|-------|
| `mp4`, `mov`, `mkv` | Modern compression |

### Apple ProRes (Standard)

| Container | Codec | Notes |
|-----------|-------|-------|
| `mov` | `prores_proxy` | Lightweight offline |
| `mov` | `prores_lt` | Light transport |
| `mov` | `prores_422` | Standard editorial |
| `mov` | `prores_hq` | High quality |
| `mov` | `prores_4444` | With alpha channel |
| `mov` | `prores_4444xq` | Highest quality |

### Avid DNxHD/DNxHR

| Container | Codec | Notes |
|-----------|-------|-------|
| `mov`, `mxf` | `dnxhd` | DNxHD (HD resolutions) |
| `mov`, `mxf` | `dnxhr` | DNxHR (any resolution) |

### Web Codecs

| Container | Codec | Notes |
|-----------|-------|-------|
| `webm`, `mkv` | `vp9` | Google VP9 |
| `mp4`, `mkv`, `webm` | `av1` | AV1 next-gen |

### Legacy Formats

| Container | Codec | Notes |
|-----------|-------|-------|
| `mpg`, `ts`, `mxf` | `mpeg2video` | Broadcast MPEG-2 |
| `mov`, `avi` | `mjpeg` | Motion JPEG |

---

## Mixed Job Rejection

A job **cannot contain both RAW and non-RAW sources**.

```
❌ REJECTED:
  - clip_001.r3d (REDCODE → Resolve)
  - clip_002.mov (ProRes → FFmpeg)
  
  Error: "Job contains sources requiring different engines."
```

**Why:** Determinism requires a single engine per job. Mixed jobs would require:
- Splitting execution across engines
- Complex output merging
- Non-deterministic ordering

The solution is to split into separate jobs:

```
✅ Job A (Resolve):
  - clip_001.r3d
  
✅ Job B (FFmpeg):
  - clip_002.mov
```

Or transcode RAW files to an intermediate codec before processing:

```
✅ Single Job (FFmpeg):
  - clip_001_transcode.mov (exported from Resolve as ProRes)
  - clip_002.mov
```

---

## Error Messages

### RAW Format Without Resolve

If a RAW format is submitted but Resolve is unavailable:

```
SourceCapabilityError:
  ARRIRAW in MXF is not supported.
  This format requires DaVinci Resolve. FFmpeg cannot decode proprietary RAW formats.
  Route this job to the Resolve engine, or export to ProRes/DNxHR from Resolve before processing with FFmpeg.
```

### Unknown Format

If a format is not in any capability list:

```
SourceCapabilityError:
  FAKECODEC in XYZ is not supported.
  Unknown container/codec combination 'xyz/fakecodec'.
  Verify the source format or transcode to ProRes/H.264 before processing.
```

### Mixed Engine Job

If a job contains both RAW and non-RAW sources:

```
MixedEngineError:
  Job contains sources requiring different engines.
  FFmpeg sources: 3, Resolve sources: 2.
  Split into separate jobs or transcode RAW files to an intermediate codec.
```

---

## API Reference

### Key Functions

```python
from backend.v2.source_capabilities import (
    get_execution_engine,       # Returns ExecutionEngine or None
    validate_source_capability, # Returns ExecutionEngine or raises error
    is_resolve_required,        # Quick check for Resolve routing
    is_raw_codec,               # Check if codec is RAW
    validate_job_engine_consistency,  # Validate all sources use same engine
)
```

### Execution Engine Enum

```python
class ExecutionEngine(str, Enum):
    FFMPEG = "ffmpeg"
    RESOLVE = "resolve"
```

### Example Usage

```python
# Check which engine to use
engine = get_execution_engine("r3d", "redcode")
# Returns: ExecutionEngine.RESOLVE

engine = get_execution_engine("mov", "prores")
# Returns: ExecutionEngine.FFMPEG

# Validate and get engine (raises on unknown formats)
engine = validate_source_capability("mxf", "arriraw")
# Returns: ExecutionEngine.RESOLVE

# Check if RAW codec
is_raw_codec("arriraw")  # True
is_raw_codec("prores")   # False
is_raw_codec("unknown")  # True (ffprobe couldn't identify)

# Validate job consistency
sources = [
    ("/path/clip1.r3d", "r3d", "redcode"),
    ("/path/clip2.r3d", "r3d", "redcode"),
]
engine = validate_job_engine_consistency(sources)
# Returns: ExecutionEngine.RESOLVE
```

---

## Constraints

1. **No user override** - Engine routing is determined by format, not user preference
2. **No fallback** - If the required engine is unavailable, the job fails
3. **No heuristics** - Routing is based on explicit container/codec pairs or known RAW codecs
4. **Determinism** - Same input always produces same routing decision
5. **Fail-fast** - Unknown formats fail at validation, not during execution

---

## Future Considerations

- Additional camera manufacturers may release new RAW formats
- The `RAW_CODECS_RESOLVE` set can be extended without breaking changes
- New container/codec pairs can be added to explicit routing tables
- The `unknown` codec routing provides forward compatibility for new formats
