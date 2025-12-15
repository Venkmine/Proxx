"""
Execution-specific errors.

All errors are non-fatal to the application.
They indicate execution failure for a specific clip but do not crash Proxx.
"""


class ExecutionError(Exception):
    """
    Base exception for execution failures.
    
    All execution errors inherit from this.
    These errors indicate a clip cannot be processed but Proxx continues running.
    """
    
    pass


class PreFlightCheckError(ExecutionError):
    """
    Pre-flight validation failed.
    
    Raised when prerequisites are not met:
    - Source file missing
    - Source file unreadable
    - Output destination not writable
    - Resolve not available
    """
    
    pass


class ResolveExecutionError(ExecutionError):
    """
    Resolve execution failed.
    
    Raised when Resolve cannot render the clip:
    - Resolve crashed
    - Resolve API error
    - Timeout exceeded
    - Render job failed
    """
    
    pass


class OutputVerificationError(ExecutionError):
    """
    Output verification failed.
    
    Raised when render appears to succeed but output is invalid:
    - Output file missing
    - Output file zero bytes
    - Output path mismatch
    """
    
    pass
