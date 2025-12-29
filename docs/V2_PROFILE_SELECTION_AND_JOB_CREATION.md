# V2 Profile Selection and Job Creation

**Status:** Specification  
**Applies to:** V2+ deterministic operation only  
**Created:** 2025-12-29

---

## Purpose

This document defines the complete contract from user intent through job creation to failure reporting in Proxx V2+. It eliminates ambiguity between UX, JobSpec creation, and execution by specifying exact boundaries, guarantees, and failure modes.

---

## Operator Mental Model

### Core Principle

**Operators choose INTENT. The system compiles intent into EXECUTION. Execution truth is validated AFTER output exists.**

### What This Means

- The operator **never configures encoding parameters** (codec, bitrate, resolution, flags)
- The operator **never influences execution** once the job starts
- The operator **selects outcomes**, not methods
- The system **determines how to achieve** those outcomes

### What Operators See

- Named `UserProxyProfile` intentions ("HD Editorial LT", "Archive ProRes")
- Job creation success or explicit failure
- Output files and verification results

### What Operators Never See

- Canonical proxy profile identifiers
- FFmpeg command lines
- Engine selection logic
- Compilation rules

**If an operator asks "what codec does this use?", the answer is: "See the output or documentation."**

---

## Selection → JobSpec Creation Flow

### Sequence

```
┌─────────────┐
│  Operator   │
└──────┬──────┘
       │
       │ 1) Views list of ACTIVE UserProxyProfiles
       ▼
┌─────────────────┐
│  UI Layer       │
└──────┬──────────┘
       │
       │ 2) Operator selects ONE profile
       ▼
┌──────────────────────┐
│  Profile Compiler    │
└──────┬───────────────┘
       │
       │ 3) Compiles UserProxyProfile → canonical proxy profile
       │
       ├─── SUCCESS ───┐
       │               │
       │               ▼
       │         ┌────────────────┐
       │         │  JobSpec       │
       │         │  Created       │
       │         │  (IMMUTABLE)   │
       │         └────────────────┘
       │
       └─── FAILURE ───┐
                       │
                       ▼
               ┌──────────────────┐
               │  No JobSpec      │
               │  Explicit Error  │
               │  Surfaced to UI  │
               └──────────────────┘
```

### Step-by-Step

1. **UI lists ACTIVE UserProxyProfiles**
   - Deprecated profiles are excluded or visually marked as unusable
   - Profiles are displayed with name, description, and lifecycle state

2. **Operator selects ONE profile**
   - Single selection only
   - No configuration panel
   - No override fields

3. **System compiles profile → canonical proxy profile**
   - Compilation happens at job creation time
   - Uses current canonical proxy profile registry state
   - Deterministic: same UserProxyProfile always yields same canonical profile (for a given registry state)

4. **If compilation succeeds:**
   - JobSpec is created with:
     - Resolved canonical proxy profile identifier
     - Origin metadata (which UserProxyProfile was selected, timestamp)
     - Source file paths
     - Output paths
   - JobSpec is **IMMUTABLE** after creation
   - Job enters execution queue

5. **If compilation fails:**
   - **NO JobSpec is created**
   - Failure is surfaced immediately to operator
   - Error message is explicit and actionable
   - No retries, no fallbacks, no silent substitution

---

## Failure Classes

Failures are separated into three distinct classes with different ownership and handling.

### A) Pre-Job Failures

**Definition:** Failures that occur **before** JobSpec creation.

**Causes:**
- Invalid UserProxyProfile identifier
- Deprecated or inactive profile selected
- Compilation ambiguity (multiple canonical profiles match)
- Unsatisfiable constraints (profile requires engine not available)
- Missing profile metadata

**Result:**
- **No JobSpec is created**
- **No execution occurs**
- Explicit error message returned to UI
- Operator must take corrective action (select different profile, contact admin)

**Ownership:** Profile compilation layer

**Examples:**
- `"Profile 'Legacy_ProRes_422' is deprecated and cannot be used for new jobs."`
- `"UserProxyProfile 'HD_Editorial_LT' no longer compiles: max_resolution constraint incompatible with canonical registry."`
- `"Profile 'CustomProfile_XYZ' does not exist."`

---

### B) Job Validation Failures

**Definition:** Failures that occur **after** JobSpec creation but **before** execution.

**Causes:**
- Source file does not exist
- Source file unreadable (permissions, corruption)
- Output path invalid or unwritable
- Output file naming collision detected
- Insufficient disk space for expected output
- Engine unavailable (FFmpeg/Resolve not installed)

**Result:**
- **JobSpec exists** (was successfully created)
- Job state set to `FAILED` immediately
- **No execution attempt occurs**
- Result JSON written with validation failure details
- Operator sees failed job in job list

**Ownership:** Job validation layer (pre-execution checks)

**Examples:**
- `"Source file '/path/to/source.mov' does not exist."`
- `"Output path '/output/proxy.mov' already exists."`
- `"FFmpeg engine not available on this system."`

---

### C) Execution Failures

**Definition:** Failures that occur **during** execution (FFmpeg/Resolve processing).

**Causes:**
- FFmpeg/Resolve errors (unsupported codec in source, corrupt frames)
- Output verification failure (file size zero, no video stream detected)
- Process timeout
- System resource exhaustion

**Result:**
- **JobSpec exists**
- Job state set to `FAILED` after execution attempt
- Partial output files **may exist** (preserved for debugging)
- Result JSON written with execution error details
- stdout/stderr logs captured

**Ownership:** Execution engine layer

**Examples:**
- `"FFmpeg exited with code 1: Invalid data found when processing input"`
- `"Output file generated but failed verification: no video streams detected"`
- `"Resolve render job timed out after 3600 seconds"`

---

## Guarantees to the Operator

### Always True

The following guarantees **ALWAYS** hold in V2+:

1. **No job runs without a valid JobSpec**
   - Every execution has an immutable specification
   - JobSpec contains complete audit trail

2. **No job is marked COMPLETED without verified output**
   - Output file existence checked
   - Video/audio stream presence verified
   - File size sanity checked

3. **No silent substitution of profiles**
   - If selected profile is invalid, job creation fails explicitly
   - No "closest match" or "fallback profile" behavior

4. **No automatic retries without operator action**
   - Failed jobs remain failed
   - Operator must explicitly retry or modify source

5. **No hidden execution changes**
   - Canonical proxy profile in JobSpec determines execution
   - No runtime overrides or dynamic adjustments

6. **Immutable JobSpecs**
   - Once created, JobSpec cannot be modified
   - Reprocessing requires new job creation

7. **Complete failure information**
   - Every failure includes reason, context, and actionable message
   - No silent errors or missing logs

### Not Guaranteed

The following are **NOT** guaranteed:

- Compilation success (UserProxyProfile may become invalid over time)
- Execution success (source files may be corrupt, engines may fail)
- Output quality matching expectations (profile determines quality, not operator preference)
- Fast execution (depends on engine, system resources, source complexity)
- Backward compatibility of UserProxyProfiles across registry changes

---

## What the UI Must Never Do

The following actions are **explicitly forbidden** for any V2+ UI implementation:

### Forbidden Actions

1. **Profile Editing**
   - UI cannot modify UserProxyProfile definitions
   - UI cannot create ad-hoc profiles inline

2. **Override Compilation Results**
   - UI cannot substitute a different canonical profile if compilation fails
   - UI cannot offer "alternative suggestions" without operator re-selection

3. **Automatic Job Retries**
   - UI cannot automatically retry failed jobs
   - UI cannot "fix" job parameters and retry

4. **JobSpec Modification**
   - UI cannot edit JobSpecs after creation
   - UI cannot inject overrides into execution

5. **Inferring "Closest Match"**
   - UI cannot select a different profile "on behalf of" the operator
   - UI cannot fallback to default profiles

6. **Hiding Failure Details**
   - UI cannot suppress error messages
   - UI cannot genericize specific failures

7. **Exposing Canonical Implementation**
   - UI cannot show canonical proxy profile IDs
   - UI cannot display codec/container details from canonical profiles

### If the UI Needs Flexibility

**If the UI requires any of the above capabilities, it is the wrong UI for V2+ deterministic operation.**

Users who need fine-grained control edit UserProxyProfile definitions outside the job creation flow. The UI is a **chooser**, not a **control panel**.

---

## Relationship to Fabric

### Fabric's Role

Fabric consumes **results**, not **UI state**. Fabric operations are downstream from job execution and independent of how jobs were created.

### Key Points

1. **Fingerprints use canonical proxy profiles only**
   - Fabric fingerprinting keys off the canonical proxy profile identifier in JobSpec
   - UserProxyProfile metadata is **informational only** for Fabric
   - Two jobs with the same canonical profile produce the same fingerprint (given identical source)

2. **Fabric does not interpret UserProxyProfiles**
   - Fabric never compiles or validates UserProxyProfiles
   - Fabric trusts JobSpec as source of truth

3. **Fabric does not participate in job creation**
   - Fabric does not influence profile selection
   - Fabric does not validate profiles before job creation

4. **Result consumption is profile-agnostic**
   - Fabric reads output files and verification results
   - Fabric does not care which UI was used to create jobs

### What Fabric Metadata Contains

- JobSpec identifier
- Canonical proxy profile identifier
- Source file fingerprints
- Output file fingerprints
- Verification results

### What Fabric Metadata Does NOT Contain

- UserProxyProfile names (except as optional informational field)
- UI state or selection history
- Operator identity (unless explicitly added by org policy)

---

## Non-Goals

This specification **explicitly does NOT support:**

1. **Advanced Settings Panels**
   - No bitrate sliders
   - No resolution overrides
   - No codec selection dropdowns

2. **Per-Job Overrides**
   - No "just this once" tweaks
   - No runtime parameter injection

3. **Dynamic Behavior**
   - No automatic profile updates based on source analysis
   - No "smart defaults"

4. **Learning Systems**
   - No recommendation engines
   - No usage-based profile ranking

5. **UI-Driven Configuration**
   - No inline profile creation
   - No wizard-based parameter selection

6. **Silent Fallbacks**
   - No automatic retry with different profiles
   - No "did you mean?" suggestions

### If Users Need Control

Users requiring fine-grained control over encoding parameters should:
- Edit `UserProxyProfile` definitions (outside job creation UI)
- Work with administrators to define new profiles
- Use external tools for custom encoding workflows

The V2+ system is intentionally **inflexible** to preserve determinism, auditability, and operational safety.

---

## Summary

V2+ job creation is a **deterministic, auditable, fail-explicit process**:

1. Operators select **intent** (UserProxyProfile)
2. System compiles intent to **execution** (canonical proxy profile)
3. JobSpec is created (immutable, auditable)
4. Failures are surfaced immediately and explicitly
5. No silent substitutions, retries, or hidden behavior

The boundary between operator choice and system execution is clear, sharp, and enforced. This separation ensures that every job can be traced, reproduced, and verified without ambiguity.
