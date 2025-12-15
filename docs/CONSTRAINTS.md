# PROXX — HARD CONSTRAINTS

These constraints are non-negotiable.

## Architectural

- Resolve Studio is required (v1.x)
- Resolve is the sole decode/render engine
- Proxx does not reimplement codecs
- Filesystem state is authoritative
- UI derives state from job engine, never the reverse

## Execution

- Default behavior is WARN AND CONTINUE
- One clip failure must never block a job
- No modal dialogs during active jobs
- Jobs must survive overnight unattended runs
- Partial success must be reported honestly

## UX

- Assistants must be able to prove what happened
- Errors are logged, surfaced, and reported, not hidden
- No “clever” automation that hides failure modes
- UI polish is secondary to correctness

## Development Discipline

- Docs are the source of truth
- `docs/TODO.md` must be updated after meaningful changes
- Small commits only
- Assume the machine can die mid-run

If a proposed change violates these constraints, stop and explain.