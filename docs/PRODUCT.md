# AWAIRE PROXY — PRODUCT DEFINITION

**Status:** Active
**Audience:** Post-production professionals who value predictability over cleverness
**Rule:** This document defines scope. Anything outside it is out of bounds by default.

---

## 1. What Awaire Proxy Is

Awaire Proxy is a **deterministic, user-driven media processing tool**.

It allows humans to:

* Declare processing intent explicitly
* Preview and validate spatial decisions
* Generate predictable derivatives using FFmpeg
* Prove what was attempted and what succeeded
* Trust outputs without babysitting or guesswork

Proxy is built to be **believed**, not admired.

---

## 2. What Awaire Proxy Is For

Proxy exists to remove three common failures in post workflows:

1. **Silent behaviour**
2. **UI deception**
3. **State drift between preview and output**

It solves these by enforcing:

* Preview authority
* Job immutability
* Explicit user intent
* Boring, inspectable execution

---

## 3. What Awaire Proxy Is Not

Awaire Proxy is **not**:

* A background daemon
* A watch-folder-first system
* A media management tool
* A creative grading or finishing pipeline
* A QC system
* A delivery platform
* An AI-driven fixer
* A general-purpose FFmpeg wrapper

If a feature proposal drifts toward any of the above, it is **out of scope unless explicitly redefined later**.

---

## 4. Core Product Principles (Non-Negotiable)

### 4.1 Trust Over Automation

Nothing happens unless the user can see it, understand it, and repeat it.

Automation is deferred until trust is absolute.

---

### 4.2 Preview Is the Authority

If the preview shows it, it must be real.
If the preview cannot show it, it does not exist.

The UI is not decorative. It is evidentiary.

---

### 4.3 Jobs Do Not Change After Creation

Once a job exists:

* Presets are irrelevant
* UI edits cannot affect it
* Output intent is frozen

This makes jobs auditable and repeatable.

---

### 4.4 Partial Success Is Normal

Proxy assumes:

* Bad media exists
* Drives disappear
* Codecs lie
* Machines fail

A job is successful if:

* Everything was attempted
* Failures are visible
* Nothing failed silently

---

## 5. Who This Is For

Primary users:

* Assistant editors
* Post-production engineers
* Studio tech teams
* Facilities operators

Secondary users (unsupported by design):

* Freelancers who already understand failure modes

This is not a consumer product and does not attempt to be friendly to beginners.

---

## 6. Current Capabilities (Truthful)

Proxy currently provides:

* Manual source selection
* Preview-authoritative overlay design
* Preset-based configuration (snapshot at job creation)
* Explicit job creation
* FFmpeg-based execution
* Visible queue with persistent errors
* Deterministic, boring outputs

Nothing more. Nothing less.

---

## 7. Explicit Non-Goals (For Now)

The following are **intentionally absent**:

* Watch folders
* Autonomous ingestion
* QC analysis
* AI interpretation
* Delivery logic
* Background operation
* Performance optimisation beyond correctness

Their absence is deliberate, not accidental.

---

## 8. Product Trajectory (Without Promises)

Proxy is intended to become the **first deterministic processing module** in a larger automation system.

This does **not** imply:

* Timelines
* Roadmaps
* Feature commitments

Any expansion must preserve:

* Preview authority
* Explicit intent
* Deterministic execution
* Human-readable outcomes

If those cannot be preserved, the expansion does not happen.

---

## 9. Product Philosophy (Plainly)

Awaire Proxy assumes:

* Humans are busy and tired
* Mistakes happen at 3am
* Trust is earned slowly and lost instantly

The product optimises for:

* Fewer surprises
* Fewer apologies
* Fewer “I thought it did X”

If Proxy feels conservative, that is intentional.

---

**End of document**

---
