# Observability Principles

Observability is a first-class system principle in Proxx. These five principles guide all debugging, logging, and error handling decisions.

---

## 1. No Silent Failure

**Rule:** Every error, exception, or unexpected state must produce a visible, logged output.

**Rationale:** Silent failures hide bugs and make debugging impossible; explicit failures expose problems immediately.

---

## 2. Output Truth Over UI State

**Rule:** Backend logs and API responses are the source of truth, not what the UI displays.

**Rationale:** UI state can be stale, cached, or misinterpreted; raw output data provides an unambiguous record of what actually happened.

---

## 3. Logs Over Guesses

**Rule:** When diagnosing an issue, always consult logs before forming hypotheses.

**Rationale:** Speculation wastes time and introduces confirmation bias; logs provide objective evidence of system behavior.

---

## 4. Reproducibility Over Recovery

**Rule:** Preserve the conditions that caused a failure rather than silently recovering from it.

**Rationale:** Automatic recovery masks root causes; reproducible failures enable systematic debugging and permanent fixes.

---

## 5. Determinism Beats Convenience

**Rule:** Prefer deterministic operations with predictable outputs over convenient shortcuts with variable behavior.

**Rationale:** Non-deterministic systems produce intermittent failures that are difficult to diagnose and impossible to reliably reproduce.

---

## 6. Invalid Input Is a First-Class Signal

**Rule:** Invalid input is a first-class signal, not a recoverable condition.

**Rationale:** Permissive parsing and "helpful" coercion create silent compatibility bugs that surface in production. Contract violations must fail immediately and explicitly with diagnostic information.
