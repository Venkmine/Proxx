"""
Job-to-preset binding registry.

Phase 11: External storage for job preset assignments.
Preset IDs are NOT stored on Job models to keep models clean.

This registry tracks which preset should be used for each job.
Bindings are stored in memory (persistence deferred to Phase 12).
"""

from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)


class JobPresetBindingRegistry:
    """
    External registry for job-to-preset mappings.
    
    Maintains association between job IDs and global preset IDs.
    Presets are validated at binding time but not resolved.
    """
    
    def __init__(self):
        """Initialize empty binding registry."""
        # job_id -> global_preset_id
        self._bindings: Dict[str, str] = {}
    
    def bind_preset(self, job_id: str, preset_id: str) -> None:
        """
        Bind a preset to a job.
        
        Overwrites any existing binding for this job.
        Does NOT validate preset existence (caller's responsibility).
        
        Args:
            job_id: Job identifier
            preset_id: Global preset identifier
        """
        self._bindings[job_id] = preset_id
        logger.debug(f"Bound preset '{preset_id}' to job '{job_id}'")
    
    def get_preset_id(self, job_id: str) -> Optional[str]:
        """
        Get the preset ID bound to a job.
        
        Args:
            job_id: Job identifier
            
        Returns:
            Preset ID if bound, None otherwise
        """
        return self._bindings.get(job_id)
    
    def unbind_preset(self, job_id: str) -> None:
        """
        Remove preset binding for a job.
        
        Args:
            job_id: Job identifier
        """
        if job_id in self._bindings:
            preset_id = self._bindings.pop(job_id)
            logger.debug(f"Unbound preset '{preset_id}' from job '{job_id}'")
    
    def has_binding(self, job_id: str) -> bool:
        """
        Check if a job has a preset binding.
        
        Args:
            job_id: Job identifier
            
        Returns:
            True if job has a preset bound
        """
        return job_id in self._bindings
    
    def list_bindings(self) -> Dict[str, str]:
        """
        List all job-to-preset bindings.
        
        Returns:
            Dictionary mapping job_id to preset_id
        """
        return dict(self._bindings)
    
    def clear(self) -> None:
        """
        Clear all bindings.
        
        Used primarily for testing or state reset.
        """
        self._bindings.clear()
        logger.info("Cleared all job-preset bindings")
