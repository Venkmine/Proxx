# Copilot Prompts for QA

Copy-paste prompts for common QA tasks.

---

## Add Regression Test for a Bug

```
I found a bug in Awaire Proxy:

[Describe the bug here]

Please:
1. Create a regression test in the appropriate qa/proxy/ folder
2. The test should fail before the fix and pass after
3. Follow the naming convention: test_bug_<short_description>.py
4. Include a docstring with bug description and fix
5. Run `make verify-fast` to confirm the test is wired correctly
```

---

## Expand Verify Proxy Coverage

```
I want to add test coverage for:

[Describe the feature or code path]

Please:
1. Identify the appropriate test level (unit/integration/e2e)
2. Create test file in qa/proxy/<level>/
3. Add test group to qa/verify/registry.py
4. Include at least 3 test cases covering:
   - Happy path
   - Edge case
   - Error case
5. Run `make verify` to confirm tests pass
```

---

## Write E2E Fixture Generator

```
I need a test fixture that generates:

[Describe the media file requirements - codec, duration, resolution, etc.]

Please:
1. Create a fixture generator function using FFmpeg
2. Place in qa/proxy/e2e/ or qa/fixtures/
3. Include cleanup in test teardown
4. Document usage in qa/fixtures/README.md
5. Verify with `make verify-full`
```

---

## Update UI Operational Script

```
I've added a new UI feature:

[Describe the feature]

Please:
1. Add a new operational script to qa/docs/ui_operational_scripts.md
2. Include numbered steps with checkmarks
3. Document expected behavior at each step
4. Note any prerequisites
5. Include error handling verification
```

---

## Check Definition of Done Compliance

```
I'm about to mark this feature as done:

[Describe the feature]

Please verify:
1. Does `make verify-fast` pass?
2. Are there unit tests for the new code?
3. Are error states visible to the user?
4. Are failures logged?
5. Is documentation updated?
6. For release: Does `make verify-full` pass?

Report any gaps.
```

---

## Debug Failing Verify

```
`make verify-<level>` is failing with:

[Paste error output]

Please:
1. Identify which test is failing
2. Explain the assertion that's failing
3. Suggest a fix for either the code or the test
4. Run Verify again to confirm fix
```

---

## Add New Test Category

```
I need to add tests for a new component:

[Describe the component]

Please:
1. Create qa/proxy/<level>/<component>/ folder
2. Add __init__.py
3. Create initial test file with 3+ tests
4. Register in qa/verify/registry.py
5. Update qa/docs/test_plan_proxy.md
6. Run `make verify` to confirm
```
