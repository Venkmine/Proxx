# Definition of Done

This document defines the quality gates for Awaire Proxy development.

## Feature Completion

No feature is "done" unless:

1. **Verify Proxy Fast passes**
   - All lint checks pass
   - All unit tests pass
   - Schema validation passes

2. **Code is reviewed**
   - Changes are self-documented or commented
   - No dead code introduced

3. **Edge cases handled**
   - Error states are visible
   - Failures are logged
   - No silent fallbacks

## Release Criteria

No release is allowed unless:

1. **Verify Proxy Full passes**
   - All Fast checks pass
   - All integration tests pass
   - All E2E tests pass (real FFmpeg)
   - ffprobe validation passes

2. **Regression suite green**
   - All known-bug regression tests pass
   - No new regressions introduced

3. **Documentation updated**
   - README reflects current state
   - CHANGELOG updated
   - Breaking changes documented

## Bug Fix Requirements

Every bug must result in:

1. **A regression test**
   - Test reproduces the bug condition
   - Test verifies the fix
   - Test added to Verify suite

2. **Root cause documented**
   - Brief note in commit message
   - Complex bugs get a comment in code

## Forbidden Patterns

The following are never acceptable:

- ❌ Silent fallbacks
- ❌ Swallowed exceptions
- ❌ Untested features
- ❌ "Works on my machine" releases
- ❌ Skipped tests without documentation
- ❌ Release without Verify Full

## Enforcement

- CI runs Verify Proxy Fast on all PRs
- CI runs Verify Proxy on main branch merges
- Releases require Verify Proxy Full (manual or nightly)
