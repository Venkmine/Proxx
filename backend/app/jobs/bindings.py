"""
Job-to-preset binding registry.

Phase 11: External storage for job preset assignments.
Phase 12: Explicit persistence support.

Preset IDs are NOT stored on Job models to keep models clean.
This registry tracks which preset should be used for each job.
"""

from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)


class JobPresetBindingRegistry:
    """
    External registry for job-to-preset mappings.
    
    Maintains association between job IDs and global preset IDs.
    Phase 12: Explicit save/load operations.
    """
    
    def __init__(self, persistence_manager=None):
        """
        Initialize binding registry.
        
        Args:
            persistence_manager: Optional PersistenceManager for explicit save/load
        """
        # job_id -> global_preset_id
        self._bindings: Dict[str, str] = {}
        self._persistence = persistence_manager
    
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
    
    # Phase 12: Explicit persistence operations
    
    def save_binding(self, job_id: str) -> None:
        """
        Explicitly save a single binding to persistent storage.
        
        Must be called manually after bind_preset().
        
        Args:
            job_id: Job identifier
            
        Raises:
            ValueError: If persistence_manager is not configured or binding doesn't exist
        """
        if not self._persistence:
            raise ValueError("No persistence_manager configured for JobPresetBindingRegistry")
        
        preset_id = self._bindings.get(job_id)
        if not preset_id:
            raise ValueError(f"No binding exists for job '{job_id}'")
        
        self._persistence.save_preset_binding(job_id, preset_id)
    
    def load_all_bindings(self) -> None:
        """
        Load all bindings from persistent storage into memory.
        
        Called explicitly at startup to restore state.
        
        Raises:
            ValueError: If persistence_manager is not configured
        """
        if not self._persistence:
            raise ValueError("No persistence_manager configured for JobPresetBindingRegistry")
        
        self._bindings = self._persistence.load_all_preset_bindings()
        logger.info(f"Loaded {len(self._bindings)} preset bindings from storage")
