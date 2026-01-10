# Phase 8: Watch Folder ↔ Ingest Structural Alignment — Non-Goals

**Purpose:** Document what Phase 8 explicitly does NOT include to prevent scope creep and future confusion.

---

## What Phase 8 IS

Phase 8 is a **structural alignment phase** that prepares Watch Folders for future convergence with an Ingest module by:

1. Introducing `IngestSource` type abstraction
2. Adding schema fields for copy-then-transcode (no behavior)
3. Enforcing counts-only UI (no per-file lists)
4. Documenting the mental model shift

**This is data model work only. No execution behavior changes.**

---

## What Phase 8 IS NOT

### ❌ No Auto Job Creation

* Watch Folders remain **manual execution only** (unless explicitly armed via Phase 7)
* No new automation introduced
* No background job creation
* Operator must still click "Create Jobs"

**Reasoning:** Automation belongs to Phase 7 (Armed Watch Folders). Phase 8 is structural only.

---

### ❌ No File Moves or Copies

* No filesystem writes
* No staging directory creation
* No file operations of any kind
* `staging_path` field exists but is not used

**Reasoning:** Copy-then-transcode is a future phase. Phase 8 only adds the schema placeholder.

---

### ❌ No Recursion Changes

* Recursive watching behavior unchanged
* No traversal logic modifications
* No subfolder scanning changes

**Reasoning:** Watch Folder recursion is working. Phase 8 does not touch it.

---

### ❌ No Ingest Pipeline Execution

* No transcode triggering
* No job orchestration changes
* No Resolve interaction
* `ingest_strategy` field exists but is not evaluated

**Reasoning:** Ingest execution is future work. Phase 8 is schema preparation only.

---

### ❌ No Performance Work

* No optimization
* No caching
* No deduplication
* No throttling

**Reasoning:** Phase 8 is about structure, not performance. Optimization is a separate concern.

---

### ❌ No UI/UX Redesign

* Panel layout unchanged
* No new controls
* No new animations
* Only removed per-file lists (counts-only enforcement)

**Reasoning:** UI improvements are separate from structural alignment.

---

### ❌ No Testing Framework Changes

* E2E tests updated for counts-only assertions
* No new test infrastructure
* No test runner changes

**Reasoning:** Tests validate Phase 8 changes but do not introduce new test patterns.

---

## What IS Allowed (Clarifications)

### ✅ Schema Fields Added (But Not Used)

* `ingest_source_type?: IngestSourceType` — Reserved for future
* `ingest_source_state?: IngestSourceState` — Reserved for future
* `ingest_strategy?: IngestStrategy` — Reserved for future
* `staging_path?: string` — Reserved for future

These fields are **comments in code form**. They document intent without adding behavior.

---

### ✅ Type Definitions

* New `IngestSource` interface created
* New `IngestSourceType`, `IngestSourceState`, `IngestStrategy` enums
* Watch Folder types extended with optional ingest fields

Type definitions are non-executable and safe to add.

---

### ✅ UI Simplification (Counts Only)

* Removed per-file list view toggle
* Replaced file list with count-based summary
* Shows "last activity" timestamp instead of file details

This is **removing complexity**, not adding it.

---

### ✅ Documentation Updates

* Updated component headers with Phase 8 context
* Added comments explaining reserved fields
* Updated type definitions with future alignment notes

Documentation clarifies intent and prevents confusion.

---

## Enforcement

**If you find yourself:**

* Writing filesystem operations → **STOP**, out of scope
* Adding job creation logic → **STOP**, Phase 7 already handles this
* Implementing copy-then-transcode → **STOP**, future phase
* Optimizing performance → **STOP**, separate concern
* Adding new automation → **STOP**, contradicts INTENT.md

**Ask:** "Does this change execution behavior?"

* **Yes** → Out of scope for Phase 8
* **No** → Probably fine (if it's schema or documentation)

---

## Success Criteria (What Phase 8 Must Achieve)

1. ✅ `IngestSource` type exists and is documented
2. ✅ Watch Folder types include future ingest fields (unused)
3. ✅ UI shows counts only (no per-file lists)
4. ✅ No execution behavior changes
5. ✅ E2E tests validate counts-only UI contract

**If all 5 are true, Phase 8 is complete.**

---

## Next Phase Preview (What Comes After Phase 8)

**Phase 9 (Future): Armed Watch Folders → Auto-Job Dry Run Mode**

* Simulate auto job creation without execution
* Operator approval step before jobs run
* Trace logging for validation

**Phase 10 (Future): Copy-Then-Transcode Implementation**

* Use `staging_path` field
* Implement file copy logic
* Add copy progress tracking
* Validate stability before transcode

**Phase 11 (Future): Full Ingest Pipeline**

* Watch Folders emit IngestSource events
* Ingest module consumes IngestSources
* Unified execution model

---

## Commit Message Template

```
phase 8: align watch folders with ingest source model (structure only)

- Created IngestSource type abstraction
- Added future copy-then-transcode schema (unused)
- Enforced counts-only UI (removed per-file lists)
- No execution behavior changes
- No filesystem operations

Non-goals documented in PHASE_8_NON_GOALS.md
```

---

## Questions to Ask During Review

1. Does this PR change job creation behavior? (Should be NO)
2. Does this PR write to the filesystem? (Should be NO)
3. Does this PR add new automation? (Should be NO)
4. Does the UI show file lists anywhere? (Should be NO)
5. Are the new schema fields used in logic? (Should be NO)

**If any answer is YES, the PR is out of scope.**

---

**Phase 8 is structural groundwork. No behavior changes. No execution. Just types and UI simplification.**
