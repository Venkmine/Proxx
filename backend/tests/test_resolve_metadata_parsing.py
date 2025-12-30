"""
Pre-RAW Hardening Tests - Resolve Metadata Parsing

Tests for Resolve version and edition parsing edge cases.

Validates:
1. Unexpected version strings handled gracefully
2. Missing or malformed fields don't crash
3. Metadata schema is stable and deterministic
4. Unknown values explicitly marked as "unknown"

Part of Pre-RAW Hardening Suite
"""

import pytest
from dataclasses import dataclass

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from v2.resolve_installation import ResolveInstallation


def test_resolve_installation_with_unexpected_version():
    """
    TEST: ResolveInstallation handles unexpected version formats.
    
    GIVEN: Version strings in unexpected formats
    WHEN: ResolveInstallation is created
    THEN: Object created successfully
    AND: version field stores string as-is
    """
    unexpected_versions = [
        "19.0.3b1",  # Beta version
        "unknown",
        "",
        "v19.0.3",  # Prefixed
        "19",  # Partial
        "2024.01.15",  # Date format
    ]
    
    for version_str in unexpected_versions:
        install = ResolveInstallation(
            version=version_str,
            edition="studio",
            install_path="/Applications/DaVinci Resolve Studio.app",
            detection_method="test",
            detection_confidence="low",
        )
        
        assert install.version == version_str
        assert isinstance(install.version, str)


def test_resolve_installation_with_unknown_edition():
    """
    TEST: ResolveInstallation explicitly marks unknown editions.
    
    GIVEN: Edition cannot be determined
    WHEN: ResolveInstallation is created with edition="unknown"
    THEN: Edition stored as "unknown"
    AND: Serialization preserves "unknown" value
    """
    install = ResolveInstallation(
        version="19.0.3",
        edition="unknown",
        install_path="/Applications/DaVinci Resolve.app",
        detection_method="fallback",
        detection_confidence="low",
    )
    
    assert install.edition == "unknown"
    
    # Verify serialization
    data = install.to_dict()
    assert data["edition"] == "unknown"
    assert data["detection_confidence"] == "low"


def test_resolve_installation_serialization_deterministic():
    """
    TEST: ResolveInstallation serialization is deterministic.
    
    GIVEN: Same ResolveInstallation data
    WHEN: Serialized multiple times
    THEN: Output is identical
    """
    install = ResolveInstallation(
        version="19.0.3",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    # Serialize multiple times
    dict1 = install.to_dict()
    dict2 = install.to_dict()
    dict3 = install.to_dict()
    
    assert dict1 == dict2 == dict3
    
    # Verify all required fields present
    required_fields = ["version", "edition", "install_path", "detection_method", "detection_confidence"]
    for field in required_fields:
        assert field in dict1


def test_resolve_installation_metadata_schema_stable():
    """
    TEST: ResolveInstallation metadata schema is stable.
    
    GIVEN: ResolveInstallation instance
    WHEN: to_dict() is called
    THEN: Returns exactly expected fields
    AND: No extra fields
    AND: No missing fields
    """
    install = ResolveInstallation(
        version="18.6.0",
        edition="free",
        install_path="/Applications/DaVinci Resolve.app",
        detection_method="macos_fallback_search",
        detection_confidence="medium",
    )
    
    data = install.to_dict()
    
    # Exact field set
    expected_fields = {
        "version",
        "edition",
        "install_path",
        "detection_method",
        "detection_confidence",
    }
    
    actual_fields = set(data.keys())
    
    # No extra fields
    extra_fields = actual_fields - expected_fields
    assert not extra_fields, f"Unexpected fields: {extra_fields}"
    
    # No missing fields
    missing_fields = expected_fields - actual_fields
    assert not missing_fields, f"Missing fields: {missing_fields}"


def test_resolve_installation_empty_strings_allowed():
    """
    TEST: ResolveInstallation allows empty strings for graceful degradation.
    
    GIVEN: Detection fails partially
    WHEN: Some fields are empty strings
    THEN: Object created successfully
    AND: Empty strings preserved
    """
    install = ResolveInstallation(
        version="",
        edition="unknown",
        install_path="",
        detection_method="failed_detection",
        detection_confidence="low",
    )
    
    assert install.version == ""
    assert install.edition == "unknown"
    assert install.install_path == ""
    
    # Serialization preserves empty strings
    data = install.to_dict()
    assert data["version"] == ""
    assert data["install_path"] == ""


def test_resolve_edition_values_restricted():
    """
    TEST: Resolve edition should be one of expected values.
    
    GIVEN: ResolveInstallation with various edition values
    WHEN: Edition is checked
    THEN: Should be "free", "studio", or "unknown"
    
    NOTE: This is a documentation test - ResolveInstallation doesn't
    enforce this at the dataclass level, but callers should use these values.
    """
    valid_editions = ["free", "studio", "unknown"]
    
    for edition in valid_editions:
        install = ResolveInstallation(
            version="19.0.3",
            edition=edition,
            install_path="/Applications/DaVinci Resolve.app",
            detection_method="test",
            detection_confidence="high",
        )
        
        assert install.edition in valid_editions


def test_resolve_confidence_values_documented():
    """
    TEST: Resolve confidence should be one of expected values.
    
    GIVEN: ResolveInstallation with various confidence values
    WHEN: Confidence is checked
    THEN: Should be "high", "medium", or "low"
    
    NOTE: This is a documentation test - ResolveInstallation doesn't
    enforce this at the dataclass level, but callers should use these values.
    """
    valid_confidences = ["high", "medium", "low"]
    
    for confidence in valid_confidences:
        install = ResolveInstallation(
            version="19.0.3",
            edition="studio",
            install_path="/Applications/DaVinci Resolve.app",
            detection_method="test",
            detection_confidence=confidence,
        )
        
        assert install.detection_confidence in valid_confidences


def test_resolve_installation_all_fields_required():
    """
    TEST: ResolveInstallation requires all fields (no defaults).
    
    GIVEN: Attempt to create ResolveInstallation
    WHEN: Required fields missing
    THEN: TypeError raised
    """
    # All fields are required (no defaults in dataclass)
    with pytest.raises(TypeError):
        ResolveInstallation()  # type: ignore
    
    with pytest.raises(TypeError):
        ResolveInstallation(version="19.0.3")  # type: ignore
    
    with pytest.raises(TypeError):
        ResolveInstallation(version="19.0.3", edition="studio")  # type: ignore


def test_resolve_installation_field_types():
    """
    TEST: ResolveInstallation fields have correct types.
    
    GIVEN: ResolveInstallation instance
    WHEN: Fields are accessed
    THEN: All fields are strings
    """
    install = ResolveInstallation(
        version="19.0.3",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    assert isinstance(install.version, str)
    assert isinstance(install.edition, str)
    assert isinstance(install.install_path, str)
    assert isinstance(install.detection_method, str)
    assert isinstance(install.detection_confidence, str)


def test_resolve_installation_serialization_types():
    """
    TEST: ResolveInstallation serialization produces correct types.
    
    GIVEN: ResolveInstallation instance
    WHEN: Serialized to dict
    THEN: All values are strings
    AND: Dict is JSON-serializable
    """
    import json
    
    install = ResolveInstallation(
        version="19.0.3",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    data = install.to_dict()
    
    # All values should be strings
    for key, value in data.items():
        assert isinstance(value, str), f"Field '{key}' should be string, got {type(value)}"
    
    # Should be JSON-serializable
    json_str = json.dumps(data)
    parsed = json.loads(json_str)
    assert parsed == data


def test_resolve_installation_immutable_after_creation():
    """
    TEST: ResolveInstallation fields can be modified (dataclass default).
    
    NOTE: ResolveInstallation is a regular dataclass, not frozen.
    This test documents that behavior.
    """
    install = ResolveInstallation(
        version="19.0.3",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    # Fields can be modified (not frozen)
    original_version = install.version
    install.version = "19.0.4"
    assert install.version == "19.0.4"
    assert install.version != original_version


def test_resolve_installation_detection_methods_documented():
    """
    TEST: Document common detection methods.
    
    This test serves as documentation for detection method values
    that may appear in practice.
    """
    common_methods = [
        "macos_install_path",
        "macos_fallback_search",
        "windows_registry",
        "linux_path_search",
        "test",  # For testing
        "failed_detection",
    ]
    
    for method in common_methods:
        install = ResolveInstallation(
            version="19.0.3",
            edition="studio",
            install_path="/Applications/DaVinci Resolve.app",
            detection_method=method,
            detection_confidence="medium",
        )
        
        assert install.detection_method == method


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
