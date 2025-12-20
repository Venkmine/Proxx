"""
Resolve-specific errors.

Exception hierarchy for Resolve discovery, validation, and command preparation.
"""


class ResolveError(Exception):
    """
    Base exception for all Resolve-related errors.
    
    All Resolve errors inherit from this base class to enable
    consistent error handling and clear separation from other
    system errors.
    """
    pass


class ResolveNotFoundError(ResolveError):
    """
    Raised when Resolve installation cannot be discovered.
    
    This indicates that Resolve is not installed at expected
    platform-specific locations and no override paths were provided.
    
    This is NOT a fatal error for the application, but prevents
    Resolve-based operations from proceeding.
    """
    pass


class ResolveFreeDetectedError(ResolveError):
    """
    Raised when Resolve Free is detected instead of Resolve Studio.
    
    Proxx v1.x requires Resolve Studio for scripting API access.
    Resolve Free does not support the required automation features.
    
    This is NOT a fatal error for the application, but prevents
    Resolve-based operations from proceeding.
    """
    pass


class ResolveValidationError(ResolveError):
    """
    Raised when Resolve installation fails validation checks.
    
    Examples:
    - Scripting API path not found
    - Version detection failed
    - Installation is corrupted or incomplete
    
    This is NOT a fatal error for the application, but prevents
    Resolve-based operations from proceeding.
    """
    pass
