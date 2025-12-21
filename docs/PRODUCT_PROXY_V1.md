# Awaire Proxy v1 — Product Definition

**This document is authoritative.**

Proxy v1 is a finished, bounded product. This document defines exactly what it does, what it does not do, and how to verify compliance.

---

## What Proxy v1 Does

Proxy v1 performs exactly one workflow:

1. **User selects SOURCE FILES** (files only, not folders)
2. **User specifies OUTPUT DIRECTORY** (required, explicit path)
3. **User selects ONE PRESET** (encoding parameters)
4. **User clicks "Add to Queue"**
5. **Job appears in queue** with status PENDING
6. **Job executes via FFmpeg** when user starts it
7. **Job status updates** (QUEUED → RUNNING → COMPLETED/FAILED)
8. **Jobs persist across app restarts** (SQLite storage)

That's it.

---

## What Proxy v1 Does NOT Do

The following features are **explicitly not supported** in Proxy v1:

| Feature | Status | API Behaviour |
|---------|--------|---------------|
| Watch folders | Not implemented | No endpoints exist (404) |
| Colour transforms | Not supported | HTTP 400 if colour settings sent |
| LUT application | Not supported | HTTP 400 if colour settings sent |
| Resolve engine | Not available | HTTP 501 Not Implemented |
| Folder ingest | Not supported | Validation rejects directories |
| Per-clip overrides | Not supported | All clips use job-level settings |
| Network workflows | Not supported | Local filesystem only |
| Multi-machine | Not supported | Single instance only |

### Important Clarifications

- **No "coming soon" features** — If it's not working today, it doesn't exist in the UI
- **No placeholder UI** — Disabled buttons with "planned" labels are not acceptable
- **No silent fallbacks** — Unsupported settings cause explicit errors, not silent ignoring

---

## Electron vs Browser Mode

### Electron (Authoritative)

Electron is the production runtime. All features work as documented.

- Native file dialogs for source selection
- Native folder dialogs for output directory
- Full filesystem access
- Desktop app window management

### Browser (Development Only)

Browser mode exists for development and visual debugging. It is **not** a supported runtime.

Browser mode rules:

1. **Filesystem features may degrade** — Manual path entry instead of dialogs
2. **Cannot bypass validation** — Output directory still required
3. **Cannot enable hidden features** — API behaviour is identical
4. **No special treatment** — Backend does not detect or differentiate clients

**Browser mode must NEVER expose functionality Electron does not have.**

---

## UI Truthfulness Rules

These rules apply to all UI surfaces:

1. **If a control exists, it MUST work**
   - No disabled buttons with "planned" text
   - No dropdowns with non-functional options

2. **If it does not work, it MUST be invisible**
   - Not disabled, not greyed out — removed entirely
   - No visual hint that the feature might exist

3. **No silent fallbacks**
   - If something fails, show an error
   - Never pretend an operation succeeded when it didn't

4. **No future features in UI**
   - No "coming soon" labels
   - No grayed-out module tabs
   - If it's not shipping, it's not visible

5. **Visibility implies support**
   - Every visible element must be functional
   - Users should never wonder "does this work?"

---

## Verify Contract Tests

Contract tests assert **product behaviour**, not implementation details.

### Location

```
qa/proxy/contract/
├── __init__.py
├── test_job_creation_contract.py
├── test_feature_gates.py
└── test_browser_mode.py
```

### Contract Categories

#### 1. Job Creation Contract
Tests that job creation enforces required fields:
- Fails without source files
- Fails without output directory
- Fails without preset
- Succeeds when all three are present

#### 2. Feature Gates Contract
Tests that unsupported features are rejected:
- Colour settings → HTTP 400 (schema validation)
- Resolve engine → HTTP 501 Not Implemented
- Watch folder endpoints → HTTP 404 (not exposed)
- Extra fields → HTTP 400 (extra="forbid")

#### 3. Browser Mode Contract
Tests that browser mode cannot bypass restrictions:
- Output directory always required
- No client-specific API behaviour
- All validation is server-side

### Running Contract Tests

```bash
# Run all Verify levels including contract tests
make verify

# Run PROXY level (includes contract tests)
make verify-proxy
```

### Contract Test Guarantees

If these tests fail, Proxy v1 is broken:
- A supported feature stopped working, or
- An unsupported feature started being accepted

Both conditions require immediate fix before release.

---

## Supported Components

### Engines
- ✅ **FFmpeg** — Available, default
- ❌ **Resolve** — HTTP 501 Not Implemented

### Video Codecs (via FFmpeg)
- ProRes (422, 422 HQ, 422 LT, 4444)
- H.264 (CRF and bitrate modes)
- H.265/HEVC
- DNxHD/DNxHR

### Audio Codecs
- Copy (passthrough)
- AAC
- PCM (16-bit, 24-bit)

### Containers
- MOV
- MP4
- MXF

### Features
- ✅ Resolution scaling
- ✅ Frame rate conversion
- ✅ Audio layout control
- ✅ Metadata passthrough
- ✅ Text watermarks
- ✅ Naming templates
- ❌ Colour/LUT transforms

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2024-12-21 | Initial locked product definition |

---

## Governance

This document is the source of truth for Proxy v1 scope.

**To add a feature to Proxy v1:**
1. It must be fully implemented and tested
2. Contract tests must pass
3. UI must display it (visibility = support)
4. This document must be updated

**To remove a feature from Proxy v1:**
1. Remove from UI completely
2. Remove or reject at API level
3. Add contract test ensuring rejection
4. Update this document

No feature may exist in partial state.
