INACTIVE — DOES NOT DESCRIBE CURRENT PRODUCT STATE (ALPHA)

PRODUCT_PROXY_V1.md

QA.md (Verify principles stay, “Definition of Done” does not)

NEXT_AFTER_V1.md

# Awaire Proxy — Hard Constraints

These constraints are non-negotiable.

## Architectural

- FFmpeg is the sole execution engine
- Filesystem state is authoritative
- UI derives state from job engine, never the reverse
- No silent fallbacks

## Execution

- Default behavior is WARN AND CONTINUE
- One clip failure must never block a job
- No modal dialogs during active jobs
- Jobs must survive overnight unattended runs
- Partial success must be reported honestly

## UX

- Operators must be able to prove what happened
- Errors are logged, surfaced, and reported, not hidden
- No "clever" automation that hides failure modes
- Reliability matters more than features

## QA

- Verify is the only QA entrypoint
- No raw pytest, npm test, or ad-hoc commands
- Every bug results in a regression test
- No release without Verify Proxy Full passing

## Development Discipline

- Docs are the source of truth
- Small commits only
- Assume the machine can die mid-run
- No future roadmap language in docs

If a proposed change violates these constraints, stop and explain.
