"""
Persistence-specific errors.
"""


class PersistenceError(Exception):
    """Base exception for persistence operations."""
    
    pass


class SchemaError(PersistenceError):
    """Schema migration or validation failed."""
    
    pass


class LoadError(PersistenceError):
    """Failed to load state from storage."""
    
    pass


class SaveError(PersistenceError):
    """Failed to save state to storage."""
    
    pass
