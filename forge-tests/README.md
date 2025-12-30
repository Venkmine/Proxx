# Forge Tests - Black-Box Test Runner

This directory contains the black-box test runner for evidence-based Resolve support validation.

## Structure

```
forge-tests/
  samples/      # Test media samples (NOT committed to git)
  ingest/       # Staging area for test ingestion
  output/       # Test output files (NOT committed to git)
  reports/      # JSON test reports (evidence for support matrix)
  config/       # Test matrix configurations
  run_tests.py  # Main test runner script
```

## Usage

### Dry Run (Validate Configuration)
```bash
python forge-tests/run_tests.py --config forge-tests/config/test_matrix_free.json --dry-run
```

### Run Tests with Resolve Free
```bash
python forge-tests/run_tests.py --config forge-tests/config/test_matrix_free.json
```

### Run Tests with Resolve Studio
```bash
python forge-tests/run_tests.py --config forge-tests/config/test_matrix_studio.json
```

## Test Matrix Configuration

Each configuration file specifies:
- Sample formats to test
- Expected policy classification (allowed/warn/block)
- Timeout settings
- Output directory

## Reports

Test reports are saved to `reports/` with:
- Resolve edition and version
- Per-sample execution results
- Engine used (ffmpeg vs resolve)
- Failure reasons
- Output verification

Reports are used to generate the support matrix documentation.

## Important Notes

**DO NOT COMMIT TEST MEDIA**: Large media files must not be committed to git.
Place test samples in `samples/` - they are gitignored.

**Evidence-Based**: Support claims must be backed by test reports.
No guessing, no hand-typed support matrices.
