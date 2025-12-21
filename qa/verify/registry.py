"""
Test Registry

Organizes tests into groups by level and category.
"""

from dataclasses import dataclass
from enum import Enum
from typing import List, Optional

from .levels import VerifyLevel


class TestCategory(Enum):
    """Test categories."""
    UNIT = "unit"
    INTEGRATION = "integration"
    E2E = "e2e"
    UI = "ui"
    CONTRACT = "contract"  # Proxy v1: Product behaviour contracts


@dataclass
class TestGroup:
    """A group of related tests."""
    name: str
    category: TestCategory
    min_level: VerifyLevel
    path: str
    description: str


# Registry of all test groups
TEST_GROUPS: List[TestGroup] = [
    # Unit tests (FAST level)
    TestGroup(
        name="settings",
        category=TestCategory.UNIT,
        min_level=VerifyLevel.FAST,
        path="proxy/unit/test_settings.py",
        description="DeliverSettings immutability and validation",
    ),
    TestGroup(
        name="naming",
        category=TestCategory.UNIT,
        min_level=VerifyLevel.FAST,
        path="proxy/unit/test_naming.py",
        description="Output naming token resolution",
    ),
    TestGroup(
        name="paths",
        category=TestCategory.UNIT,
        min_level=VerifyLevel.FAST,
        path="proxy/unit/test_paths.py",
        description="Output path resolver",
    ),
    TestGroup(
        name="engine_mapping",
        category=TestCategory.UNIT,
        min_level=VerifyLevel.FAST,
        path="proxy/unit/test_engine_mapping.py",
        description="Engine mapping validation",
    ),
    
    # Contract tests (PROXY level) - Proxy v1 product behaviour
    TestGroup(
        name="job_creation_contract",
        category=TestCategory.CONTRACT,
        min_level=VerifyLevel.PROXY,
        path="proxy/contract/test_job_creation_contract.py",
        description="Proxy v1 job creation requirements",
    ),
    TestGroup(
        name="feature_gates",
        category=TestCategory.CONTRACT,
        min_level=VerifyLevel.PROXY,
        path="proxy/contract/test_feature_gates.py",
        description="Proxy v1 unsupported feature rejection",
    ),
    TestGroup(
        name="browser_mode",
        category=TestCategory.CONTRACT,
        min_level=VerifyLevel.PROXY,
        path="proxy/contract/test_browser_mode.py",
        description="Browser mode cannot bypass v1 restrictions",
    ),
    
    # Integration tests (PROXY level)
    TestGroup(
        name="job_creation",
        category=TestCategory.INTEGRATION,
        min_level=VerifyLevel.PROXY,
        path="proxy/integration/test_job_creation.py",
        description="Job creation and lifecycle",
    ),
    TestGroup(
        name="watch_folder",
        category=TestCategory.INTEGRATION,
        min_level=VerifyLevel.PROXY,
        path="proxy/integration/test_watch_folder.py",
        description="Watch folder ingestion simulation",
    ),
    TestGroup(
        name="persistence",
        category=TestCategory.INTEGRATION,
        min_level=VerifyLevel.PROXY,
        path="proxy/integration/test_persistence.py",
        description="SQLite persistence correctness",
    ),
    
    # E2E tests (FULL level)
    TestGroup(
        name="transcode",
        category=TestCategory.E2E,
        min_level=VerifyLevel.FULL,
        path="proxy/e2e/test_transcode.py",
        description="Real FFmpeg transcode verification",
    ),
    TestGroup(
        name="ffprobe_validation",
        category=TestCategory.E2E,
        min_level=VerifyLevel.FULL,
        path="proxy/e2e/test_ffprobe_validation.py",
        description="Output validation with ffprobe",
    ),
    TestGroup(
        name="recovery",
        category=TestCategory.E2E,
        min_level=VerifyLevel.FULL,
        path="proxy/e2e/test_recovery.py",
        description="Restart/recovery scenarios",
    ),
    
    # UI tests (UI level - also included in FULL)
    TestGroup(
        name="ui_create_job",
        category=TestCategory.UI,
        min_level=VerifyLevel.UI,
        path="verify/ui/proxy/create_job.spec.ts",
        description="Create job workflow via UI",
    ),
    TestGroup(
        name="ui_queue_lifecycle",
        category=TestCategory.UI,
        min_level=VerifyLevel.UI,
        path="verify/ui/proxy/queue_lifecycle.spec.ts",
        description="Queue operations via UI",
    ),
    TestGroup(
        name="ui_validation_errors",
        category=TestCategory.UI,
        min_level=VerifyLevel.UI,
        path="verify/ui/proxy/validation_errors.spec.ts",
        description="Error handling in UI",
    ),
    TestGroup(
        name="ui_reset_retry",
        category=TestCategory.UI,
        min_level=VerifyLevel.UI,
        path="verify/ui/proxy/reset_and_retry.spec.ts",
        description="Reset and retry workflows via UI",
    ),
    TestGroup(
        name="ui_browser_electron",
        category=TestCategory.UI,
        min_level=VerifyLevel.UI,
        path="verify/ui/proxy/browser_vs_electron.spec.ts",
        description="Browser vs Electron mode behavior",
    ),
]


def get_test_groups(level: Optional[VerifyLevel] = None) -> List[TestGroup]:
    """
    Get test groups for a given level.
    
    If level is None, returns all groups.
    UI level returns only UI tests.
    FULL level includes all tests including UI.
    """
    if level is None:
        return TEST_GROUPS
    
    # UI level is special - returns only UI tests
    if level == VerifyLevel.UI:
        return [g for g in TEST_GROUPS if g.category == TestCategory.UI]
    
    # Standard level progression
    level_order = [VerifyLevel.FAST, VerifyLevel.PROXY, VerifyLevel.FULL]
    level_idx = level_order.index(level) if level in level_order else 2
    
    # FULL includes UI tests too
    if level == VerifyLevel.FULL:
        return [
            g for g in TEST_GROUPS
            if g.min_level in level_order[:level_idx + 1] or g.category == TestCategory.UI
        ]
    
    return [
        g for g in TEST_GROUPS
        if g.min_level in level_order[:level_idx + 1]
    ]
