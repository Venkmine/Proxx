# QC Execution Engine

**DRY-RUN ONLY** - This engine simulates job execution without invoking FFmpeg or DaVinci Resolve.

## Purpose

The QC execution engine provides:

1. **Real validation** - Checks source files, output paths, container compatibility, etc.
2. **Deterministic simulation** - Predictable state transitions for UI testing
3. **Production-like behavior** - UI treats QC execution as real execution

## Architecture

```
┌─────────────────┐
│  qcEngine.ts    │  ← Core validation & simulation logic
└────────┬────────┘
         │
         │ emits ExecutionEvent
         │
         ▼
┌─────────────────┐
│ qcIntegration.ts│  ← Maps QC states to job statuses
└────────┬────────┘
         │
         │ provides runQcJobExecution()
         │
         ▼
┌─────────────────┐
│useQcExecution.ts│  ← React hook for components
└────────┬────────┘
         │
         │ used by
         │
         ▼
     App.tsx
```

## Files

### `executionTypes.ts`

Type definitions for execution states and events.

**Key Types:**
- `JobState` - State machine states (PENDING → VALIDATING → READY → DRY_RUNNING → COMPLETE)
- `ExecutionEvent` - Event payload with jobId, state, and optional message

### `qcEngine.ts`

Core execution engine with validation and simulation logic.

**Key Function:**
```ts
runQcJob(jobSpec: JobSpec, emit: (event: ExecutionEvent) => void): Promise<void>
```

**Validation Checks:**
- Source file paths (structure, not filesystem access in browser)
- Output directory path validity
- Filename template format
- Container/codec compatibility
- Execution engine requirements (stub in dry-run)

**Simulation Behavior:**
- 500ms validation phase
- 300ms per clip simulation
- Progress updates during execution
- Deterministic state transitions

### `qcIntegration.ts`

Integration layer between QC engine and queue state.

**Key Function:**
```ts
runQcJobExecution(
  jobSpec: JobSpec,
  onStateChange: (event: ExecutionEvent) => void
): Promise<void>
```

**State Mapping:**
```ts
QC_STATE_TO_JOB_STATUS = {
  PENDING: 'PENDING',
  VALIDATING: 'VALIDATING',
  READY: 'READY',
  BLOCKED: 'BLOCKED',
  DRY_RUNNING: 'RUNNING',  // Maps to RUNNING for UI progress
  COMPLETE: 'COMPLETED'
}
```

### `useQcExecution.ts` (Hook)

React hook for easy integration with components.

**Usage:**
```ts
const { runQcJob, isRunning, currentJobId, error } = useQcExecution({
  onStateChange: (jobId, state, message) => {
    // Update queue state
  },
  onComplete: (jobId) => {
    // Handle completion
  },
  onBlocked: (jobId, reasons) => {
    // Handle validation failure
  }
})

// Execute QC job
await runQcJob(jobSpec)
```

## Integration with App.tsx

### Option 1: Add QC Mode Flag

Add a feature flag or environment variable to enable QC mode:

```ts
// In App.tsx
const QC_MODE = import.meta.env.VITE_QC_MODE === 'true'

// Add QC execution hook
const qcExecution = useQcExecution({
  onStateChange: (jobId, state, message) => {
    // Update job status
    setJobs(prev => prev.map(j => 
      j.id === jobId ? { ...j, status: state } : j
    ))
    
    // Add status log
    if (message) {
      addStatusLogEntry({
        timestamp: Date.now(),
        message: `[QC] ${message}`,
        level: state === 'BLOCKED' ? 'error' : 'info'
      })
    }
  },
  onComplete: (jobId) => {
    addStatusLogEntry(statusMessages.jobCompleted(jobId))
    fetchJobs() // Refresh queue
  },
  onBlocked: (jobId, reasons) => {
    setError(`Job ${jobId} validation failed: ${reasons}`)
  }
})

// Modify startJob to use QC engine in QC mode
const startJob = async (jobId: string) => {
  if (QC_MODE && queuedJobSpec?.job_id === jobId) {
    // QC Mode: Use dry-run engine
    try {
      setLoading(true)
      await qcExecution.runQcJob(queuedJobSpec)
    } catch (err) {
      setError(createJobError('start', jobId, err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  } else {
    // Production Mode: Use real backend
    // ... existing startJob implementation
  }
}
```

### Option 2: Add "Run QC" Button

Add a separate button for QC execution alongside the regular Start button:

```tsx
// In JobGroup component or queue controls
{QC_MODE && job.status === 'PENDING' && (
  <Button
    variant="secondary"
    size="sm"
    onClick={() => runQcJob(job.id)}
    disabled={loading}
    data-testid="run-qc-btn"
  >
    Run QC
  </Button>
)}
```

### Option 3: Environment-Based Execution

Set execution mode via environment variable at build/runtime:

```bash
# QC Mode
VITE_QC_MODE=true npm run dev

# Production Mode
npm run dev
```

## Validation Rules

The QC engine performs these validations:

### Source Files
- ✓ Non-empty source list
- ✓ No empty paths
- ⚠️ Warn on suspicious patterns (`..`, `//`, trailing `/`)

### Output Directory
- ✓ Non-empty path
- ⚠️ Warn on relative traversal
- ⚠️ Warn if path looks like a file

### Filename Template
- ✓ Non-empty template
- ✓ No invalid filename characters (`<>:"|?*`)
- ✓ No path separators in template

### Container/Codec Compatibility
- ✓ ProRes requires MOV or MXF
- ⚠️ H.264/H.265 recommended for MP4/MOV

### Execution Engines
- ℹ️ Stub validation (always passes with info message)
- In production: would check FFmpeg binary and Resolve installation

## Execution Flow

```
User clicks "Run QC"
        ↓
   [PENDING]
        ↓
 emit VALIDATING ──────────────────┐
        ↓                           │
   Run validation checks            │
        ↓                           │
   Validation result?               │
        ├─ FAIL ─→ emit BLOCKED ────┤
        │                           │
        └─ PASS ─→ emit READY       │
                       ↓            │
                  emit DRY_RUNNING  │
                       ↓            │
            Simulate per-clip work  │
              (300ms per clip)      │
                       ↓            │
                  emit COMPLETE ────┘
                       ↓
                Queue state updated
```

## State Machine

```
PENDING ──→ VALIDATING ──→ READY ──→ DRY_RUNNING ──→ COMPLETE
                │
                └──→ BLOCKED (validation failed)
```

## Important Constraints

❌ **Do NOT:**
- Invoke FFmpeg or Resolve
- Add UI conditionals that distinguish QC from real execution
- Modify JobSpec structure
- Add timers outside the engine
- Make filesystem calls in browser context

✓ **Do:**
- Perform real validation checks
- Use deterministic state transitions
- Emit events that match production flow
- Treat QC execution like real execution in UI

## Testing

The QC engine is designed for testing the complete execution flow:

1. **Validation Testing** - Verify all validation rules trigger correctly
2. **State Machine Testing** - Ensure proper state transitions
3. **UI Integration Testing** - Verify UI responds correctly to execution events
4. **Error Handling Testing** - Test blocked states and error messages

## Future Enhancements

Potential improvements (not currently implemented):

- [ ] Filesystem validation via backend API
- [ ] FFmpeg binary check via backend
- [ ] Resolve installation check via backend
- [ ] Progress percentage per clip
- [ ] Failure simulation for negative testing
- [ ] Configurable simulation delays

---

**Remember:** This is a DRY-RUN engine. Production execution must use the real backend execution endpoints.
