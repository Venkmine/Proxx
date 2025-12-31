# Golden Render Verification Suite

## What This Is

This is Forge's opt-in golden render verification suite.

It proves that Forge can produce real, attach-safe proxy outputs
end-to-end using Resolve and FFmpeg.

A golden render test:
- Uses small, committed test media
- Produces actual proxy files
- Verifies invariant properties only
- Writes persistent artifacts for inspection

## What This Is NOT

- **NOT** part of normal verification
- **NOT** fast (expect several minutes per run)
- **NOT** CI-friendly
- **NOT** automatic
- **NOT** pixel-perfect comparison
- **NOT** color accuracy validation

## When To Run This

Run this when you need to verify that Forge's proxy rendering pipeline
produces correct, attach-safe output files.

Appropriate times to run:
- Before a release
- After significant engine changes
- After FFmpeg or Resolve version updates
- When investigating reported rendering issues
- Before shipping to production

## When NOT To Run This

- During normal development iteration
- In CI/CD pipelines
- Automatically on every commit
- When you're in a hurry

## How To Run

**Step 1: Set up test media (first time only)**

```bash
python qa/media/setup_golden_media.py
```

This generates synthetic test files using FFmpeg. See `qa/media/README.md` for details.

**Step 2: Run the verification suite**

```bash
cd /path/to/Proxx
python qa/golden/run_golden_verification.py
```

You will be prompted to type exactly `RUN GOLDEN TESTS` to confirm.

## Why Failures Matter

If a golden render test fails, it means:
- Forge cannot reliably produce proxy output for that format
- Users may receive broken or incorrect files
- The proxy-source relationship may be corrupted

A failure here is a **blocking issue**. Do not ship.

## Invariants Verified

Each test verifies only objective, measurable properties:

| Invariant | What It Checks |
|-----------|----------------|
| `duration_matches` | Proxy duration equals source duration (±50ms) |
| `frame_count_matches` | Proxy frame count equals source frame count |
| `start_timecode_matches` | Proxy starts at same timecode as source |
| `audio_channel_count_matches` | Audio channel count preserved |
| `audio_sample_rate_matches` | Audio sample rate preserved |
| `container_is_mov` | Output container is QuickTime MOV |
| `proxy_codec_matches_profile` | Video codec matches requested profile |
| `burnin_present` | Text pixels exist in expected overlay regions |
| `lut_applied_detectable` | Histogram/luma differs from untreated source |

## What We Do NOT Verify

- Color accuracy
- Visual fidelity
- Subjective quality
- "Looks correct"

## Output Artifacts

Each run produces artifacts in `qa/golden/results/<timestamp>/`:

```
qa/golden/results/20251231_143022/
├── summary.md
├── ffmpeg_basic_proxy/
│   ├── proxy_output.mov
│   ├── probe.json
│   ├── expectations.json
│   └── result.txt
└── resolve_raw_proxy/
    ├── proxy_output.mov
    ├── probe.json
    ├── expectations.json
    └── result.txt
```

Artifacts persist for manual inspection. They are .gitignored.

## Test Manifest

Tests are defined in `golden_manifest.json`. Each test specifies:
- `id`: Unique test identifier
- `engine`: `ffmpeg` or `resolve`
- `source`: Path to test media
- `profile`: Proxy profile to use
- `burnin_recipe`: Burn-in template (or null)
- `lut`: LUT to apply (or null)
- `expectations`: List of invariants to verify

## Adding New Tests

1. Add test media to `qa/media/`
2. Add test definition to `golden_manifest.json`
3. Run the suite to verify

## Design Principles

- **Real media in**: No synthetic/generated test files
- **Real render out**: Actual FFmpeg/Resolve execution
- **Explicit expectations**: Every check is stated explicitly
- **Narrow invariants**: Only verify objective properties
- **Zero artistic judgement**: No subjective quality assessment
- **Zero retries**: Fail fast and stop
- **Zero auto-fix**: Failures require human intervention

## Anti-Features

The following are explicitly NOT implemented:
- Automatic invocation
- CI integration
- Pixel-perfect comparison
- Retry logic
- Soft warnings
- Silent skips
- Continue-on-error

If something fails, it fails loudly and stops.
