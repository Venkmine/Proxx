# V2 Verification Harness

CI-friendly verification system for V2 Phase 1 (Reliable Proxy Engine).

## Quick Start

```bash
# Run the full V2 verification
make verify-v2
```

Or directly:

```bash
python scripts/verify_v2.py
```

## What It Does

The `verify-v2` harness performs two phases:

### Phase 1: V2 Unit Tests

Runs `qa/test_v2_phase1_regression.py` via pytest, which validates:

- Single-clip execution produces valid output
- Multi-clip naming validation works correctly
- Fail-fast behavior on errors
- Result serialization to JSON

### Phase 2: Headless Smoke Test

Runs a real headless execution using:

- **Fixture JobSpec**: `qa/fixtures/v2/smoke_jobspec.json`
- **Fixture Media**: `qa/fixtures/media/short_h264_audio.mp4` (~56KB)

This produces actual FFmpeg output to verify the full pipeline works.

## Artifacts

Each run produces artifacts in:

```
./artifacts/v2/<timestamp>/
├── resolved_jobspec.json     # The JobSpec with resolved paths
├── execution_result.json     # Full execution result (deterministic)
├── run_summary.json          # Pass/fail summary
└── v2_smoke_*.mp4           # Actual transcoded output
```

### Artifact Cleanup

The harness automatically cleans old artifact runs, keeping only the **last 5** to prevent disk growth.

### Determinism

Artifact output is designed to be deterministic:

- JSON keys are sorted for stable diffs
- Timestamps are captured but don't affect pass/fail
- Output paths follow predictable patterns

## Exit Codes

| Code | Meaning |
|------|---------|
| 0    | All tests passed |
| 1    | One or more tests failed |

## CI Integration

This harness is designed for CI pipelines:

- No UI required (fully headless)
- Fail-fast behavior with clear exit codes
- Self-contained fixtures (no external dependencies beyond FFmpeg)
- Automatic artifact cleanup

Example CI usage:

```yaml
- name: V2 Verification
  run: make verify-v2
```

## Requirements

- Python 3.10+
- FFmpeg installed and in PATH
- pytest (`pip install pytest`)

## Fixtures

### smoke_jobspec.json

Located at `qa/fixtures/v2/smoke_jobspec.json`. Uses:

- Single source: `qa/fixtures/media/short_h264_audio.mp4`
- Codec: H.264
- Resolution: Quarter (fast)
- Container: MP4

### short_h264_audio.mp4

Pre-generated test media (~56KB) containing:

- 1 second of video
- Audio track
- H.264 encoded

## Troubleshooting

### "FFmpeg not found"

Ensure FFmpeg is installed and in your PATH:

```bash
which ffmpeg
ffmpeg -version
```

### "Fixture media not found"

The test media should exist at `qa/fixtures/media/short_h264_audio.mp4`. If missing, generate it:

```bash
ffmpeg -y -f lavfi -i "color=c=red:s=320x240:d=1" \
       -f lavfi -i "sine=frequency=440:duration=1" \
       -c:v libx264 -c:a aac -shortest \
       qa/fixtures/media/short_h264_audio.mp4
```

### Unit tests timeout

The harness has a 5-minute timeout for unit tests. If you're running on slow CI infrastructure, you may need to adjust `timeout=300` in `scripts/verify_v2.py`.

## Related Documentation

- [V2_PHASE_1_LOCKED.md](V2_PHASE_1_LOCKED.md) - Phase 1 specification
- [QUICKSTART.md](QUICKSTART.md) - General project setup
