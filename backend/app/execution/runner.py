"""
Single-clip execution pipeline.

Phase 6: Execute exactly one clip in isolation.

This module provides the end-to-end execution pipeline for a single clip:
1. Pre-flight validation (source exists, output writable, Resolve available)
2. Metadata extraction (ffprobe)
3. Support validation (skip unsupported files)
4. Output path generation
5. Resolve render invocation
6. Post-flight verification (output exists, non-zero size)
7. Result classification (SUCCESS, SUCCESS_WITH_WARNINGS, FAILED)

NO JOB LOOPS. NO TASK ITERATION. NO ENGINE INTEGRATION.
Engine orchestration happens in Phase 7.
"""

import os
from pathlib import Path
from datetime import datetime
from typing import Optional

from .errors import (
    PreFlightCheckError,
    ResolveExecutionError,
    OutputVerificationError,
)
from .results import ExecutionResult, ExecutionStatus
from .resolve_api import render_single_clip
from .paths import (
    generate_output_path,
    ensure_output_directory,
    handle_output_collision,
)
from ..metadata.extractors import extract_metadata
from ..metadata.errors import (
    MetadataExtractionError,
    UnsupportedFileError,
)
from ..presets.schemas import CodecPreset, ScalingPreset
from ..presets.models import PresetCategory, GlobalPreset
from ..presets.registry import PresetRegistry


def execute_single_clip(
    source_path: str,
    global_preset_id: str,
    preset_registry: PresetRegistry,
    output_base_dir: Optional[str] = None,
) -> ExecutionResult:
    """
    Execute rendering pipeline for a single clip.
    
    This is the main entry point for Phase 6 execution.
    It orchestrates the entire pipeline for one clip in isolation.
    
    Pipeline stages:
    1. PRE-FLIGHT: Validate prerequisites
    2. METADATA: Extract and validate source metadata
    3. SUPPORT: Check if file is supported
    4. OUTPUT PATH: Generate output path from preset
    5. RESOLVE: Invoke Resolve render
    6. VERIFICATION: Verify output exists and is valid
    7. RESULT: Classify outcome
    
    Failure modes (all non-blocking to application):
    - Source missing → FAILED
    - Source unreadable → FAILED
    - Unsupported format → FAILED (skipped)
    - Metadata extraction failed → FAILED
    - Output directory not writable → FAILED
    - Resolve not available → FAILED
    - Resolve crashed → FAILED
    - Render failed → FAILED
    - Output missing → FAILED
    - Output zero bytes → FAILED
    
    Warnings (non-blocking):
    - VFR detected
    - Long-GOP codec
    - Drop frame mismatch
    
    Args:
        source_path: Absolute path to source media file
        global_preset_id: ID of global preset to use
        preset_registry: Preset registry with all presets
        output_base_dir: Base directory for output (None = source parent dir)
        
    Returns:
        ExecutionResult with complete outcome information
        
    Example:
        >>> result = execute_single_clip(
        ...     source_path="/media/clip001.mov",
        ...     global_preset_id="hd_prores_proxy",
        ...     preset_registry=registry,
        ...     output_base_dir="/output"
        ... )
        >>> print(result.summary())
        SUCCESS (12.3s): /media/clip001.mov → /output/clip001_prores_proxy.mov
    """
    
    result = ExecutionResult(
        status=ExecutionStatus.FAILED,  # Assume failure, update on success
        source_path=source_path,
        started_at=datetime.now(),
    )
    
    try:
        # ====================================================================
        # STAGE 1: PRE-FLIGHT VALIDATION
        # ====================================================================
        
        source = Path(source_path)
        
        # Check source exists
        if not source.exists():
            result.failure_reason = f"Source file not found: {source_path}"
            result.completed_at = datetime.now()
            return result
        
        # Check source is a file (not directory)
        if not source.is_file():
            result.failure_reason = f"Source is not a file: {source_path}"
            result.completed_at = datetime.now()
            return result
        
        # Check source is readable
        if not os.access(source, os.R_OK):
            result.failure_reason = f"Source file not readable: {source_path}"
            result.completed_at = datetime.now()
            return result
        
        # ====================================================================
        # STAGE 2: PRESET RESOLUTION
        # ====================================================================
        
        # Retrieve global preset
        try:
            global_preset = preset_registry.get_global_preset(global_preset_id)
        except Exception as e:
            result.failure_reason = f"Failed to retrieve global preset '{global_preset_id}': {e}"
            result.completed_at = datetime.now()
            return result
        
        # Get codec preset
        codec_preset_id = global_preset.category_refs.get(PresetCategory.CODEC)
        if codec_preset_id is None:
            result.failure_reason = "Global preset missing codec configuration"
            result.completed_at = datetime.now()
            return result
        
        try:
            codec_preset = preset_registry.get_category_preset(
                PresetCategory.CODEC,
                codec_preset_id
            )
            if not isinstance(codec_preset, CodecPreset):
                result.failure_reason = f"Invalid codec preset type: {type(codec_preset)}"
                result.completed_at = datetime.now()
                return result
        except Exception as e:
            result.failure_reason = f"Failed to retrieve codec preset '{codec_preset_id}': {e}"
            result.completed_at = datetime.now()
            return result
        
        # Get duplicates preset for overwrite behavior
        duplicates_preset_id = global_preset.category_refs.get(PresetCategory.DUPLICATES)
        overwrite_existing = False
        if duplicates_preset_id:
            try:
                duplicates_preset = preset_registry.get_category_preset(
                    PresetCategory.DUPLICATES,
                    duplicates_preset_id
                )
                overwrite_existing = getattr(duplicates_preset, "overwrite_existing", False)
            except Exception:
                # Non-critical, continue with default
                pass
        
        # ====================================================================
        # STAGE 3: METADATA EXTRACTION
        # ====================================================================
        
        try:
            metadata = extract_metadata(source_path)
        except UnsupportedFileError as e:
            result.failure_reason = f"Unsupported media format: {e}"
            result.completed_at = datetime.now()
            return result
        except MetadataExtractionError as e:
            result.failure_reason = f"Metadata extraction failed: {e}"
            result.completed_at = datetime.now()
            return result
        
        # Check if file is supported
        if not metadata.is_supported:
            result.failure_reason = f"File not supported: {metadata.skip_reason or 'Unknown reason'}"
            result.completed_at = datetime.now()
            return result
        
        # Collect warnings from metadata
        if metadata.warnings:
            result.warnings.extend(metadata.warnings)
        
        # ====================================================================
        # STAGE 4: OUTPUT PATH GENERATION
        # ====================================================================
        
        # Determine output base directory
        if output_base_dir is None:
            output_dir = source.parent
        else:
            output_dir = Path(output_base_dir)
        
        # Generate output path
        try:
            output_path = generate_output_path(
                source_path=source,
                output_dir=output_dir,
                codec_preset=codec_preset,
                metadata=metadata,
            )
        except Exception as e:
            result.failure_reason = f"Failed to generate output path: {e}"
            result.completed_at = datetime.now()
            return result
        
        # Handle collision
        try:
            output_path = handle_output_collision(
                output_path=output_path,
                overwrite_existing=overwrite_existing,
            )
        except Exception as e:
            result.failure_reason = f"Failed to handle output collision: {e}"
            result.completed_at = datetime.now()
            return result
        
        # Ensure output directory exists
        try:
            ensure_output_directory(output_path)
        except PermissionError:
            result.failure_reason = f"Permission denied creating output directory: {output_path.parent}"
            result.completed_at = datetime.now()
            return result
        except Exception as e:
            result.failure_reason = f"Failed to create output directory: {e}"
            result.completed_at = datetime.now()
            return result
        
        # Check output directory is writable
        if not os.access(output_path.parent, os.W_OK):
            result.failure_reason = f"Output directory not writable: {output_path.parent}"
            result.completed_at = datetime.now()
            return result
        
        # ====================================================================
        # STAGE 5: RESOLVE RENDER EXECUTION
        # ====================================================================
        
        # Get duration hint for timeout calculation
        duration_hint = None
        if metadata.time and metadata.time.duration_seconds > 0:
            duration_hint = metadata.time.duration_seconds
        
        try:
            success, error_message = render_single_clip(
                source_path=source,
                output_path=output_path,
                codec=codec_preset.codec.value,
                container=codec_preset.container,
                timeout_seconds=None,  # Auto-calculate
                duration_hint=duration_hint,
            )
            
            if not success:
                result.failure_reason = f"Render failed: {error_message or 'Unknown error'}"
                result.completed_at = datetime.now()
                return result
                
        except PreFlightCheckError as e:
            result.failure_reason = f"Pre-flight check failed: {e}"
            result.completed_at = datetime.now()
            return result
        except ResolveExecutionError as e:
            result.failure_reason = f"Resolve execution failed: {e}"
            result.completed_at = datetime.now()
            return result
        except Exception as e:
            result.failure_reason = f"Unexpected error during render: {e}"
            result.completed_at = datetime.now()
            return result
        
        # ====================================================================
        # STAGE 6: OUTPUT VERIFICATION
        # ====================================================================
        
        # Check output exists
        if not output_path.exists():
            result.failure_reason = f"Output file not created: {output_path}"
            result.completed_at = datetime.now()
            return result
        
        # Check output is not empty
        output_size = output_path.stat().st_size
        if output_size == 0:
            result.failure_reason = f"Output file is zero bytes: {output_path}"
            result.completed_at = datetime.now()
            return result
        
        # ====================================================================
        # STAGE 7: SUCCESS
        # ====================================================================
        
        result.status = ExecutionStatus.SUCCESS
        result.output_path = str(output_path)
        result.completed_at = datetime.now()
        
        # If we collected warnings, upgrade to SUCCESS_WITH_WARNINGS
        if result.warnings:
            result.status = ExecutionStatus.SUCCESS_WITH_WARNINGS
        
        return result
        
    except Exception as e:
        # Catch-all for unexpected errors
        result.status = ExecutionStatus.FAILED
        result.failure_reason = f"Unexpected error: {e}"
        result.completed_at = datetime.now()
        return result
