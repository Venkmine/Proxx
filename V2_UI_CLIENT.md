# V2 UI Client — Thin Client JobSpec Compiler

## Overview

V2 Step 3 introduces a fundamental shift in how the UI interacts with the execution engine:

**The UI is a compiler, not the authority.**

Instead of maintaining complex state about job progress, the UI:
1. Compiles user settings into a `JobSpec`
2. Sends the `JobSpec` to the backend
3. Displays the authoritative `JobExecutionResult`

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI (Thin Client)                        │
│                                                                 │
│  ┌───────────────┐    ┌──────────────┐    ┌─────────────────┐  │
│  │ User Settings │ -> │ JobSpec      │ -> │ Display Result  │  │
│  │ (Codec, Res,  │    │ Compiler     │    │ (Clip Status,   │  │
│  │  Output, etc) │    │ (useV2Exec)  │    │  Output Path,   │  │
│  └───────────────┘    └──────────────┘    │  Failure Reason)│  │
│                                           └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ POST /v2/execute_jobspec
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (Authority)                         │
│                                                                 │
│  ┌───────────────┐    ┌──────────────┐    ┌─────────────────┐  │
│  │ Validate      │ -> │ Execute      │ -> │ Return Result   │  │
│  │ JobSpec       │    │ FFmpeg       │    │ (Authoritative) │  │
│  └───────────────┘    └──────────────┘    └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## What Gets Sent

When the user clicks "Run (V2)", the UI compiles a `JobSpec`:

```json
{
  "sources": ["/path/to/clip1.mov", "/path/to/clip2.mov"],
  "output_directory": "/path/to/output",
  "codec": "prores_proxy",
  "container": "mov",
  "resolution": "1920x1080",
  "naming_template": "{source_name}_proxy",
  "fps_mode": "same-as-source",
  "fps_explicit": null
}
```

### Field Mappings

| UI Setting | JobSpec Field |
|------------|---------------|
| Selected files | `sources` (ordered list) |
| Output directory | `output_directory` |
| Video > Codec | `codec` |
| File > Container | `container` |
| Video > Resolution | `resolution` |
| File > Naming Template | `naming_template` |
| Video > Frame Rate Policy | `fps_mode` |
| Video > Frame Rate | `fps_explicit` |

### V2 Compliance: Multi-Clip Naming

For multi-clip jobs (more than one source), the compiler automatically ensures unique output names:

- If `naming_template` contains `{index}` or `{source_name}` → use as-is
- Otherwise → prepend `{index}_` to prevent overwrites

This ensures deterministic, collision-free output.

## Where Truth Comes From

Truth comes from `JobExecutionResult`, not UI state.

### JobExecutionResult Structure

```json
{
  "job_id": "abc123",
  "final_status": "COMPLETED",
  "clips": [
    {
      "source_path": "/path/to/clip1.mov",
      "resolved_output_path": "/path/to/output/clip1_proxy.mov",
      "status": "COMPLETED",
      "failure_reason": null,
      "output_size_bytes": 12345678,
      "duration_seconds": 3.45
    }
  ],
  "started_at": "2024-12-28T10:00:00Z",
  "completed_at": "2024-12-28T10:00:03Z",
  "duration_seconds": 3.45,
  "total_clips": 1,
  "completed_clips": 1,
  "failed_clips": 0
}
```

### Status Values

| Status | Meaning |
|--------|---------|
| `COMPLETED` | All clips processed successfully |
| `FAILED` | At least one clip failed (fail-fast) |
| `PARTIAL` | Validation failed before execution |

## Honesty Invariants

The V2 UI flow enforces strict honesty:

1. **No progress percent** — We don't know how long FFmpeg will take
2. **No ETA** — Estimation is unreliable and dishonest
3. **No cancel during encode** — Sync execution doesn't support cancellation
4. **Shows only**: "Encoding..." then final result

### UI States

```
┌──────────┐     ┌──────────────┐     ┌───────────────┐
│   Idle   │ --> │  Encoding... │ --> │ Result Panel  │
│          │     │  (spinner)   │     │ (clip status) │
└──────────┘     └──────────────┘     └───────────────┘
                       │
                       │ (on error)
                       ▼
                 ┌──────────────┐
                 │ Error Panel  │
                 │ (message)    │
                 └──────────────┘
```

## Feature Toggle

V2 mode is controlled by a DEV-only toggle:

- **Feature flag**: `FEATURE_FLAGS.V2_MODE_ENABLED` (default: false)
- **Runtime toggle**: Click "V2 OFF/ON" in header (visible when not in DEMO_MODE)
- **State store**: `useV2ModeStore` (Zustand)

When V2 mode is OFF, the existing V1 flow is used (job queue, async execution).

## API Endpoint

### POST /v2/execute_jobspec

**Request:**
```http
POST /v2/execute_jobspec
Content-Type: application/json

{
  "sources": ["..."],
  "output_directory": "...",
  "codec": "...",
  "container": "...",
  "resolution": "...",
  "naming_template": "...",
  "fps_mode": "same-as-source"
}
```

**Response (200 OK):**
```json
{
  "job_id": "abc123",
  "final_status": "COMPLETED",
  "clips": [...],
  ...
}
```

**Response (400 Bad Request):**
```json
{
  "detail": {
    "error": "JobSpec validation failed",
    "message": "Source file does not exist: /path/to/missing.mov",
    "job_id": "abc123"
  }
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `backend/app/routes/v2_execute.py` | API endpoint |
| `frontend/src/stores/v2ModeStore.ts` | V2 mode state |
| `frontend/src/hooks/useV2Execute.ts` | JobSpec compiler + executor |
| `frontend/src/components/V2ResultPanel.tsx` | Result display |
| `frontend/src/config/featureFlags.ts` | Feature toggle |

## Testing

Run the Playwright test for V2 flow:

```bash
npx playwright test qa/verify/ui/proxy/v2_execute.spec.ts
```

## Future Considerations

This thin client model enables:

- **Watch folder processing** — Backend monitors folder, compiles JobSpecs
- **Batch queue processing** — Backend queues JobSpecs, executes sequentially
- **CI/CD integration** — External systems submit JobSpecs directly
- **Audit logging** — Every JobSpec and Result is serializable/loggable

The UI becomes one of many possible clients, all using the same authoritative execution engine.
