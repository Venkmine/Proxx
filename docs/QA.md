# AWAIRE PROXY — QA PRINCIPLES

**Status:** Active
**Purpose:** Define how correctness, trust, and failure are verified
**Rule:** QA exists to prove the system does not lie.

---

## 1. What QA Means in Proxy

QA in Awaire Proxy is not about polish, coverage percentages, or release gates.

QA exists to answer three questions:

1. **Did the system do what the user explicitly asked?**
2. **Can the user prove what happened after the fact?**
3. **Did anything happen without intent or visibility?**

If any answer is unclear, QA has failed.

---

## 2. Definition of Success

### Clip-Level Success

A clip is successful if:

* An output file exists
* The output file is non-zero size
* The output matches the declared job settings
* Any deviations are explicitly logged

No subjective judgement. No “looks fine”.

---

### Job-Level Success

A job is successful if:

* All clips were attempted
* Failures did not block other clips
* Errors are visible, persistent, and inspectable
* No clip was skipped silently

Partial success is expected and acceptable.

---

## 3. Failure Is a First-Class Outcome

Proxy assumes failure is normal.

Examples:

* Corrupt media
* Unsupported codecs
* Disk full
* Permission errors
* Interrupted execution

Failures must be:

* Detectable from logs and filesystem alone
* Re-runnable without manual cleanup
* Impossible to miss in the UI

A hidden failure is worse than a loud one.

---

## 4. UI Truthfulness as a QA Surface

The UI is part of the QA surface.

QA explicitly checks that:

* The preview does not imply precision it cannot guarantee
* Spatial edits in the preview are the only source of spatial truth
* Mode restrictions are enforced, not advisory
* Disabled controls are genuinely inert
* Errors do not auto-dismiss or disappear

A UI that *appears* to work but lies is a QA failure.

---

## 5. Invariants as QA Mechanisms

Invariants are runtime assertions that protect architectural truths.

They:

* Detect invalid state transitions
* Prevent silent corruption
* Surface violations immediately
* Never auto-correct or guess intent

An invariant firing is not a crash.
It is a QA success revealing a trust breach.

---

## 6. Regression Philosophy

Every trust-breaking bug must result in:

* A regression test **or**
* A new invariant **or**
* Both

If a bug can reoccur silently, QA has failed to learn.

---

## 7. What QA Explicitly Does Not Do

QA does not:

* Judge creative intent
* Perform QC analysis
* Validate aesthetic outcomes
* “Fix” user mistakes
* Optimise performance

Those belong to other systems, later, if at all.

---

## 8. Verification Scope (Current Reality)

QA currently verifies:

* Job creation integrity
* Snapshot immutability
* Preview-to-state consistency
* Invariant enforcement
* FFmpeg execution success/failure reporting

QA does **not** yet verify:

* Watch folder behaviour
* Delivery specs
* Broadcast compliance
* AI-derived analysis

Those systems do not exist yet and are out of scope.

---

## 9. QA Posture

QA in Proxy is intentionally conservative.

If something is ambiguous, it is treated as incorrect.
If something is implicit, it is treated as suspicious.
If something is clever, it is treated as a risk.

This is not pessimism. It is professional paranoia.

---

## 10. Test Media Policy (Repo Safety)

### Rule

**Real media files MUST NEVER be committed to the repository.**

### Why

Real production media files:
- Are too large for Git (multi-GB files destroy clone/fetch performance)
- Contain proprietary content (legal/licensing risk)
- Are unnecessary (tests use synthetic fixtures)

### Enforcement

The repository enforces this rule at three layers:

1. **`.gitignore` blocks all common media extensions**
   - Video: `.mxf`, `.mov`, `.mp4`, `.r3d`, `.braw`, `.ari`, etc.
   - Audio: `.wav`, `.aif`, `.flac`, `.mp3`, etc.
   - RAW: `.dng`, `.dpx`, `.exr`, etc.

2. **Pre-commit hook validates file sizes**
   - Blocks any file >10MB from being staged
   - Forces explicit review of large files

3. **QA fixtures are generated at runtime**
   - `qa/fixtures/` contains ONLY generated synthetic media
   - Fixtures are excluded via `.gitignore`
   - Tests generate fixtures on-demand using FFmpeg

### If You Need Test Media

**Option 1: Synthetic Fixtures (Preferred)**
- Use `qa/fixtures/generate_fixture.py` to create test media
- Fixtures are generated at test runtime
- No manual media management required

**Option 2: External Media**
- Store real media outside the repo
- Reference via symlinks (symlinks ARE committed, targets are not)
- Document external media requirements in test docstrings
- Use environment variables for media paths

**Option 3: Small Samples**
- If absolutely necessary, commit tiny samples (<1MB)
- MUST be explicitly reviewed and approved
- MUST be synthetic or cleared for licensing

### What to Do If a Large File Was Committed

If a large media file was accidentally committed:

1. **Remove from Git history immediately:**
   ```bash
   git rm --cached path/to/large_file.mxf
   git commit --amend
   git push --force-with-lease
   ```

2. **Verify `.gitignore` blocks the extension**

3. **If already pushed to remote:**
   - Notify team before force-pushing
   - Consider `git filter-repo` for deep history cleanup

### What Counts as "Media"

Blocked formats:
- **Video:** MXF, MOV, MP4, AVI, MKV, R3D, BRAW, ARI, ARRI, DNG, DPX, EXR
- **Audio:** WAV, AIF, AIFF, FLAC, M4A, AAC, MP3, OGG
- **Image sequences:** DPX, EXR, DNG (bulk image sequences)

Allowed formats:
- **Tiny samples:** <1MB, synthetic, approved
- **Metadata:** JSON, CSV, TXT, XML (media descriptors, not media itself)
- **Code:** Python, JS, Markdown, YAML, etc.

---

**End of document**

---
