"""
Verify Levels

Defines the verification levels for the QA system.

LOCKED DEFINITIONS:
1) Verify Proxy Fast
   - lint
   - formatting
   - unit tests
   - schema/settings validation
   - naming/path determinism

2) Verify Proxy
   - everything in Fast
   - integration tests
   - watch-folder simulation
   - state transition correctness
   - metadata passthrough assertions

3) Verify Proxy Full
   - everything in Proxy
   - real FFmpeg end-to-end transcodes
   - ffprobe validation (codec, duration, fps, audio)
   - restart/recovery scenarios
   - watermark overlay verification
   - regression suite
"""

from enum import Enum


class VerifyLevel(Enum):
    """Verification levels."""
    FAST = "fast"
    PROXY = "proxy"
    UI = "ui"      # UI end-to-end tests via Playwright
    FULL = "full"  # Includes UI tests


def get_level(level_str: str) -> VerifyLevel:
    """Parse level string to VerifyLevel enum."""
    level_map = {
        "fast": VerifyLevel.FAST,
        "proxy": VerifyLevel.PROXY,
        "ui": VerifyLevel.UI,
        "full": VerifyLevel.FULL,
    }
    return level_map.get(level_str.lower(), VerifyLevel.PROXY)


# Level descriptions for documentation
LEVEL_DESCRIPTIONS = {
    VerifyLevel.FAST: """
Verify Proxy Fast:
- Lint checks (ruff)
- Schema/settings validation
- Unit tests
- Naming/path determinism tests
""",
    VerifyLevel.PROXY: """
Verify Proxy (includes Fast):
- Integration tests
- Watch-folder simulation
- State transition correctness
- Metadata passthrough assertions
""",
    VerifyLevel.UI: """
Verify Proxy UI:
- End-to-end Playwright tests
- Create Job workflow
- Queue lifecycle
- Validation errors
- Reset and retry
- Browser vs Electron mode
""",
    VerifyLevel.FULL: """
Verify Proxy Full (includes Proxy + UI):
- Real FFmpeg E2E transcodes
- ffprobe validation (codec, duration, fps, audio)
- Restart/recovery scenarios
- Watermark overlay verification
- UI end-to-end tests
- Regression suite
""",
}
