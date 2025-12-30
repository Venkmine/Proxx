# UI Data Contract

## Purpose

This document defines what the V2 UI can read and explicitly lists what it CANNOT do.

The UI data adapter is a **read-only consumer** of Fabric view exports. It has no authority to execute, retry, or modify any backend state.

## What the UI CAN Read

### Jobs View

The UI can fetch jobs with annotations:

```typescript
const jobs = await fetchJobsView();
```

Returns: Array of `JobView` objects containing:
- `job_id`: Job identifier
- `fabric_data`: Complete Fabric job data (unchanged from backend)
- `annotations`: Operator annotations for this job (sorted by created_at, then annotation_id)

**Source**: Backend `FabricViewComposer.jobs_with_annotations()` via `FabricViewExporter.export_jobs_view_json()`

### Snapshots View

The UI can fetch snapshots for a job:

```typescript
const snapshots = await fetchSnapshotsView(jobId);
```

Returns: Array of `SnapshotView` objects containing:
- `snapshot_id`: Snapshot identifier
- `fabric_data`: Complete Fabric snapshot data (unchanged from backend)
- `annotations`: Operator annotations for this snapshot (sorted by created_at, then annotation_id)

**Source**: Backend `FabricViewComposer.snapshots_with_annotations(job_id)` via `FabricViewExporter.export_snapshots_view_json()`

### Annotations

The UI can fetch all annotations or annotations for a specific target:

```typescript
const allAnnotations = await fetchAnnotations();
const jobAnnotations = await fetchAnnotationsForTarget("job", jobId);
const snapshotAnnotations = await fetchAnnotationsForTarget("snapshot", snapshotId);
```

Returns: Array of `Annotation` objects containing:
- `annotation_id`: UUID string
- `target_type`: "job" or "snapshot"
- `target_id`: Job or snapshot ID
- `decision`: "retry", "ignore", or "escalate"
- `note`: Optional text note
- `operator_id`: Operator identifier
- `created_at`: ISO 8601 datetime (UTC)

**Source**: Backend `AnnotationStore.list_annotations()`

## Data Guarantees

All data from the adapter has the following guarantees:

1. **Deterministic ordering**: Data is returned in stable, predictable order
2. **No transformation**: Backend data is passed through unchanged
3. **No inference**: No derived fields, computed properties, or smart defaults
4. **Verbatim failures**: Errors are surfaced exactly as received from backend

## What the UI CANNOT Do

### No Execution

The UI **CANNOT**:
- Trigger job execution
- Start, stop, or retry jobs
- Modify job state
- Queue jobs
- Execute tasks

**Rationale**: Execution is controlled by backend execution engines. UI is observation-only.

### No Retries

The UI **CANNOT**:
- Implement retry logic
- Decide retry policies
- Trigger automatic retries
- Override retry decisions

**Rationale**: Retry logic is owned by backend retry engines. UI can display retry history but cannot control it.

### No Inference

The UI **CANNOT**:
- Infer job status from partial data
- Compute derived metrics
- Add "smart defaults"
- Generate synthetic fields
- Interpret annotation meanings

**Rationale**: All interpretation and business logic lives in backend. UI displays facts only.

### No Mutation

The UI **CANNOT**:
- Modify Fabric data
- Update job state
- Change snapshot data
- Transform backend responses

**Rationale**: UI is read-only. All state changes happen through explicit backend APIs (not covered by this adapter).

### No Direct Execution Imports

The UI adapter **MUST NOT** import:
- Execution engines
- Retry logic
- Job creation
- Watch folder runners
- Policy engines

**Rationale**: UI has no execution authority. Importing execution code would create confusion about separation of concerns.

## Error Handling

All errors are surfaced verbatim with no interpretation:

```typescript
try {
  const jobs = await fetchJobsView();
} catch (error) {
  if (error instanceof DataAdapterError) {
    // error.message: Original error message
    // error.statusCode: HTTP status (if applicable)
    // error.response: Original response body
  }
}
```

The UI **MUST NOT**:
- Retry failed requests automatically
- Transform error messages
- Add contextual information
- Infer error causes

The UI **SHOULD**:
- Display errors exactly as received
- Log errors for debugging
- Allow user to retry manually

## Type Safety

All types in `types.ts` **MUST** mirror backend models exactly:

- `Annotation` mirrors `OperatorAnnotation` from `fabric.operator_annotations.models`
- `JobView` mirrors `JobWithAnnotations` from `fabric.views.views`
- `SnapshotView` mirrors `SnapshotWithAnnotations` from `fabric.views.views`

Any divergence is a bug and must be corrected.

## Testing Requirements

Tests **MUST** verify:

1. **Deterministic ordering**: Data is always returned in same order
2. **No transformation**: Backend data passes through unchanged
3. **Verbatim failures**: Errors contain original response data
4. **No execution imports**: Module does not import execution code

See [test_ui_data_adapter.ts](./test_ui_data_adapter.ts) for reference implementation.

## Evolution

This contract can evolve to add **read-only** capabilities only:

✅ Allowed:
- New read endpoints
- Additional view types
- More filtering parameters

❌ Forbidden:
- Mutation endpoints
- Execution triggers
- Business logic
- Derived computations

## Summary

**The UI is a consumer only.**

It reads Fabric view exports and displays them. It has no authority to execute, retry, or modify backend state. All transformation, inference, and business logic lives in backend.

This separation ensures:
- Clear boundaries
- Testable contracts
- Predictable behavior
- No hidden dependencies
