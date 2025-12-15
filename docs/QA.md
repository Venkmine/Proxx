# PROXX — QA / QC PRINCIPLES

## Definition of Success

A clip is successful if:
- Output file exists
- Output file is non-zero size
- Output matches requested settings
- Errors are logged if deviations occur

A job is successful if:
- All clips are attempted
- Failures are reported
- No silent skips occur

## Partial Success

Partial success is valid and expected.
Examples:
- Some clips skipped as unsupported
- Some clips fail due to corruption
- Drive disconnect mid-job

Partial success must:
- Never block remaining clips
- Be clearly reported

## Failure Modes (Non-Exhaustive)

- Drive offline
- Permission denied
- Disk full
- Corrupt media
- Resolve crash
- Unsupported codec

Failures must be:
- Detectable from logs and filesystem alone
- Re-runnable without manual cleanup