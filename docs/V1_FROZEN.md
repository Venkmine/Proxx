# Proxx V1 Frozen Specification

This document defines what Proxx V1 is and is not. It is immutable.

---

## 1. What Proxx V1 IS

- Single-clip proxy encoder
- Deterministic FFmpeg execution
- Explicit job lifecycle (PENDING → RUNNING → COMPLETED | FAILED)
- Preview is advisory only
- Naming tokens resolved before execution
- Fail fast if invariants are violated

---

## 2. What Proxx V1 IS NOT

- Not a QC system
- Not an interactive overlay editor
- Not a timeline player
- Not a multi-clip batch engine
- Not a retry/requeue system
- Not a pixel-accurate preview tool

---

## 3. Hard V1 Invariants

- Jobs must never be marked COMPLETED unless output file exists
- No silent state transitions
- No UI that suggests unavailable functionality
- No progress percentages or ETAs
- Preview must never claim output parity

---

## 4. Allowed Changes During V1 Freeze

- Bug fixes that violate invariants
- Crash fixes
- Truthfulness fixes (labels, tooltips, warnings)

---

## 5. Forbidden Changes During V1 Freeze

- New features
- UI layout changes
- Performance tuning
- Preview upgrades
- New codecs or containers

---

**Any change outside the 'Allowed' list requires explicitly starting V2.**
