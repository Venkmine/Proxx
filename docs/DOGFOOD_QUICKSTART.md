# Dogfooding Quick Start

**Goal:** Test truthfulness of all Proxx systems before feature freeze lifts.

---

## 1. Setup (5 minutes)

```bash
# Create test media structure
./scripts/prepare_dogfood_media.sh

# Copy REAL media files to test_media/dogfood/
# See test_media/dogfood/README.md for requirements

# Verify setup
./scripts/dogfood_helper.sh media
```

---

## 2. Pre-Flight (2 minutes)

```bash
# Check backend & frontend
./scripts/dogfood_helper.sh check

# Clear old jobs (if any)
./scripts/dogfood_helper.sh jobs
# Delete manually via UI if needed

# Open findings log
code DOGFOOD_FINDINGS.md
```

---

## 3. Execute Tests (2 hours)

Follow [DOGFOOD_CHECKLIST.md](DOGFOOD_CHECKLIST.md) in order:

1. **Ingestion** (15 min) — Does nothing happen until confirm?
2. **Queue** (30 min) — Does queue lie about what's running? 🔴
3. **Preview** (20 min) — Does preview match output? 🔴
4. **Overlay** (25 min) — Do clip-scoped overlays isolate?
5. **Read-Only** (10 min) — Can I mutate while running?
6. **Failure** (20 min) — Would user blame app or themselves?
7. **Cold Start** (15 min) — Does recovery feel trustworthy?

**Log every issue in [DOGFOOD_FINDINGS.md](DOGFOOD_FINDINGS.md) as you go.**

---

## 4. Exit Criteria

Stop when:
- [ ] 10+ jobs back-to-back without surprises
- [ ] Failures feel boring
- [ ] You trust the queue
- [ ] **You stop feeling anxious after clicking Render**

---

## 5. Completion

```bash
# Review findings
code DOGFOOD_FINDINGS.md

# Write summary:
# - Recurring failure patterns
# - Recurring confusion points
# - Recurring surprises

# Report:
# "Dogfooding complete. Proceed to Preset Foundations."
```

**DO NOT FIX ANYTHING** (freeze rules).

---

## Helper Commands

```bash
./scripts/dogfood_helper.sh check    # Health check
./scripts/dogfood_helper.sh jobs     # Inspect queue
./scripts/dogfood_helper.sh logs     # View backend logs
./scripts/dogfood_helper.sh states   # State diagram
```

---

## Documents

- [DOGFOOD_PLAN.md](DOGFOOD_PLAN.md) — Full test procedures (84 tests)
- [DOGFOOD_CHECKLIST.md](DOGFOOD_CHECKLIST.md) — Quick reference
- [DOGFOOD_FINDINGS.md](DOGFOOD_FINDINGS.md) — Log findings here
- [DOGFOOD_IMPLEMENTATION.md](DOGFOOD_IMPLEMENTATION.md) — Implementation notes

---

**Test TRUTHFULNESS, not capability.**  
**Document patterns, not solutions.**
