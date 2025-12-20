"""
Pytest configuration for QA test suite.
"""

import sys
from pathlib import Path

# Add backend to Python path for test imports
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

# Configure pytest
def pytest_configure(config):
    """Configure pytest markers."""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (run with verify proxy full)"
    )
    config.addinivalue_line(
        "markers", "e2e: marks tests as end-to-end (requires FFmpeg)"
    )
