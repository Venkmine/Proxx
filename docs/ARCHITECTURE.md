# AWAIRE PROXY — ARCHITECTURE OVERVIEW

**Status:** Active
**Scope:** Describes current, trusted system behaviour only
**Rule:** If it is not dog-fooded, invariant-protected, and observable, it does not belong here.

---

## 1. What This System Is

Awaire Proxy is a **desktop, user-initiated, deterministic media processing application**.

It consists of:

* A preview-authoritative React UI
* A local execution backend
* Explicit job creation
* Immutable job snapshots
* FFmpeg-based processing
* A visible, inspectable queue

It is **not** a daemon, not autonomous, and not a background automation system.

---

## 2. Authority Model (Critical)

### 2.1 Preview Is Authoritative

The **preview canvas is the single source of truth** for all spatial state:

* Overlay position
* Overlay scale
* Anchors
* Safe-area clamping
* Coordinate transforms

All spatial interaction happens in the preview.
Side panels **inspect and configure**, they do not render or decide geometry.

If something cannot be represented in the preview, it is not valid state.

---

### 2.2 Jobs Are Immutable

When a job is created:

* All settings are **snapshotted**
* Presets are flattened into job data
* No future preset edits can affect existing jobs
* No UI interaction mutates a job retroactively

Jobs move forward only through explicit user action.

---

### 2.3 No Silent Behaviour

Nothing happens unless the user does something observable.

This includes:

* No background reconciliation
* No implicit preset re-application
* No auto-correction
* No “helpful” fixing

If state changes, the user caused it, or it is a bug.

---

## 3. Frontend Architecture

### Runtime

* Electron shell
* React application
* Local IPC via HTTP

### Core Principle

The frontend **does not invent truth**.
It renders state, collects intent, and enforces interaction rules.

---

### 3.1 VisualPreviewWorkspace

**Role:** Single authoritative spatial workspace.

Responsibilities:

* Video preview
* Overlay rendering
* Overlay selection and manipulation
* Bounding boxes and handles
* Mode-dependent interaction gating

Modes:

* **View** — playback only
* **Overlays** — spatial editing enabled
* **Burn-In** — burn-in overlays editable, others locked

All coordinate math routes through a single transform system.

There is no inline or ad-hoc geometry logic elsewhere.

---

### 3.2 PreviewTransform System

All coordinate conversion is centralized:

* Screen ↔ canvas
* Canvas ↔ normalized space
* Safe-area clamping
* Anchor resolution

This system exists to prevent drift, rounding chaos, and inconsistent math.

Any bypass of this system is a defect.

---

### 3.3 Overlay System

Overlays are explicit data objects with:

* Type (text, image, burn-in)
* Geometry
* Source of position (`preset` vs `manual`)
* Mode-based edit permissions

Manual edits assert authority over presets.

Preset re-application requires explicit confirmation if it would override manual work.

---

### 3.4 Invariants

Invariants are **runtime guards** that detect architectural violations.

They:

* Do not fix state
* Do not auto-correct
* Surface errors loudly and persistently

Examples:

* Editing overlays in the wrong mode
* Preset/manual position conflicts
* Geometry leaving safe bounds
* Preview transform bypasses

Invariants are part of the architecture, not debugging helpers.

---

## 4. Preset System (Current Reality)

Presets are **configuration libraries**, not live bindings.

Current behaviour:

* Presets live client-side
* Applying a preset copies values into working state
* Jobs store a full snapshot of resolved settings
* Backend does not resolve or look up presets

Presets can never silently mutate jobs.

---

## 5. Job & Queue Model

### Job Creation

* User selects sources
* User configures settings
* User explicitly creates a job

A job contains:

* Source list
* Resolved settings snapshot
* Output intent

---

### Queue Semantics

* Jobs are listed explicitly
* Order is visible
* Cancel and remove are always available
* Errors persist until acknowledged
* Partial success is normal and expected

The queue exists to **prove what was attempted**, not to look efficient.

---

## 6. Backend Architecture (As Implemented)

### Role

The backend executes declared intent. Nothing more.

Responsibilities:

* Receive job definitions
* Execute FFmpeg processes
* Report success and failure
* Validate outputs at a basic level

It does not:

* Invent jobs
* Mutate job intent
* Auto-retry
* Guess user intent

---

### Execution Engine

* FFmpeg via subprocess
* One clip failure does not block others
* Warn-and-continue is the default

Output existence and size are validated.
Deeper QC is out of scope at this stage.

---

## 7. What Is Explicitly Not Here

These systems do **not** exist yet and must not be assumed:

* Watch folders
* Autonomous ingestion
* QC pipelines
* AI analysis
* Delivery logic
* Multi-node execution
* Background daemons

If it’s not described above, it’s not part of the architecture.

---

## 8. Design Posture

This architecture prioritizes:

* Truth over convenience
* Explicit intent over automation
* Predictability over speed
* Human trust over feature count

Anything that weakens those is architectural debt.

---

**End of document**

---


