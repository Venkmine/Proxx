# Job Creation

This document explains Forge's job creation flow, preflight validation, and the design principles that prevent bad jobs from being submitted.

## Design Principles

Forge's job creation is built on these non-negotiable principles:

1. **Users must know EXACTLY what will happen before submit**
2. **All failures must surface BEFORE job creation**
3. **No hidden defaults**
4. **No optimistic submission**
5. **If something cannot run, the submit button must not exist**

## Job Creation Flow

The job creation screen is organized in strict vertical order:

### 1. SOURCE

The source section displays:

- **Input path(s)**: Absolute paths to source files
- **File discovery summary**:
  - Total files
  - RAW count
  - Non-RAW count
  - Image sequence count
- **Mixed source warning**: If the job contains both RAW and non-RAW files, a warning is displayed immediately

### 2. OUTPUT

The output section displays:

- **Output path**: Absolute path to the output directory
- **Storage warnings**: Network or removable storage warnings (when detectable)

### 3. PROCESSING (collapsed by default)

The processing section contains:

- **Proxy profile**: Dropdown selection of available proxy profiles
- **Burn-in recipe**: Dropdown selection (or None)
- **LUT**: Dropdown selection (or None)
- **Engine summary** (read-only): "This job will run using: Resolve Studio / FFmpeg"

### 4. PREFLIGHT SUMMARY (mandatory, always visible)

This section aggregates ALL validation checks. It is always visible and cannot be collapsed or hidden.

Each check has exactly one of three states:

| Status | Icon | Meaning |
|--------|------|---------|
| Pass | ✔ | Check passed, job can proceed |
| Warning | ⚠ | Non-blocking issue, user should be aware |
| Fail | ❌ | Blocking issue, job CANNOT be submitted |

## Preflight Checks

The following checks are performed:

### Source Validation
- At least one source file is required
- All paths must be absolute (not relative)
- Mixed RAW + non-RAW sources trigger a warning

### Output Validation
- Output directory is required
- Path must be absolute

### Engine Validation
- Execution engine must be selected
- Selected engine must be available

### Burn-in Validation
- If specified, burn-in recipe must exist

### Workspace Mode Validation
- Jobs cannot be created in Design mode

### V2 Execution Validation
- Jobs cannot be created while V2 execution is in progress

## Submit Rules

### If ANY ❌ failure exists:
- Submit button is **HIDDEN**
- Replaced with text: "Fix issues above to continue"
- Number of blocking issues is displayed

### If only ⚠ warnings exist:
- Submit button is **SHOWN** (with warning styling)
- Warnings remain visible
- Button text changes to "⚠ Create Job (with warnings)"

### On submit:
1. An immutable job summary is displayed
2. User must explicitly click "Create Job" to confirm
3. No automatic submission

## Error Handling

- **No modal popups for validation**: All errors are inline and persistent
- **Messages are factual, not advisory**: Errors state what is wrong, not what to do
- **Errors persist until resolved**: Clearing a field does not hide its error

## What Forge Will NEVER Auto-Correct

Forge enforces explicit user choices. The following will never happen automatically:

### Path Auto-Fixing
- Forge will not expand `~` to home directory
- Forge will not convert relative paths to absolute
- Forge will not auto-detect "what you probably meant"

### Silent Fallback Engines
- If Resolve is requested but unavailable, the job will fail
- Forge will not silently fall back to FFmpeg
- Engine selection is explicit and honored

### Partial Job Submission
- If any preflight check fails, the entire job is blocked
- Forge will not submit "what works" and skip "what doesn't"
- All or nothing

### Remembered Invalid States
- Invalid inputs are not saved to presets
- Invalid paths are not added to favorites
- Previous invalid jobs do not inform future defaults

## API Reference

### Backend Preflight Validation

The backend provides preflight validation hooks:

```python
from backend.job_creation import run_preflight_validation

report = run_preflight_validation(
    sources=["/path/to/source.mov"],
    output_directory="/path/to/output",
    engine="ffmpeg",
    burnin_recipe_id=None,
    available_engines={"ffmpeg": True, "resolve": False},
)

if report.can_submit:
    # Proceed with job creation
    pass
else:
    # Display blocking issues
    for check in report.checks:
        if check.status == "fail":
            print(f"{check.label}: {check.message}")
```

### Frontend Components

#### PreflightSummary

Displays all preflight checks with status icons:

```tsx
import { PreflightSummary } from './components/PreflightSummary'

<PreflightSummary checks={preflightChecks} loading={isLoading} />
```

#### JobSubmitButton

Conditional submit button that enforces preflight rules:

```tsx
import { JobSubmitButton } from './components/JobSubmitButton'

<JobSubmitButton
  preflightChecks={checks}
  jobSummary={summary}
  onSubmit={handleSubmit}
  loading={isSubmitting}
/>
```

## Troubleshooting

### "Fix issues above to continue" appears

This means one or more preflight checks have failed. Review the Preflight Summary section for red ❌ items and resolve each one.

### Submit button shows warning styling

This means there are non-blocking warnings. Review the orange ⚠ items and decide whether to proceed.

### Engine shows as unavailable

Ensure the required engine is installed and accessible:
- **FFmpeg**: Install via Homebrew (`brew install ffmpeg`)
- **Resolve**: Ensure DaVinci Resolve Studio is installed and licensed

### Mixed source warning

This warning appears when the job contains both RAW and non-RAW sources. This is allowed but may result in different processing paths for different files.
