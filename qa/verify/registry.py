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
]


def get_test_groups(level: Optional[VerifyLevel] = None) -> List[TestGroup]:
    """
    Get test groups for a given level.
    
    If level is None, returns all groups.
    Otherwise, returns groups where min_level <= level.
    """
    if level is None:
        return TEST_GROUPS
    
    level_order = [VerifyLevel.FAST, VerifyLevel.PROXY, VerifyLevel.FULL]
    level_idx = level_order.index(level)
    
    return [
        g for g in TEST_GROUPS
        if level_order.index(g.min_level) <= level_idx
    ]
