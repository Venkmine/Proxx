"""
CLI-specific error types.

All CLI errors inherit from CLIError for consistent handling.
"""


class CLIError(Exception):
    """Base exception for all CLI-related failures."""
    pass


class ValidationError(CLIError):
    """Raised when pre-execution validation fails."""
    
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class ConfirmationDenied(CLIError):
    """Raised when operator denies confirmation prompt."""
    
    def __init__(self):
        super().__init__("Operation cancelled by operator")
