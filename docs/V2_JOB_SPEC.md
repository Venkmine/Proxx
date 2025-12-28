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

## Phase 1 Status

This is **Phase 1** of the V2 Reliable Proxy Engine:

- ✅ JobSpec dataclass defined
- ✅ Serialization (to_dict, from_dict, to_json, from_json)
- ✅ Validation methods
- ⏳ **Not yet wired to execution** (parallel structure)

Future phases will:
1. Create JobSpec from UI state at job start
2. Route all execution through JobSpec
3. Persist JobSpec alongside job output
4. Enable job retry from saved JobSpec
