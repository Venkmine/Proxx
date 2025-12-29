# Phase 3: Fabric Views (Read-Only Composition)

## Purpose and Scope

Fabric views provide **read-only composition** of Fabric data with operator annotations. They exist to serve operator/UI consumption needs by presenting a unified view of facts (Fabric) and human decisions (annotations).

**Views are NOT part of Fabric's core logic.** They are a presentation layer only.

## What Views Do

Views compose data from two sources:

1. **Fabric data** (jobs, snapshots) - unchanged
2. **Operator annotations** - unchanged

The result is an in-memory structure that shows both together, for convenience.

Example: A job view shows:
- The job's Fabric data (status, attempts, timestamps, etc.)
- Zero or more operator annotations attached to that job

## What Views Do NOT Do

Views explicitly do **NOT**:

- Add meaning to annotations
- Infer operator intent
- Drive execution decisions
- Modify Fabric data
- Modify annotations
- Persist anything
- Implement policy
- Score or rank anything
- Apply heuristics
- Trigger automation

**Views are pure functions over their inputs.**

## Explicit Separation from Decision-Making

Views do **NOT** interpret what annotations mean:

- A "retry" annotation attached to a job does NOT trigger a retry
- An "ignore" annotation does NOT change failure handling
- An "escalate" annotation does NOT create tickets or alerts

Views simply show that these annotations exist. What they mean or what to do about them is **outside the scope of views**.

## Data Model

### JobWithAnnotations

- `job_id`: The job identifier
- `fabric_data`: The complete job dictionary from Fabric (unchanged)
- `annotations`: List of operator annotations for this job (sorted by created_at, then annotation_id)

### SnapshotWithAnnotations

- `snapshot_id`: The snapshot identifier
- `fabric_data`: The complete snapshot dictionary from Fabric (unchanged)
- `annotations`: List of operator annotations for this snapshot (sorted by created_at, then annotation_id)

## Operations

Two read operations are provided:

1. **jobs_with_annotations()**: Returns all jobs with their annotations
2. **snapshots_with_annotations(job_id)**: Returns all snapshots for a job with their annotations

Both return deterministic, sorted results.

## Composition Rules

1. **No Mutation**: Fabric data and annotations are never modified
2. **In-Memory Only**: Composition happens in memory, no persistence
3. **Deterministic Ordering**: Output is always in the same order
4. **Empty is Valid**: Jobs/snapshots with zero annotations are included normally
5. **ID-Based Attachment**: Annotations are attached by matching target_id to job_id/snapshot_id

## Storage and Persistence

Views do **NOT** persist anything. They are computed on-demand from:
- Fabric store (read-only)
- Annotation store (read-only)

## Non-Goals (Repeated Loudly)

This system explicitly does **NOT**:

- Interpret annotations
- Make decisions based on annotations
- Implement retry policy
- Implement escalation workflow
- Filter or hide failed jobs
- Rank or score jobs by annotations
- Automate operator decisions
- Replace manual review
- Provide analytics
- Enforce business rules
- Track follow-up actions
- Modify Fabric state
- Modify annotation state
- Persist composed views

## Integration Points

Views read from:
- `FabricStore` (via read APIs: `list_jobs()`, `list_snapshots()`)
- `AnnotationStore` (via `list_annotations()`)

Views do NOT write to anything.

## Use Cases

Valid use cases:
- Display job list with annotation counts in UI
- Show operator notes alongside job details
- Export combined data for reporting
- Answer "which jobs have retry annotations?"

Invalid use cases:
- Automatically retry jobs marked "retry"
- Skip jobs marked "ignore"
- Create tickets for "escalate" annotations
- Change job state based on annotations

## Future Considerations

If views need to support filtering, sorting, or aggregation in the future, those would be additional pure functions that operate on the composed views.

If decision automation based on annotations is needed, that would be a **separate system** that reads views and takes action via Fabric APIs. That system does not exist today.

## Summary

Views are a **read-only presentation layer** that combines Fabric data with operator annotations for consumption. They do not add meaning, infer intent, or drive execution.
