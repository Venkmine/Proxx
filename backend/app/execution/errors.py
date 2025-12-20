"""
Execution-specific errors.

All errors are non-fatal to the application.
They indicate execution failure for a specific clip but Awaire Proxy continues running.
"""


class ExecutionError(Exception):
    """
    Base exception for execution failures.
    
    All execution errors inherit from this.
    These errors indicate a clip cannot be processed but the app continues running.
    """
    
    pass


class PreFlightCheckError(ExecutionError):
    """
    Pre-flight validation failed.
    
    Raised when prerequisites are not met:
    - Source file missing
    - Source file unreadable
    - Output destination not writable
    - FFmpeg not available
    """
    
    pass


class EngineExecutionError(ExecutionError):
    """
    Engine execution failed.
    
    Raised when the execution engine cannot process the clip:
    - FFmpeg error
    - Timeout exceeded
    - Process crashed
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
