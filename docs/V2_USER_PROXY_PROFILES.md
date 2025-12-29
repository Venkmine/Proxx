# V2 User Proxy Profiles

**Status:** Implemented  
**Version:** 1.0  
**Date:** 2025-12-29

---

## Purpose

User Proxy Profiles are a **POLICY LAYER** for expressing proxy generation constraints in human-friendly terms. They are **NOT executable**—they exist solely to be compiled into exactly one canonical proxy profile.

User Proxy Profiles:
- Express **constraints**, never encode execution instructions
- Are **versioned** and **immutable** per job
- Compile deterministically to canonical proxy profiles
- Fail loudly when constraints are ambiguous or unsatisfiable

**Canonical proxy profiles remain the only executable units in Proxx V2.**

---

## Design Invariants

1. **Never Executable**: User profiles do not contain FFmpeg flags, codec settings, or execution parameters. They contain constraints only.

2. **Versioned**: Every user profile includes a `user_profile_version` field. Breaking changes to the schema increment the major version.

3. **Immutable Per Job**: Once a user profile is compiled for a job, it cannot be changed. The compiled canonical profile is stored in job metadata.

4. **Compile-Only**: User profiles exist only during compilation. After compilation, only the canonical profile ID is used.

5. **Deterministic**: Same user profile + same canonical profiles → same result, always.

6. **No Defaults, No Heuristics**: If compilation is ambiguous or impossible, the compiler **MUST** fail with a clear error. No fallbacks, no "best guesses."

---

## Schema (v1.0)

A valid User Proxy Profile is a JSON object with the following structure:

```json
{
  "user_profile_version": "1.0",
  "name": "Editorial ProRes Proxy",
  "constraints": {
    "intra_frame_only": true,
    "allow_long_gop": false,
    "max_resolution": "same",
    "preferred_codecs": ["prores", "dnxhr"],
    "engine_preference": ["ffmpeg", "resolve"]
  },
  "notes": "Optional human-readable description"
}
```

### Required Fields

- **`user_profile_version`** (string, required)  
  Schema version. Currently only `"1.0"` is valid.

- **`name`** (string, required)  
  Human-readable profile name. Must be non-empty.

- **`constraints`** (object, required)  
  Constraint specification (see below).

### Optional Fields

- **`notes`** (string, optional)  
  Human-readable description. Ignored during compilation.

### Unknown Fields

**Any field not listed in this schema is INVALID** and will cause validation to fail.

---

## Constraints (Explicit Allowlist)

The `constraints` object supports the following fields. All are **optional** within the constraints object:

### `intra_frame_only` (boolean)

If `true`, only profiles using intra-frame codecs (ProRes, DNxHR) are allowed.  
If `false` or omitted, no restriction.

**Example:**
```json
"intra_frame_only": true
```

### `allow_long_gop` (boolean)

If `false`, long-GOP codecs (H.264, H.265, HEVC) are excluded.  
If `true` or omitted, no restriction.

**Example:**
```json
"allow_long_gop": false
```

### `max_resolution` (string)

Maximum output resolution. Allowed values:
- `"same"` – Full source resolution
- `"1080p"` – 1920×1080 or lower
- `"2k"` – 2048×1080 or lower

Profiles with higher resolution policies are excluded.

**Example:**
```json
"max_resolution": "1080p"
```

### `preferred_codecs` (array of strings)

List of acceptable codec families, in preference order.

Allowed values:
- `"prores"`
- `"dnxhr"`
- `"h264"`
- `"hevc"`

Profiles whose codec is not in this list are excluded. Order matters if multiple profiles match.

**Example:**
```json
"preferred_codecs": ["prores", "dnxhr"]
```

### `engine_preference` (array of strings)

Engine preference order.

Allowed values:
- `"ffmpeg"`
- `"resolve"`

If multiple profiles match after constraint filtering, this order is used to select one. First match wins.

**Example:**
```json
"engine_preference": ["ffmpeg", "resolve"]
```

---

## Compilation Rules

The compiler evaluates a user profile as follows:

1. **Validate Schema**  
   User profile must conform to the v1.0 schema (no unknown fields, correct types, valid version).

2. **Filter Canonical Profiles**  
   For each constraint:
   - If constraint is present, exclude profiles that violate it.
   - If constraint is absent, no filtering for that constraint.

3. **Check Match Count**
   - **Exactly 1 match** → Compilation succeeds. Return canonical profile ID.
   - **0 matches** → Compilation fails. Raise `CompilationError` with message: "No matching canonical profile for user profile constraints."
   - **>1 matches** → Compilation fails. Raise `CompilationError` with message: "Ambiguous match: multiple canonical profiles satisfy constraints. Matched profiles: [list]."

4. **Determinism Guarantee**  
   Same input always produces same output. No randomness, no timestamps, no external state.

---

## Compilation Output

When compilation succeeds, the result is:

1. **Canonical Profile ID** (string)  
   The unique identifier of the matched canonical proxy profile (e.g., `"proxy_prores_proxy"`).

2. **Origin Metadata** (object, for tracking)  
   A metadata structure recording the user profile that was compiled:

   ```json
   {
     "proxy_profile": "proxy_prores_proxy",
     "proxy_profile_origin": {
       "type": "user_profile",
       "name": "Editorial ProRes Proxy",
       "version": "1.0"
     }
   }
   ```

This metadata is **INFORMATIONAL ONLY**. The execution engine uses only `proxy_profile`. The origin metadata is stored in job metadata for auditing and debugging.

---

## Error Handling

### Validation Errors

Raised during schema validation:
- Invalid `user_profile_version`
- Missing required fields
- Unknown fields in schema
- Invalid constraint values (e.g., unknown codec name)

**Example:**
```
ValidationError: Unknown constraint field 'max_bitrate'. Valid fields: intra_frame_only, allow_long_gop, max_resolution, preferred_codecs, engine_preference.
```

### Compilation Errors

Raised during profile compilation:

#### Zero Matches
```
CompilationError: No matching canonical profile for user profile constraints.
User profile: "Editorial ProRes Proxy"
Constraints:
  - intra_frame_only: true
  - max_resolution: 720p
No canonical profiles satisfy these constraints.
```

#### Ambiguous Matches
```
CompilationError: Ambiguous match: multiple canonical profiles satisfy constraints.
User profile: "Editorial ProRes Proxy"
Matched profiles: proxy_prores_proxy, proxy_prores_lt
Add more constraints to resolve to exactly one profile.
```

---

## Examples

### Example 1: Intra-Frame Only, Full Resolution

```json
{
  "user_profile_version": "1.0",
  "name": "Editorial ProRes Proxy",
  "constraints": {
    "intra_frame_only": true,
    "max_resolution": "same",
    "preferred_codecs": ["prores", "dnxhr"],
    "engine_preference": ["ffmpeg"]
  }
}
```

**Compilation:**  
Matches `proxy_prores_proxy` (FFmpeg, ProRes Proxy, full resolution).

---

### Example 2: Long-GOP Disallowed

```json
{
  "user_profile_version": "1.0",
  "name": "No H.264",
  "constraints": {
    "allow_long_gop": false,
    "preferred_codecs": ["prores"]
  }
}
```

**Compilation:**  
Matches `proxy_prores_proxy` or `proxy_prores_lt` (ambiguous unless `engine_preference` or additional constraints provided).

---

### Example 3: Resolve-Only RAW Workflow

```json
{
  "user_profile_version": "1.0",
  "name": "RAW ProRes LT",
  "constraints": {
    "preferred_codecs": ["prores"],
    "engine_preference": ["resolve"]
  }
}
```

**Compilation:**  
Matches `proxy_prores_lt_resolve` (Resolve, ProRes LT).

---

## Non-Goals (Explicitly NOT Supported)

The following features are **EXPLICITLY EXCLUDED** from this design:

1. **Execution Parameters**: User profiles cannot specify FFmpeg flags, bitrates, frame rates, or other execution settings.

2. **Profile Inheritance or Chaining**: No "base profile + overrides" system. Each user profile is standalone.

3. **Defaults or Fallbacks**: If compilation fails, it fails. No automatic selection of "closest match."

4. **Runtime Overrides**: User profiles are immutable once compiled. No mid-job profile changes.

5. **UI or Interactive Selection**: This is a pure compiler. UI layer is out of scope.

6. **Scoring or Ranking**: Constraint evaluation is binary (pass/fail). No "best fit" scoring.

---

## Integration with V2 Phase 1

User Proxy Profiles are **additive only**. They do not modify existing V2 behavior:

- **JobSpec schema unchanged**: The `proxy_profile` field still references canonical profile IDs.
- **Execution engines unchanged**: FFmpeg and Resolve engines remain unaware of user profiles.
- **Canonical profiles unchanged**: All existing profiles remain valid and operational.

User profiles exist as a **pre-JobSpec compilation step**. Once a user profile is compiled to a canonical profile ID, the rest of the system operates exactly as before.

---

## Implementation Notes

### Module: `backend/user_proxy_profiles.py`

- `UserProxyProfile` dataclass: Schema definition and validation.
- `CompilationError` exception: Raised on compilation failure.
- `compile_user_proxy_profile()`: Main compiler function.

### Testing: `qa/test_user_proxy_profile_compiler.py`

Exhaustive test coverage including:
- Valid profiles → successful compilation
- Ambiguous constraints → error with diagnostic
- Unsatisfiable constraints → error
- Invalid schema → validation error
- Determinism tests (same input → same output)

---

## Future Considerations (Out of Scope for v1.0)

- **Profile Templates**: Pre-defined user profiles for common workflows.
- **Multi-Profile Jobs**: Jobs that generate multiple proxy resolutions simultaneously.
- **Custom Codec Constraints**: User-defined codec validation rules.

These are **NOT** part of the v1.0 design and require separate specification.

---

## Changelog

**v1.0 (2025-12-29)** – Initial release.

---

## References

- [V2 Canonical Proxy Profiles](../backend/v2/proxy_profiles.py)
- [JobSpec Specification](./V2_JOB_SPEC.md)
- [V2 Phase 1 Architecture](./ARCHITECTURE.md)
