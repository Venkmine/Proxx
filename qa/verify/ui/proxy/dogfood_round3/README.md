# Dogfood Verification Suite — Round 3 (System Truth)

## Philosophy

This test suite verifies **REAL BEHAVIOUR**, not idealised behaviour.

### Core Truths Assumed

1. **Job execution is synchronous** — when you start a job, it may complete immediately
2. **RUNNING is not a stable or UI-observable state** — jobs may transition PENDING → COMPLETED instantly
3. **Cancel is best-effort** — it may only apply before execution begins
4. **COMPLETED may occur immediately after START** — UI must handle this gracefully
5. **Determinism and honesty matter more than feature completeness**

### What This Suite Tests

| Phase | Name | Description |
|-------|------|-------------|
| A | Lifecycle Truth | Job states, transitions, actual vs expected behavior |
| B | State Consistency Under Speed | Fast execution, no flashing/glitching |
| C | Rapid User Abuse | Double-clicks, rapid actions, stress testing |
| D | Queue Invariants | FIFO order, job numbering, clearing |
| E | Output Forensics | ffprobe validation, output existence |
| F | Overwrite & Collision Safety | Concurrent outputs, collision detection |
| G | UI Honesty Audit | No fake controls, honest tooltips |
| H | Persistence & Reset Honesty | Restart behavior, reconnection |
| I | Logging & Safety | Log growth bounds, error logging |
| J | Negative Assertions | What the system explicitly does NOT do |

### Multi-Outcome Testing

Many tests accept **multiple valid outcomes** where the system behavior is legitimately variable.
For example:
- Cancel may or may not work depending on timing
- RUNNING may or may not be visible depending on execution speed
- Collision handling varies by implementation

Tests document which outcomes are acceptable and fail only when behavior is outside all valid outcomes.

### Running the Suite

```bash
cd qa/verify/ui
npx playwright test --grep "R3-" --reporter=list
```

### Test Naming Convention

All tests are prefixed with phase identifier:
- `R3-A1` = Round 3, Phase A, Test 1
- `R3-B2` = Round 3, Phase B, Test 2
- etc.

---

## Verified System Truths

_Updated after test execution:_

### Guaranteed Behaviors
- [ ] Jobs start in PENDING state
- [ ] Jobs reach terminal state (COMPLETED, FAILED, or CANCELLED)
- [ ] FIFO order is preserved for job numbering
- [ ] Output files are created for COMPLETED jobs
- [ ] UI remains stable under rapid user actions

### Explicit Non-Guarantees
- [ ] RUNNING state is observable in UI
- [ ] Cancel will stop an executing job
- [ ] Pause/resume is supported
- [ ] Real-time progress is displayed
- [ ] Auto-retry is performed

---

## Author

Dogfood Round 3 — December 2024
