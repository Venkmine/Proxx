# V2 Implementation Mapping

**Status:** Authoritative Reference  
**Purpose:** Map V2 Specifications to Responsible Code Areas  
**Date:** 2025-12-29

---

## Purpose

This document maps locked V2 specifications to responsible code modules. It exists to prevent:

- Speculative coding without spec authority
- UI-first behavior that bypasses validation
- Hidden execution logic in unexpected layers
- Policy leakage across boundaries

**This document does NOT authorize implementation. It defines WHERE implementation belongs.**

When implementation occurs, each rule listed here declares the responsible module. Code that contradicts this mapping is invalid regardless of functionality.

---

## Core Invariant

**Specs define WHAT. This document defines WHERE.**

Future implementation cannot claim ambiguity. If a spec rule exists, this document declares which module owns its implementation, validation, or enforcement.

---

## Spec → Module Mapping Table

| Spec Rule / Invariant | Source Document | Responsible Layer | Code Area | Explicitly NOT Responsible |
|----------------------|-----------------|-------------------|-----------|---------------------------|
| **Profile Compilation** | | | | |
| UserProxyProfile compiles to exactly one canonical profile | V2_USER_PROXY_PROFILES.md | Profile Compiler | backend/user_proxy_profiles.py: `compile_user_proxy_profile()` | UI, JobSpec, Execution engines |
| Compilation failures are explicit and actionable | V2_USER_PROXY_PROFILES.md | Profile Compiler | backend/user_proxy_profiles.py: `CompilationError` | UI (only displays error), Execution engines |
| Schema validation happens at profile creation | V2_USER_PROXY_PROFILES.md | UserProxyProfile | backend/user_proxy_profiles.py: `UserProxyProfile.__post_init__()` | UI, Job creation, Execution |
| Unknown constraint fields are rejected | V2_USER_PROXY_PROFILES.md | UserProxyProfile | backend/user_proxy_profiles.py: `_validate()` | UI, Compiler |
| Compilation is deterministic (same input → same output) | V2_USER_PROXY_PROFILES.md | Profile Compiler | backend/user_proxy_profiles.py: `compile_user_proxy_profile()` | All other layers |
| Profile origin metadata generation | V2_USER_PROXY_PROFILES.md | Metadata Generator | qa/test_user_proxy_profile_compiler.py: `generate_profile_origin_metadata()` | JobSpec, Execution engines |
| **JobSpec Creation & Immutability** | | | | |
| UI selects intent only; execution immutable once JobSpec exists | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Job Creation Boundary | future/ui/job_creation.ts, backend/job_spec.py | Execution engines, Proxy profiles, Watch folder runner |
| JobSpec is immutable after creation | V2_JOB_SPEC.md | JobSpec | backend/job_spec.py: `JobSpec` (frozen dataclass) | All other layers |
| JobSpec contains canonical proxy profile ID, never UserProxyProfile | V2_JOB_SPEC.md, V2_USER_PROXY_PROFILES.md | JobSpec | backend/job_spec.py: `proxy_profile` field | UI, Execution engines |
| proxy_profile field is REQUIRED for V2 jobs | V2_JOB_SPEC.md, V2_PROXY_PROFILES.md | JobSpec Validation | backend/job_spec.py: `validate_proxy_profile()` | UI, Profile compiler |
| Proxy profile engine must match job engine routing | V2_PROXY_PROFILES.md | JobSpec Validation | backend/job_spec.py: `validate_proxy_profile()` | UI, Profile compiler, Execution engines |
| JobSpec serialization/deserialization | V2_JOB_SPEC.md | JobSpec | backend/job_spec.py: `to_json()`, `from_json()`, `to_dict()`, `from_dict()` | All other layers |
| Multi-source semantics: ordered, sequential, deterministic | V2_JOB_SPEC.md, V2_MULTI_CLIP_SEMANTICS.md | JobSpec | backend/job_spec.py: `sources` field | UI, Execution engines |
| Naming token resolution per-source | V2_JOB_SPEC.md | JobSpec Validation | backend/job_spec.py: `validate_naming_tokens_resolvable()`, `validate_multi_clip_naming()` | Execution engines |
| Source format validation (RAW vs non-RAW routing) | V2_JOB_SPEC.md | JobSpec Validation | backend/job_spec.py: `validate_source_capabilities()`, backend/v2/source_capabilities.py | UI, Profile compiler |
| **Canonical Proxy Profiles** | | | | |
| Proxy profiles are immutable, frozen dataclasses | V2_PROXY_PROFILES.md | ProxyProfile | backend/v2/proxy_profiles.py: `ProxyProfile` | All other layers |
| Proxy profiles explicitly declare engine (ffmpeg or resolve) | V2_PROXY_PROFILES.md | ProxyProfile | backend/v2/proxy_profiles.py: `ProxyProfile.engine` | UI, Job creation |
| Profile registry is read-only via MappingProxyType | V2_PROXY_PROFILES.md | Profile Registry | backend/v2/proxy_profiles.py: `PROXY_PROFILES` | All other layers |
| Profile validation for engine compatibility | V2_PROXY_PROFILES.md | Profile Validator | backend/v2/proxy_profiles.py: `validate_profile_for_engine()` | UI, Job creation (calls validation only) |
| Unknown proxy_profile identifiers are rejected | V2_PROXY_PROFILES.md | Profile Validator | backend/v2/proxy_profiles.py: `get_profile()`, `ProxyProfileError` | UI, Job creation (propagates error only) |
| **Watch Folder Runner** | | | | |
| JobSpec validation before execution | V2_WATCH_FOLDER.md | Watch Folder Runner | backend/watch_folder_runner.py: validation stage | UI, Profile compiler |
| JobSpecs without proxy_profile moved to failed/ | V2_WATCH_FOLDER.md, V2_PROXY_PROFILES.md | Watch Folder Runner | backend/watch_folder_runner.py | Profile compiler, Execution engines |
| Engine mismatch moves JobSpec to failed/ with error | V2_WATCH_FOLDER.md, V2_PROXY_PROFILES.md | Watch Folder Runner | backend/watch_folder_runner.py | Profile compiler, Execution engines |
| Idempotency via SHA256 manifest | V2_WATCH_FOLDER.md | Watch Folder Runner | backend/watch_folder_runner.py | JobSpec, Execution engines |
| Sequential processing (no concurrency in V2 Phase 1) | V2_WATCH_FOLDER.md | Watch Folder Runner | backend/watch_folder_runner.py | Execution engines |
| Result file creation (*.result.json) | V2_WATCH_FOLDER.md | Watch Folder Runner | backend/watch_folder_runner.py | Execution engines (provide results only) |
| **Execution Engines** | | | | |
| Execution reads JobSpec only, never modifies it | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Execution Engines | backend/app/resolve_*.py, future/ffmpeg_executor.py | JobSpec, Profile compiler, UI |
| Execution uses canonical proxy profile from JobSpec | V2_PROXY_PROFILES.md | Execution Engines | backend/app/resolve_*.py, future/ffmpeg_executor.py | Profile compiler, UI |
| Execution never interprets UserProxyProfile | V2_USER_PROXY_PROFILES.md | Execution Engines | backend/app/resolve_*.py, future/ffmpeg_executor.py | Profile compiler, UI |
| Execution produces outputs and verification results | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Execution Engines | backend/app/resolve_*.py, future/ffmpeg_executor.py | JobSpec, Watch folder runner |
| No runtime profile compilation or selection | V2_USER_PROXY_PROFILES.md | Execution Engines | backend/app/resolve_*.py, future/ffmpeg_executor.py | Profile compiler, UI |
| **Failure Ownership** | | | | |
| Pre-job failures: no JobSpec created | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Profile Compilation | backend/user_proxy_profiles.py: `CompilationError` | UI (displays only), Execution |
| Validation failures: JobSpec malformed | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | JobSpec Validation | backend/job_spec.py: `validate()` | Profile compiler, Execution |
| Execution failures: output verification failed | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Execution Engines | backend/app/resolve_*.py: verification stage | JobSpec, Profile compiler |
| Pre-job failures NOT persisted as jobs | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | UI / Job Creation Boundary | future/ui/job_creation.ts | Watch folder, Execution |
| Validation failures moved to failed/ with error | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Watch Folder Runner | backend/watch_folder_runner.py | JobSpec, Profile compiler |
| Execution failures produce result.json with FAILED status | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Watch Folder Runner | backend/watch_folder_runner.py | Execution engines (report failure only) |
| **UX Responsibilities** | | | | |
| UI lists ACTIVE UserProxyProfiles only | V2_PROFILE_SELECTION_AND_JOB_CREATION.md, V2_USER_PROXY_PROFILE_LIFECYCLE.md | UI | future/ui/profile_selector.ts | Profile compiler, JobSpec, Execution |
| UI permits single profile selection only | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | UI | future/ui/profile_selector.ts | Profile compiler, JobSpec |
| UI displays compilation errors explicitly | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | UI | future/ui/error_display.ts | Profile compiler (provides error only) |
| UI never configures codec, bitrate, resolution, flags | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | UI | future/ui/*.ts | All backend layers |
| UI never modifies JobSpec after creation | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | UI | future/ui/*.ts | JobSpec, Execution |
| UI never interprets canonical proxy profile IDs | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | UI | future/ui/*.ts | Profile compiler, JobSpec |
| **Fabric Integration Boundary** | | | | |
| Fabric fingerprints use canonical proxy profile ID only | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Fabric (external) | N/A (Fabric consumes JobSpec metadata) | UI, Profile compiler, Execution |
| Fabric ignores UserProxyProfile metadata | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Fabric (external) | N/A | UI, Profile compiler |
| Fabric consumes results, not UI state | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Fabric (external) | N/A | UI, Profile compiler |
| Fabric does not participate in job creation | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Fabric (external) | N/A | UI, Profile compiler, JobSpec |
| Fabric does not validate profiles before job creation | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Fabric (external) | N/A | Profile compiler, JobSpec |
| **Profile Lifecycle** | | | | |
| ACTIVE profiles selectable for new jobs | V2_USER_PROXY_PROFILE_LIFECYCLE.md | Profile Selector | future/ui/profile_selector.ts | Profile compiler, JobSpec |
| DEPRECATED profiles NOT selectable | V2_USER_PROXY_PROFILE_LIFECYCLE.md | Profile Selector | future/ui/profile_selector.ts | Profile compiler, JobSpec |
| INVALID profiles fail with clear error | V2_USER_PROXY_PROFILE_LIFECYCLE.md | Profile Compiler | backend/user_proxy_profiles.py: `CompilationError` | UI (displays only) |
| GRADUATED profiles resolve to canonical alias | V2_USER_PROXY_PROFILE_LIFECYCLE.md | Profile Compiler | backend/user_proxy_profiles.py: `compile_user_proxy_profile()` | UI, JobSpec |
| Profile semantic meaning never mutates in place | V2_USER_PROXY_PROFILE_LIFECYCLE.md | Profile Registry | backend/user_proxy_profiles.py, backend/v2/proxy_profiles.py | All other layers |
| Jobs record canonical ID and user profile origin | V2_USER_PROXY_PROFILE_LIFECYCLE.md | JobSpec | backend/job_spec.py: `proxy_profile`, metadata fields | Execution, UI |
| Execution independent of lifecycle state | V2_USER_PROXY_PROFILE_LIFECYCLE.md | Execution Engines | backend/app/resolve_*.py | Profile compiler, UI |

---

## Required Mappings

### A) UserProxyProfile Compilation

#### Where Compilation Happens

- **Module:** `backend/user_proxy_profiles.py`
- **Function:** `compile_user_proxy_profile(user_profile: UserProxyProfile, available_profiles: Dict[str, ProxyProfile]) -> str`
- **Contract:** Returns exactly one canonical proxy profile ID or raises `CompilationError`

#### Where Compilation Must NOT Happen

- UI layer (UI only calls compiler and displays results)
- JobSpec module (JobSpec stores compiled result, never compiles)
- Execution engines (engines read JobSpec, never compile)
- Watch folder runner (validates JobSpec, never compiles)

#### How Errors Propagate

- `CompilationError` raised by compiler
- Caught by job creation boundary (UI or programmatic API)
- Surfaced to operator as explicit, actionable message
- **No JobSpec created** on compilation failure

#### Where Metadata Is Attached

- **Function:** `generate_profile_origin_metadata(user_profile: UserProxyProfile, canonical_id: str) -> Dict[str, Any]`
- **Location:** `qa/test_user_proxy_profile_compiler.py` (to be moved to production module)
- **Contract:** Returns metadata dict with:
  - `proxy_profile`: canonical profile ID (authoritative)
  - `proxy_profile_origin`: UserProxyProfile name, version, timestamp (informational)

---

### B) JobSpec Creation & Immutability

#### Where JobSpec Is Created

- **Module:** `backend/job_spec.py`
- **Class:** `JobSpec` (dataclass)
- **Entry points:**
  - Direct instantiation: `JobSpec(sources=[...], proxy_profile="...", ...)`
  - Deserialization: `JobSpec.from_json(json_str)`, `JobSpec.from_dict(dict_data)`
  - Future UI layer: `future/ui/job_creation.ts` (calls backend API)

#### Where Validation Happens

- **Module:** `backend/job_spec.py`
- **Methods:**
  - `validate()`: Entry point, calls all validation methods
  - `validate_proxy_profile(routes_to_resolve: bool)`: Proxy profile validation
  - `validate_codec_container()`: Codec/container compatibility
  - `validate_naming_tokens_resolvable()`: Naming token syntax
  - `validate_multi_clip_naming()`: Multi-clip naming requirements
  - `validate_source_capabilities()`: RAW vs non-RAW routing
  - `validate_paths_exist()`: File existence checks
  - Other validation methods per spec

#### Where Mutation Is Forbidden

- **All layers** after `JobSpec.__init__()` completes
- JobSpec is immutable via frozen dataclass semantics (to be enforced)
- Execution engines read only, never modify
- Watch folder runner reads only, never modifies
- UI displays job state, never mutates JobSpec

#### What Layers May Only READ

- **Execution engines:** Read `proxy_profile`, `sources`, all job parameters
- **Watch folder runner:** Read for validation, routing, result generation
- **UI:** Read for display, progress tracking, result presentation
- **Fabric (external):** Read canonical proxy profile ID, source fingerprints, output fingerprints

---

### C) Failure Ownership

#### Pre-Job Failures

| Aspect | Owner | Location | Result |
|--------|-------|----------|--------|
| Detection | Profile Compiler | backend/user_proxy_profiles.py: `compile_user_proxy_profile()` | Raises `CompilationError` |
| Reporting | Job Creation Boundary | future/ui/job_creation.ts | Displays error to operator |
| Persistence | None | N/A | **No JobSpec created, no job persisted** |
| UI Visibility | Full | future/ui/error_display.ts | Explicit error message with actionable guidance |

**Causes:**
- Invalid UserProxyProfile identifier
- Deprecated or inactive profile selected
- Compilation ambiguity (multiple canonical profiles match)
- Unsatisfiable constraints (profile requires unavailable engine)
- Missing profile metadata
- Schema validation failure (unknown fields, invalid types)

---

#### Validation Failures

| Aspect | Owner | Location | Result |
|--------|-------|----------|--------|
| Detection | JobSpec Validation | backend/job_spec.py: `validate()` methods | Raises `JobSpecValidationError` |
| Reporting | Watch Folder Runner | backend/watch_folder_runner.py | Moves JobSpec to `failed/` with error message |
| Persistence | Yes (as failed) | `<watch_folder>/failed/<jobspec>.json` | JobSpec preserved with failure reason |
| UI Visibility | Yes (if UI-created) | future/ui/job_status.ts | Validation error displayed before submission |

**Causes:**
- Missing required fields (proxy_profile, sources, output_directory)
- Unknown proxy_profile identifier
- Proxy profile engine mismatch with job routing
- Invalid codec/container combination
- Invalid naming template syntax
- Source format unsupported
- Source file does not exist (if path checking enabled)
- Multi-clip naming requirements not met

---

#### Execution Failures

| Aspect | Owner | Location | Result |
|--------|-------|----------|--------|
| Detection | Execution Engine | backend/app/resolve_*.py, future/ffmpeg_executor.py | Returns failure status |
| Reporting | Watch Folder Runner | backend/watch_folder_runner.py | Creates `*.result.json` with `status: "FAILED"` |
| Persistence | Yes | `<jobspec_name>.result.json` | Result file with failure details |
| UI Visibility | Yes | future/ui/job_results.ts | Result displayed with failure reason |

**Causes:**
- Source file inaccessible during execution
- Output directory inaccessible or out of space
- Execution engine crash or timeout
- Output verification failed (file missing, corrupt, wrong format)
- Engine-specific errors (Resolve script failure, FFmpeg error)

---

### D) UX Responsibilities

#### What UI MAY Do

| Action | Spec Source | Implementation Location |
|--------|-------------|------------------------|
| List ACTIVE UserProxyProfiles | V2_PROFILE_SELECTION_AND_JOB_CREATION.md, V2_USER_PROXY_PROFILE_LIFECYCLE.md | future/ui/profile_selector.ts |
| Display profile name and description | V2_USER_PROXY_PROFILES.md | future/ui/profile_selector.ts |
| Permit single profile selection | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | future/ui/profile_selector.ts |
| Gather source file paths | V2_JOB_SPEC.md | future/ui/source_picker.ts |
| Gather output directory path | V2_JOB_SPEC.md | future/ui/output_picker.ts |
| Invoke profile compilation | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | future/ui/job_creation.ts → backend API |
| Display compilation errors | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | future/ui/error_display.ts |
| Submit JobSpec for execution | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | future/ui/job_creation.ts → watch folder or API |
| Display job status and results | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | future/ui/job_status.ts |
| Display DEPRECATED profiles as unusable | V2_USER_PROXY_PROFILE_LIFECYCLE.md | future/ui/profile_selector.ts |

---

#### What UI MUST Do

| Action | Spec Source | Implementation Location |
|--------|-------------|------------------------|
| Filter out DEPRECATED profiles from selection | V2_USER_PROXY_PROFILE_LIFECYCLE.md | future/ui/profile_selector.ts |
| Filter out INVALID profiles from selection | V2_USER_PROXY_PROFILE_LIFECYCLE.md | future/ui/profile_selector.ts |
| Display compilation errors before job creation | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | future/ui/error_display.ts |
| Prevent job submission when compilation fails | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | future/ui/job_creation.ts |
| Preserve operator-provided source order | V2_MULTI_CLIP_SEMANTICS.md | future/ui/source_picker.ts |
| Call JobSpec validation before submission | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | future/ui/job_creation.ts |

---

#### What UI MUST NEVER Do

| Prohibited Action | Spec Source | Reason |
|-------------------|-------------|--------|
| Configure codec, bitrate, resolution, or encoding flags | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Operator selects intent, not execution parameters |
| Modify JobSpec after creation | V2_JOB_SPEC.md | JobSpec is immutable |
| Interpret canonical proxy profile IDs | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Canonical IDs are opaque to UI |
| Perform profile compilation directly | V2_USER_PROXY_PROFILES.md | Compilation happens in backend only |
| Provide default or fallback profiles | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Explicit selection required, no defaults |
| Re-order sources without operator action | V2_MULTI_CLIP_SEMANTICS.md | Source order is operator-provided, immutable |
| Retry failed jobs without operator action | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | No silent retries |
| Modify execution based on UI state | V2_PROFILE_SELECTION_AND_JOB_CREATION.md | Execution reads JobSpec only |

---

### E) Fabric Integration Boundary

#### What Fabric Reads

| Data | Source | Purpose |
|------|--------|---------|
| Canonical proxy profile ID | JobSpec: `proxy_profile` field | Fingerprinting key |
| Source file fingerprints | Output metadata | Identity verification |
| Output file fingerprints | Output metadata | Identity verification |
| Verification results | `*.result.json` | Success/failure determination |
| Source file metadata | MediaInfo probe results | Format, codec, resolution |

---

#### What Fabric Ignores

| Data | Reason |
|------|--------|
| UserProxyProfile name | Informational only, not used for fingerprinting |
| UserProxyProfile constraints | Policy layer, not execution specification |
| UserProxyProfile version | User-facing metadata, not canonical |
| UI state | Fabric is downstream from execution |
| Job creation method | Fabric reads results, not inputs |

---

#### What Fabric Must Never Infer

| Prohibited Inference | Reason |
|---------------------|--------|
| Execution parameters from UserProxyProfile | UserProxyProfile is not executable |
| Job semantics from UI layout | UI is not source of truth |
| Profile compatibility from name patterns | Compatibility validated by JobSpec only |
| Source routing from filename heuristics | Routing determined by source capabilities validation |
| Codec settings from operator preferences | Codec settings come from canonical profile only |

---

## Forbidden Implementation Patterns

The following patterns MUST NOT appear in code. Their presence indicates implementation violation:

### UI-Derived Execution Logic

**Prohibited:**
- Execution engine reading UI preferences to select codec
- Execution engine checking "user selected high quality" flag
- Watch folder runner inferring behavior from profile name patterns

**Why Invalid:** Execution reads JobSpec only. UI state is never source of truth.

---

### "Helper" Defaults

**Prohibited:**
- Profile compiler selecting "reasonable default" when constraints ambiguous
- JobSpec validation silently substituting valid profile when invalid profile provided
- Execution engine falling back to H.264 when ProRes unavailable

**Why Invalid:** Ambiguity is hard error. No fallbacks, no heuristics, no silent substitution.

---

### Silent Retries

**Prohibited:**
- Watch folder runner retrying failed JobSpec without operator action
- Execution engine retrying with different settings on failure
- UI automatically resubmitting job with different profile

**Why Invalid:** Failures are explicit. Operator must diagnose and re-submit.

---

### Implicit Fallbacks

**Prohibited:**
- Profile compiler returning "close enough" profile when exact match not found
- JobSpec validation accepting similar codec when requested codec unavailable
- Execution engine choosing different container format when requested format fails

**Why Invalid:** Determinism requires exact match or explicit failure.

---

### Heuristic Profile Selection

**Prohibited:**
- Profile compiler ranking profiles by "quality score"
- UI pre-selecting profile based on source format detection
- Execution engine "upgrading" profile based on source resolution

**Why Invalid:** Operator selects profile explicitly. No automatic selection.

---

### Execution Conditionals Based on UI State

**Prohibited:**
- Execution engine checking "UI mode" flag
- Execution engine reading "user is beginner" preference
- Execution engine changing behavior based on "batch mode" vs "interactive mode"

**Why Invalid:** Execution reads JobSpec only. UI state is irrelevant to execution.

---

### Profile Mutation During Compilation

**Prohibited:**
- Profile compiler modifying UserProxyProfile constraints to force match
- Profile compiler removing unsatisfiable constraints to find profile
- Profile compiler changing canonical profile parameters to match user constraints

**Why Invalid:** UserProxyProfile and canonical profiles are immutable. Compilation resolves or fails.

---

### Runtime Profile Compilation

**Prohibited:**
- Execution engine compiling UserProxyProfile during job execution
- Execution engine selecting profile based on source inspection
- Watch folder runner compiling profile when JobSpec missing proxy_profile

**Why Invalid:** Compilation happens at job creation time only. Execution uses pre-compiled canonical ID.

---

### Policy Leakage Into Execution

**Prohibited:**
- Execution engine interpreting UserProxyProfile constraints
- Execution engine applying "intra_frame_only" logic
- Execution engine checking "preferred_codecs" list

**Why Invalid:** Execution uses canonical profile parameters only. Policy is compiled away before execution.

---

## Change Control

### Mapping Changes Require Spec Update First

Any change to mapped responsibilities requires:

1. **Spec update** to document new rule or responsibility change
2. **Mapping update** in this document to reflect new responsibility assignment
3. **Code implementation** consistent with updated mapping

**Mapping does NOT change to accommodate code. Code changes to match mapping.**

---

### Code That Contradicts Mapping Is Invalid

If code implements functionality in a module not listed as responsible:

- Code is invalid regardless of whether it "works"
- Code must be moved to responsible module or mapping must be updated via spec change
- Test suite must not validate contradictory implementations

**Example:** If execution engine contains profile compilation logic, that code is invalid. Compilation responsibility is `backend/user_proxy_profiles.py` per this mapping.

---

### Refactors Do Not Override Mapping

Code refactoring (moving functions, renaming modules, restructuring) must:

- Preserve responsibility assignments per this mapping
- Update mapping if module paths change
- Not change which layer owns which responsibility

**Example:** Moving `compile_user_proxy_profile()` to a different module requires mapping update but does not change that profile compilation is separate from execution.

---

## Related Documentation

- [V2_JOB_SPEC.md](V2_JOB_SPEC.md) - JobSpec specification
- [V2_PROXY_PROFILES.md](V2_PROXY_PROFILES.md) - Canonical proxy profiles
- [V2_USER_PROXY_PROFILES.md](V2_USER_PROXY_PROFILES.md) - User proxy profiles
- [V2_PROFILE_SELECTION_AND_JOB_CREATION.md](V2_PROFILE_SELECTION_AND_JOB_CREATION.md) - Profile selection through job creation flow
- [V2_USER_PROXY_PROFILE_LIFECYCLE.md](V2_USER_PROXY_PROFILE_LIFECYCLE.md) - Profile lifecycle states
- [V2_WATCH_FOLDER.md](V2_WATCH_FOLDER.md) - Watch folder runner specification
- [V2_MULTI_CLIP_SEMANTICS.md](V2_MULTI_CLIP_SEMANTICS.md) - Multi-source job semantics

---

## Document Status

This document is **AUTHORITATIVE** for V2 implementation. It maps locked specs to responsible modules.

Any code that contradicts this mapping is invalid. Any spec change that affects responsibilities requires mapping update.

This document does NOT authorize implementation. It defines WHERE implementation belongs when authorized.

---

**Last Updated:** 2025-12-29  
**V2 Phase:** Phase 1 - Reliable Proxy Engine
