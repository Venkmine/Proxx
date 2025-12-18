"""
Execution engine registry.

Phase 16: Central registry for engine lookup.

Design rules:
- Explicit engine binding, no inference
- No fallback engines
- Engines are singletons per registry
"""

import logging
from typing import Dict, Optional

from .base import ExecutionEngine, EngineType, EngineNotAvailableError
from .ffmpeg import FFmpegEngine
from .resolve import ResolveEngine

logger = logging.getLogger(__name__)


class EngineRegistry:
    """
    Registry of available execution engines.
    
    Provides:
    - Engine lookup by type
    - Availability checking
    - Engine listing for UI
    
    Engines are singletons within a registry instance.
    """
    
    def __init__(self):
        """Initialize registry with all engine implementations."""
        self._engines: Dict[EngineType, ExecutionEngine] = {}
        self._initialize_engines()
    
    def _initialize_engines(self) -> None:
        """Create engine instances."""
        # FFmpeg engine (Phase 16: real)
        self._engines[EngineType.FFMPEG] = FFmpegEngine()
        
        # Resolve engine (Phase 16: stub only)
        self._engines[EngineType.RESOLVE] = ResolveEngine()
        
        # Log availability
        for engine_type, engine in self._engines.items():
            status = "available" if engine.available else "not available"
            logger.info(f"Engine '{engine.name}' ({engine_type.value}): {status}")
    
    def get_engine(self, engine_type: EngineType) -> ExecutionEngine:
        """
        Get engine by type.
        
        Args:
            engine_type: The engine type to retrieve
            
        Returns:
            The engine instance
            
        Raises:
            EngineNotAvailableError: If engine is not registered
        """
        engine = self._engines.get(engine_type)
        if not engine:
            raise EngineNotAvailableError(
                engine_type,
                reason="Engine not registered"
            )
        return engine
    
    def get_available_engine(self, engine_type: EngineType) -> ExecutionEngine:
        """
        Get engine by type, validating availability.
        
        Args:
            engine_type: The engine type to retrieve
            
        Returns:
            The engine instance
            
        Raises:
            EngineNotAvailableError: If engine is not available on this system
        """
        engine = self.get_engine(engine_type)
        
        if not engine.available:
            raise EngineNotAvailableError(
                engine_type,
                reason=f"{engine.name} is not installed or configured"
            )
        
        return engine
    
    def list_engines(self) -> list[dict]:
        """
        List all engines with availability status.
        
        Returns:
            List of engine info dicts for UI display
        """
        result = []
        for engine_type, engine in self._engines.items():
            result.append({
                "type": engine_type.value,
                "name": engine.name,
                "available": engine.available,
                "capabilities": [cap.value for cap in engine.capabilities],
            })
        return result
    
    def list_available_engines(self) -> list[EngineType]:
        """
        List only available engine types.
        
        Returns:
            List of available EngineType values
        """
        return [
            engine_type
            for engine_type, engine in self._engines.items()
            if engine.available
        ]
    
    def is_available(self, engine_type: EngineType) -> bool:
        """
        Check if an engine is available.
        
        Args:
            engine_type: The engine type to check
            
        Returns:
            True if engine is available, False otherwise
        """
        engine = self._engines.get(engine_type)
        return engine is not None and engine.available


# Global registry instance
_default_registry: Optional[EngineRegistry] = None


def get_engine_registry() -> EngineRegistry:
    """
    Get the default engine registry instance.
    
    Creates the registry on first access (lazy initialization).
    """
    global _default_registry
    if _default_registry is None:
        _default_registry = EngineRegistry()
    return _default_registry
