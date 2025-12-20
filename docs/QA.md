# Awaire Proxy — QA Principles

QA is handled by the Verify system. See `qa/docs/` for detailed documentation.

## Quick Reference

```bash
# Fast checks (lint, unit tests, schema validation)
make verify-fast

# Standard verification (+ integration tests)
make verify

# Full verification (+ E2E with real FFmpeg transcodes)
make verify-full
```

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

## Failure Modes

Failures must be:
- Detectable from logs and filesystem alone
- Re-runnable without manual cleanup

## Further Documentation

- [qa/docs/definition_of_done.md](../qa/docs/definition_of_done.md) — Release requirements
- [qa/docs/test_plan_proxy.md](../qa/docs/test_plan_proxy.md) — Test coverage
- [qa/docs/regression_playbook.md](../qa/docs/regression_playbook.md) — Regression procedures
