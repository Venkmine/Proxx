# Phase 3: Operator Annotations

## Purpose and Scope

Operator annotations are **external, manual records** of operator decisions about jobs or snapshots. They exist **outside** the Fabric system and do **NOT** affect execution, retries, or policy.

This is a **pure logging system** for human operators to record their decisions.

## Explicit Separation from Fabric

**Operator annotations are NOT part of Fabric.**

- Fabric does NOT read annotations.
- Fabric does NOT interpret annotations.
- Fabric does NOT execute based on annotations.
- Annotations do NOT modify Fabric state.
- Annotations do NOT trigger any automation.

Annotations are **parallel** to Fabric, not integrated with it.

## What Annotations Mean

An operator annotation is a record that states:

> "On [date/time], operator [X] decided to [retry/ignore/escalate] [job/snapshot] [ID], with optional note [Y]."

That's it. It's a **journal entry**, nothing more.

## What Annotations Do NOT Do

Annotations do **NOT**:

- Trigger retries
- Block execution
- Change failure handling
- Update job state
- Modify snapshots
- Affect Fabric logic
- Implement policy
- Execute decisions
- Automate anything

## Data Model

Each annotation contains:

- `annotation_id`: Unique identifier (UUID)
- `target_type`: "job" or "snapshot"
- `target_id`: ID of the target
- `decision`: "retry", "ignore", or "escalate"
- `note`: Optional free-text note
- `operator_id`: Who made this annotation
- `created_at`: When this was recorded (UTC)

**Annotations are immutable.** Once created, they cannot be changed or deleted.

## Operations

Only two operations are supported:

1. **Create**: Record a new annotation
2. **List**: Retrieve annotations (optionally filtered by target_id)

No updates. No deletes. No queries beyond listing.

## Storage

Annotations are stored as individual JSON files, one per annotation.

File naming: `{annotation_id}.json`

This is deliberately simple and auditable.

## Non-Goals (Repeated Clearly)

This system explicitly does **NOT**:

- Integrate with Fabric
- Integrate with execution logic
- Implement retry policy
- Implement escalation workflow
- Automate operator decisions
- Replace manual review
- Provide analytics or reporting
- Enforce business rules
- Track follow-up actions
- Manage operator permissions

## Future Considerations

If operator decisions need to affect execution in the future, that would be a **separate system** that:

1. Reads annotations
2. Interprets them according to policy
3. Takes action via Fabric APIs

That system does not exist today and is not part of this implementation.

## Summary

Operator annotations are a **write-only journal** for recording human decisions. They are external to Fabric and do not affect system behavior.
