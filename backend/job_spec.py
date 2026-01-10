"""
V2 JobSpec - Deterministic, serializable job specification for the Reliable Proxy Engine.

This module defines the JobSpec dataclass which serves as the single source of truth
for proxy job configuration. It is independent of UI state and designed for
deterministic, reproducible job execution.

V2 Phase 1 Step 3: Multi-Clip Support
=====================================
JobSpec now supports multiple source clips via the `sources` field. Each source
represents an independent output that will be processed sequentially. Key semantics:

- sources: Ordered list of source paths (ordering MUST be preserved)
- Each source produces exactly one output file
- No implicit grouping or batching logic
- Execution is sequential and deterministic (concurrency deferred to V2 Phase 2+)
- Naming tokens (e.g., {source_name}, {index}) resolve per-source deterministically

Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, ClassVar, Set, Tuple
import json
import re
import subprocess
import uuid

# Try to import source capabilities (V2 source format validation)
try:
    from v2.source_capabilities import (
        validate_source_capability,
        SourceCapabilityError,
        is_source_supported,
        get_rejection_reason,
    )
    _SOURCE_CAPABILITIES_AVAILABLE = True
except ImportError:
    try:
        from backend.v2.source_capabilities import (
            validate_source_capability,
            SourceCapabilityError,
            is_source_supported,
            get_rejection_reason,
        )
        _SOURCE_CAPABILITIES_AVAILABLE = True
    except ImportError:
        _SOURCE_CAPABILITIES_AVAILABLE = False
        SourceCapabilityError = None  # type: ignore


# =============================================================================
# JobSpec Contract Versioning
# =============================================================================
# This version is a LOCKED CONTRACT. Any change to the JobSpec schema
# (adding/removing/renaming fields, changing types, changing semantics)
# MUST increment this version number.
#
# Version History:
#   2.0 - Initial V2 JobSpec (December 2025)
#   2.1 - Contract locking with strict validation (December 2025)
# =============================================================================
JOBSPEC_VERSION = "2.1"


class FpsMode(str, Enum):
    """Frame rate handling mode for proxy generation."""
    SAME_AS_SOURCE = "same-as-source"
    EXPLICIT = "explicit"


# =============================================================================
# Valid Enum Values (Strict Contract)
# =============================================================================
# These are the ONLY valid values for each enum field.
# Any other value is a contract violation and MUST fail.
# =============================================================================

VALID_FPS_MODES: Set[str] = {"same-as-source", "explicit"}

VALID_CODECS: Set[str] = {
    "prores_proxy", "prores_lt", "prores_standard", "prores_hq", "prores_4444",
    "h264", "h265", "hevc",
    "dnxhd", "dnxhr",
    "vp9", "av1",
}

VALID_CONTAINERS: Set[str] = {
    "mov", "mp4", "mkv", "webm", "mxf",
}

VALID_RESOLUTIONS: Set[str] = {
    "same", "half", "quarter",
    # Explicit resolutions like "1920x1080" are validated by pattern
}


class JobSpecValidationError(Exception):
    """Raised when JobSpec validation fails."""
    pass


@dataclass
class JobSpec:
    """
    Deterministic, serializable specification for a proxy transcoding job.
    
    This dataclass fully describes a proxy job independent of UI state.
    It is the single source of truth for job configuration and can be
    serialized to JSON for persistence, logging, and debugging.
    
    Multi-Clip Semantics (V2 Phase 1 Step 3):
    -----------------------------------------
    The `sources` field is an ORDERED list of source media files. Each source
    represents an independent output that will be processed. Key rules:
    
    1. Ordering is PRESERVED and deterministic
    2. Each source produces exactly one output file
    3. No implicit grouping, batching, or concurrency
    4. Naming tokens resolve per-source (e.g., {index} = 000, 001, 002...)
    5. Sequential execution: stop on first failure, return partial results
    
    This design enables future watch folder processing while maintaining
    deterministic behavior for automation and testing.
    
    Attributes:
        jobspec_version: Schema version (REQUIRED, must match JOBSPEC_VERSION)
        job_id: Unique identifier for this job (auto-generated if not provided)
        sources: Ordered list of absolute paths to source media files.
                 Each source is processed independently and produces one output.
                 Ordering MUST be preserved for deterministic execution.
        output_directory: Absolute path to output directory for proxies
        codec: Video codec for proxy encoding (e.g., 'prores_proxy', 'h264')
        container: Container format (e.g., 'mov', 'mp4')
        resolution: Target resolution (e.g., '1920x1080', '1280x720', 'half', 'quarter')
        fps_mode: Frame rate handling mode
        fps_explicit: Explicit frame rate value (required if fps_mode is EXPLICIT)
        naming_template: Template string for output file naming.
                        Tokens are resolved per-source deterministically.
        resolved_tokens: Dictionary of resolved naming tokens (populated during execution)
        created_at: ISO 8601 timestamp of job creation
    """
    
    # -------------------------------------------------------------------------
    # Known Fields (Contract Enforcement)
    # -------------------------------------------------------------------------
    # These are the ONLY fields allowed in a JobSpec JSON.
    # Any unknown field is a contract violation and MUST fail.
    # -------------------------------------------------------------------------
    KNOWN_FIELDS: ClassVar[Set[str]] = {
        "jobspec_version",
        "job_id",
        "sources",
        "output_directory",
        "codec",
        "container",
        "resolution",
        "fps_mode",
        "fps_explicit",
        "naming_template",
        "resolved_tokens",
        "created_at",
        "resolve_preset",
        "proxy_profile",
        "requires_resolve_edition",
        # LUT Support Fields
        "lut_id",
        "lut_applied",
        "lut_engine",
        # Phase 9A: Explicit Execution Control
        "execution_requested",
    }
    
    sources: List[str]
    output_directory: str
    codec: str
    container: str
    resolution: str
    naming_template: str
    proxy_profile: Optional[str] = None  # V2 Step 5: Canonical proxy profiles
    requires_resolve_edition: str = "either"  # "free" | "studio" | "either" - Edition gating
    job_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    fps_mode: FpsMode = FpsMode.SAME_AS_SOURCE
    fps_explicit: Optional[float] = None
    resolve_preset: Optional[str] = None
    resolved_tokens: Dict[str, str] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    # LUT Support Fields (V2 Phase 1)
    # lut_id: Reference to registered LUT in lut_registry (nullable = no LUT)
    # lut_applied: Whether LUT was successfully applied during execution
    # lut_engine: Which engine applied the LUT (resolve, ffmpeg, or none)
    lut_id: Optional[str] = None
    lut_applied: bool = False
    lut_engine: Optional[str] = None  # "resolve" | "ffmpeg" | None
    # Phase 9A: Explicit Execution Control
    # Jobs MUST NOT execute unless this flag is True.
    # This flag is set ONLY via explicit user action (UI click).
    # Watch folders, automation, and job creation NEVER set this flag.
    # Default is False - jobs are created in QUEUED state awaiting execution.
    execution_requested: bool = False
    
    # -------------------------------------------------------------------------
    # Serialization
    # -------------------------------------------------------------------------
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize JobSpec to a dictionary with stable key ordering.
        
        The jobspec_version is automatically injected to ensure all
        serialized JobSpecs include the contract version.
        
        Returns:
            Dictionary representation suitable for JSON serialization.
        """
        return {
            "jobspec_version": JOBSPEC_VERSION,  # Contract version (injected)
            "job_id": self.job_id,
            "sources": list(self.sources),  # Preserve order
            "output_directory": self.output_directory,
            "codec": self.codec,
            "container": self.container,
            "resolution": self.resolution,
            "fps_mode": self.fps_mode.value if isinstance(self.fps_mode, FpsMode) else self.fps_mode,
            "fps_explicit": self.fps_explicit,
            "resolve_preset": self.resolve_preset,
            "proxy_profile": self.proxy_profile,
            "requires_resolve_edition": self.requires_resolve_edition,
            "naming_template": self.naming_template,
            "resolved_tokens": dict(sorted(self.resolved_tokens.items())),  # Stable ordering
            "created_at": self.created_at,
            # LUT fields
            "lut_id": self.lut_id,
            "lut_applied": self.lut_applied,
            "lut_engine": self.lut_engine,
            # Phase 9A: Explicit Execution Control
            "execution_requested": self.execution_requested,
        }
    
    def to_json(self, indent: int = 2) -> str:
        """
        Serialize JobSpec to JSON string with stable ordering.
        
        Args:
            indent: JSON indentation level (default: 2)
            
        Returns:
            JSON string representation of the JobSpec.
        """
        return json.dumps(self.to_dict(), indent=indent, sort_keys=False)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "JobSpec":
        """
        Deserialize JobSpec from a dictionary with STRICT contract validation.
        
        Contract Enforcement (V2.1):
        -----------------------------
        1. jobspec_version MUST be present and match JOBSPEC_VERSION
        2. Unknown fields are REJECTED (no permissive parsing)
        3. Enum values are STRICTLY validated against allowed sets
        4. Required fields MUST be present
        
        Args:
            data: Dictionary containing JobSpec fields.
            
        Returns:
            New JobSpec instance.
            
        Raises:
            JobSpecValidationError: If contract validation fails:
                - Missing jobspec_version
                - Version mismatch
                - Unknown fields present
                - Invalid enum values
                - Missing required fields
        """
        # =================================================================
        # Contract Check 1: Version MUST be present
        # =================================================================
        if "jobspec_version" not in data:
            raise JobSpecValidationError(
                "Missing required field 'jobspec_version'. "
                f"JobSpec contract requires explicit versioning. Expected version: {JOBSPEC_VERSION}"
            )
        
        # =================================================================
        # Contract Check 2: Version MUST match
        # =================================================================
        incoming_version = data["jobspec_version"]
        if incoming_version != JOBSPEC_VERSION:
            raise JobSpecValidationError(
                f"JobSpec version mismatch. "
                f"Got version '{incoming_version}', expected '{JOBSPEC_VERSION}'. "
                "Version mismatches are hard failures to prevent silent incompatibility. "
                "If upgrading, regenerate the JobSpec with the current engine version."
            )
        
        # =================================================================
        # Contract Check 3: Reject unknown fields (hard fail)
        # =================================================================
        incoming_fields = set(data.keys())
        unknown_fields = incoming_fields - cls.KNOWN_FIELDS
        if unknown_fields:
            unknown_list = ", ".join(sorted(unknown_fields))
            known_list = ", ".join(sorted(cls.KNOWN_FIELDS))
            raise JobSpecValidationError(
                f"Unknown fields in JobSpec: [{unknown_list}]. "
                "JobSpec contract does not allow unknown fields. "
                f"Known fields are: [{known_list}]"
            )
        
        # =================================================================
        # Contract Check 4: Validate required fields
        # =================================================================
        required_fields = {"sources", "output_directory", "codec", "container", 
                           "resolution", "naming_template"}
        missing_fields = required_fields - incoming_fields
        if missing_fields:
            missing_list = ", ".join(sorted(missing_fields))
            raise JobSpecValidationError(
                f"Missing required fields in JobSpec: [{missing_list}]"
            )
        
        # =================================================================
        # Contract Check 5: Strict enum validation - codec
        # =================================================================
        codec = data["codec"].lower()
        if codec not in VALID_CODECS:
            valid_list = ", ".join(sorted(VALID_CODECS))
            raise JobSpecValidationError(
                f"Invalid codec '{data['codec']}'. "
                f"Allowed values are: [{valid_list}]"
            )
        
        # =================================================================
        # Contract Check 6: Strict enum validation - container
        # =================================================================
        container = data["container"].lower().lstrip(".")
        if container not in VALID_CONTAINERS:
            valid_list = ", ".join(sorted(VALID_CONTAINERS))
            raise JobSpecValidationError(
                f"Invalid container '{data['container']}'. "
                f"Allowed values are: [{valid_list}]"
            )
        
        # =================================================================
        # Contract Check 7: Strict enum validation - fps_mode
        # =================================================================
        fps_mode_value = data.get("fps_mode", "same-as-source")
        if isinstance(fps_mode_value, str) and fps_mode_value not in VALID_FPS_MODES:
            valid_list = ", ".join(sorted(VALID_FPS_MODES))
            raise JobSpecValidationError(
                f"Invalid fps_mode '{fps_mode_value}'. "
                f"Allowed values are: [{valid_list}]"
            )
        
        # =================================================================
        # Contract Check 8: Strict resolution validation
        # =================================================================
        resolution = data["resolution"].lower()
        # Allow named resolutions or WxH pattern
        import re
        is_named = resolution in VALID_RESOLUTIONS
        is_explicit = bool(re.match(r"^\d+x\d+$", resolution))
        if not is_named and not is_explicit:
            valid_list = ", ".join(sorted(VALID_RESOLUTIONS))
            raise JobSpecValidationError(
                f"Invalid resolution '{data['resolution']}'. "
                f"Must be one of [{valid_list}] or explicit WIDTHxHEIGHT (e.g., '1920x1080')"
            )
        
        # =================================================================
        # All checks passed - construct JobSpec
        # =================================================================
        if isinstance(fps_mode_value, str):
            fps_mode = FpsMode(fps_mode_value)
        else:
            fps_mode = fps_mode_value
        
        return cls(
            job_id=data.get("job_id", uuid.uuid4().hex[:8]),
            sources=list(data["sources"]),
            output_directory=data["output_directory"],
            codec=data["codec"],
            container=data["container"],
            resolution=data["resolution"],
            fps_mode=fps_mode,
            fps_explicit=data.get("fps_explicit"),
            resolve_preset=data.get("resolve_preset"),
            proxy_profile=data.get("proxy_profile"),
            requires_resolve_edition=data.get("requires_resolve_edition", "either"),
            naming_template=data["naming_template"],
            resolved_tokens=data.get("resolved_tokens", {}),
            created_at=data.get("created_at", datetime.now(timezone.utc).isoformat()),
            # LUT fields
            lut_id=data.get("lut_id"),
            lut_applied=data.get("lut_applied", False),
            lut_engine=data.get("lut_engine"),
            # Phase 9A: Explicit Execution Control (default False = no auto-execute)
            execution_requested=data.get("execution_requested", False),
        )
    
    @classmethod
    def from_json(cls, json_str: str) -> "JobSpec":
        """
        Deserialize JobSpec from a JSON string.
        
        Args:
            json_str: JSON string containing JobSpec data.
            
        Returns:
            New JobSpec instance.
        """
        return cls.from_dict(json.loads(json_str))
    
    # -------------------------------------------------------------------------
    # Validation
    # -------------------------------------------------------------------------
    
    # Known valid codec/container combinations
    # NOTE: DNxHD is MXF-only (industry standard). DNxHR supports MOV and MXF.
    VALID_CODEC_CONTAINERS: ClassVar[Dict[str, List[str]]] = {
        "prores_proxy": ["mov"],
        "prores_lt": ["mov"],
        "prores_standard": ["mov"],
        "prores_hq": ["mov"],
        "prores_4444": ["mov"],
        "h264": ["mp4", "mov", "mkv"],
        "h265": ["mp4", "mov", "mkv"],
        "hevc": ["mp4", "mov", "mkv"],
        "dnxhd": ["mxf"],  # DNxHD = MXF only (broadcast standard)
        "dnxhr": ["mov", "mxf"],  # DNxHR supports MOV and MXF
        "vp9": ["webm", "mkv"],
        "av1": ["mp4", "mkv", "webm"],
    }
    
    # Known naming template tokens
    KNOWN_TOKENS: ClassVar[List[str]] = [
        "{source_name}",
        "{source_ext}",
        "{job_id}",
        "{date}",
        "{time}",
        "{index}",
        "{codec}",
        "{resolution}",
    ]
    
    def validate_paths_exist(self) -> None:
        """
        Validate that all source paths exist and output directory is writable.
        
        Raises:
            JobSpecValidationError: If any path validation fails.
        """
        errors: List[str] = []
        
        # Validate source files exist
        for source in self.sources:
            source_path = Path(source)
            if not source_path.exists():
                errors.append(f"Source file does not exist: {source}")
            elif not source_path.is_file():
                errors.append(f"Source path is not a file: {source}")
        
        # Validate output directory
        output_path = Path(self.output_directory)
        if not output_path.exists():
            errors.append(f"Output directory does not exist: {self.output_directory}")
        elif not output_path.is_dir():
            errors.append(f"Output path is not a directory: {self.output_directory}")
        
        if errors:
            raise JobSpecValidationError(
                f"Path validation failed with {len(errors)} error(s):\n" +
                "\n".join(f"  - {e}" for e in errors)
            )
    
    def validate_codec_container(self) -> None:
        """
        Validate that the codec/container combination is valid.
        
        DNxHD/DNxHR Container Rules:
        - DNxHD: MXF only (industry standard for broadcast/editorial)
        - DNxHR: MXF or MOV (modern codec with cross-platform support)
        
        Raises:
            JobSpecValidationError: If the combination is invalid.
        """
        codec_lower = self.codec.lower()
        container_lower = self.container.lower().lstrip(".")
        
        if codec_lower not in self.VALID_CODEC_CONTAINERS:
            valid_codecs = ", ".join(sorted(self.VALID_CODEC_CONTAINERS.keys()))
            raise JobSpecValidationError(
                f"Unknown codec '{self.codec}'. Valid codecs are: {valid_codecs}"
            )
        
        valid_containers = self.VALID_CODEC_CONTAINERS[codec_lower]
        if container_lower not in valid_containers:
            # Special error message for DNxHD+MOV (common mistake)
            if codec_lower == "dnxhd" and container_lower == "mov":
                raise JobSpecValidationError(
                    "DNxHD must be wrapped in MXF. DNxHD-in-MOV is non-standard and unsupported. "
                    "Use MXF container for DNxHD output, or switch to DNxHR which supports MOV. "
                    "Reason: DNxHD in MOV causes relinking issues in Avid Media Composer and "
                    "may not be recognized by broadcast QC systems."
                )
            raise JobSpecValidationError(
                f"Invalid container '{self.container}' for codec '{self.codec}'. "
                f"Valid containers for {self.codec}: {', '.join(valid_containers)}"
            )
    
    def validate_naming_tokens_resolvable(self) -> None:
        """
        Validate that all tokens in the naming template are known/resolvable.
        
        Raises:
            JobSpecValidationError: If unknown tokens are found.
        """
        import re
        
        # Extract all tokens from template
        token_pattern = r"\{[^}]+\}"
        found_tokens = re.findall(token_pattern, self.naming_template)
        
        unknown_tokens: List[str] = []
        for token in found_tokens:
            if token not in self.KNOWN_TOKENS:
                unknown_tokens.append(token)
        
        if unknown_tokens:
            known_list = ", ".join(self.KNOWN_TOKENS)
            raise JobSpecValidationError(
                f"Unknown tokens in naming template: {', '.join(unknown_tokens)}. "
                f"Known tokens: {known_list}"
            )
    
    def validate_fps_mode(self) -> None:
        """
        Validate FPS mode configuration.
        
        Raises:
            JobSpecValidationError: If fps_mode is EXPLICIT but fps_explicit is not set.
        """
        if self.fps_mode == FpsMode.EXPLICIT and self.fps_explicit is None:
            raise JobSpecValidationError(
                "fps_mode is 'explicit' but fps_explicit value is not set. "
                "Provide a numeric frame rate value (e.g., 24.0, 29.97, 30.0)."
            )
        
        if self.fps_explicit is not None and self.fps_explicit <= 0:
            raise JobSpecValidationError(
                f"fps_explicit must be a positive number, got: {self.fps_explicit}"
            )
    
    def validate_resolve_preset(self, routes_to_resolve: bool = False) -> None:
        """
        Validate resolve_preset field based on job routing.
        
        V2 Deterministic Resolve Preset Contract
        =========================================
        Resolve must NEVER silently choose a render format. This validation
        enforces explicit preset declaration:
        
        - If job routes to Resolve: resolve_preset MUST be present
        - If job routes to FFmpeg: resolve_preset MUST be None
        
        Args:
            routes_to_resolve: Whether this job will be processed by Resolve engine.
                              This is determined by source format capability routing.
        
        Raises:
            JobSpecValidationError: If preset requirement is violated.
        """
        if routes_to_resolve:
            # Resolve jobs MUST specify a preset
            if self.resolve_preset is None or self.resolve_preset.strip() == "":
                raise JobSpecValidationError(
                    "Resolve jobs must specify resolve_preset (e.g., 'ProRes 422 Proxy'). "
                    "The preset determines the exact output format and quality. "
                    "Create the preset in Resolve: Preferences → System → Render Presets, "
                    "or use an existing preset like 'ProRes 422 Proxy', 'H.264 Master', etc."
                )
        else:
            # FFmpeg jobs MUST NOT specify a preset
            if self.resolve_preset is not None:
                raise JobSpecValidationError(
                    f"FFmpeg jobs must not specify resolve_preset (got: '{self.resolve_preset}'). "
                    "The resolve_preset field is only valid for jobs that route to Resolve engine. "
                    "Remove the resolve_preset field or change source format to a RAW format."
                )
    
    def validate_proxy_profile(self, routes_to_resolve: bool = False) -> None:
        """
        Validate proxy_profile field and ensure it matches engine routing.
        
        V2 Step 5: Canonical Proxy Profiles
        ====================================
        All V2 jobs MUST specify a proxy profile. The profile determines:
        - Which execution engine to use (FFmpeg vs Resolve)
        - Codec, container, resolution, and audio settings
        
        This validation ensures:
        - proxy_profile is present and valid
        - Profile's engine matches the job's engine routing
        - RAW jobs use Resolve profiles
        - Non-RAW jobs use FFmpeg profiles
        
        Args:
            routes_to_resolve: Whether this job will be processed by Resolve engine
        
        Raises:
            JobSpecValidationError: If proxy profile validation fails
        """
        # Import here to avoid circular dependency
        try:
            from v2.proxy_profiles import get_profile, validate_profile_for_engine, ProxyProfileError
        except ImportError:
            try:
                from backend.v2.proxy_profiles import get_profile, validate_profile_for_engine, ProxyProfileError
            except ImportError:
                # Proxy profiles module not available, skip validation
                return
        
        # V2 requirement: proxy_profile MUST be present
        if self.proxy_profile is None or self.proxy_profile.strip() == "":
            raise JobSpecValidationError(
                "V2 jobs must specify proxy_profile. "
                "Proxy profiles are the ONLY way to define proxy output settings. "
                "Choose a profile like 'proxy_h264_low' (FFmpeg) or 'proxy_prores_proxy_resolve' (Resolve). "
                "Run 'python -m backend.v2.proxy_profiles' to list all available profiles."
            )
        
        # Validate profile exists
        try:
            profile = get_profile(self.proxy_profile)
        except ProxyProfileError as e:
            raise JobSpecValidationError(
                f"Invalid proxy_profile: {e}"
            )
        
        # Validate profile matches engine routing
        engine_name = "resolve" if routes_to_resolve else "ffmpeg"
        try:
            validate_profile_for_engine(self.proxy_profile, engine_name)
        except ProxyProfileError as e:
            raise JobSpecValidationError(
                f"Proxy profile mismatch: {e}"
            )
    
    def validate_sources(self) -> None:
        """
        Validate that sources list is non-empty.
        
        A JobSpec must have at least one source file to be valid.
        This validation is separate from path existence checks.
        
        Raises:
            JobSpecValidationError: If sources list is empty.
        """
        if not self.sources:
            raise JobSpecValidationError(
                "JobSpec must have at least one source file. "
                "The sources list cannot be empty."
            )
    
    def validate_multi_clip_naming(self) -> None:
        """
        Validate that multi-clip jobs have deterministic, unique output names.
        
        V2 Phase 1 Hardening: Output Name Uniqueness
        ============================================
        For jobs with multiple source clips, we MUST ensure that each clip
        produces a unique output filename. Otherwise, later clips would
        overwrite earlier ones, causing silent data loss.
        
        This validation enforces that multi-clip jobs use either:
        1. {index} token in the naming template (preferred)
        2. {source_name} token to differentiate by source filename
        
        Single-clip jobs are exempt from this requirement.
        
        Raises:
            JobSpecValidationError: If multi-clip job has ambiguous naming.
        """
        # Skip validation for single-clip jobs
        if len(self.sources) <= 1:
            return
        
        # Multi-clip job: require {index} or {source_name} token
        required_tokens = ["{index}", "{source_name}"]
        has_required_token = any(token in self.naming_template for token in required_tokens)
        
        if not has_required_token:
            raise JobSpecValidationError(
                "Multi-clip jobs must include either {index} or {source_name} in naming_template "
                "to ensure unique output filenames. Without these tokens, clips would overwrite "
                f"each other. Job has {len(self.sources)} sources but naming template is: "
                f"'{self.naming_template}'. Add {{index}} for sequential numbering (001, 002...) "
                "or {source_name} to use source filenames."
            )
    
    def validate_source_capabilities(self) -> None:
        """
        Validate that all source files use supported container/codec combinations.
        
        V2 Source Capability Matrix Enforcement
        =======================================
        Proxx explicitly defines which source formats are supported and which are
        rejected. This validation uses ffprobe to detect the container and codec
        of each source file, then checks against the capability matrix.
        
        Rejected formats (e.g., ARRIRAW, REDCODE, BRAW) will fail with an
        actionable error message suggesting the appropriate upstream workflow.
        
        This validation is called BEFORE execution to prevent wasted processing
        time on formats that cannot be decoded.
        
        Raises:
            JobSpecValidationError: If any source uses an unsupported format.
                The error message includes the specific reason and recommended action.
        """
        if not _SOURCE_CAPABILITIES_AVAILABLE:
            # Source capabilities module not available, skip validation
            return
        
        for source in self.sources:
            source_path = Path(source)
            if not source_path.exists():
                # Path validation is handled separately
                continue
            
            # Probe the source file for container and codec
            probe_result = self._probe_source_format(source_path)
            if probe_result is None:
                # Could not probe, skip capability check (let execution handle it)
                continue
            
            container, codec = probe_result
            
            try:
                validate_source_capability(container, codec)
            except SourceCapabilityError as e:
                raise JobSpecValidationError(
                    f"Source format not supported: {source_path.name}\n"
                    f"  Container: {container}\n"
                    f"  Codec: {codec}\n"
                    f"  Reason: {e.reason}\n"
                    f"  Action: {e.recommended_action}"
                )
    
    def _probe_source_format(self, source_path: Path) -> Optional[Tuple[str, str]]:
        """
        Probe a source file to determine its container and codec.
        
        Uses ffprobe to extract format (container) and video codec information.
        This is the ONLY probing logic - just container + codec, nothing more.
        
        Args:
            source_path: Path to the source file.
            
        Returns:
            Tuple of (container, codec) if successful, None if probing fails.
        """
        try:
            # Get container format
            format_cmd = [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                str(source_path),
            ]
            
            result = subprocess.run(
                format_cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )
            
            if result.returncode != 0:
                return None
            
            import json as json_module
            probe_data = json_module.loads(result.stdout)
            
            # Extract container format
            format_name = probe_data.get("format", {}).get("format_name", "")
            # Take first format if multiple (e.g., "mov,mp4,m4a,3gp,3g2,mj2" -> "mov")
            container = format_name.split(",")[0].lower()
            
            # Extract video codec from first video stream
            codec = None
            for stream in probe_data.get("streams", []):
                if stream.get("codec_type") == "video":
                    codec = stream.get("codec_name", "").lower()
                    break
            
            if not codec:
                return None
            
            return (container, codec)
            
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, json.JSONDecodeError):
            return None
        except FileNotFoundError:
            # ffprobe not available
            return None

    def validate_lut(self, routes_to_resolve: bool = False) -> None:
        """
        Validate LUT configuration if lut_id is specified.
        
        LUT Validation Contract
        =======================
        If a LUT is specified (lut_id is not None):
        1. The LUT MUST be registered in the LUT registry
        2. The LUT file MUST exist at the registered path
        3. The LUT file hash MUST match the registered hash
        4. The LUT format MUST be compatible with the execution engine
        
        Args:
            routes_to_resolve: Whether this job will be processed by Resolve engine.
                              Determines which LUT formats are acceptable.
        
        Raises:
            JobSpecValidationError: If LUT validation fails.
        """
        # No LUT specified - nothing to validate
        if self.lut_id is None:
            return
        
        # Import LUT registry
        try:
            from lut_registry import (
                validate_lut_for_engine,
                LUTNotFoundError,
                LUTFileNotFoundError,
                LUTHashMismatchError,
                LUTEngineCompatibilityError,
            )
        except ImportError:
            try:
                from backend.lut_registry import (
                    validate_lut_for_engine,
                    LUTNotFoundError,
                    LUTFileNotFoundError,
                    LUTHashMismatchError,
                    LUTEngineCompatibilityError,
                )
            except ImportError:
                raise JobSpecValidationError(
                    f"LUT registry module not available. Cannot validate lut_id='{self.lut_id}'. "
                    "Ensure backend/lut_registry.py is present."
                )
        
        # Determine engine for compatibility check
        engine = "resolve" if routes_to_resolve else "ffmpeg"
        
        try:
            validate_lut_for_engine(self.lut_id, engine)
        except LUTNotFoundError as e:
            raise JobSpecValidationError(
                f"LUT not registered: {e}. "
                "LUTs must be explicitly registered before use. "
                "Use 'python backend/lut_registry.py register <path>' to register."
            )
        except LUTFileNotFoundError as e:
            raise JobSpecValidationError(
                f"LUT file missing: {e}. "
                "The LUT was registered but the file no longer exists."
            )
        except LUTHashMismatchError as e:
            raise JobSpecValidationError(
                f"LUT file modified: {e}. "
                "The LUT file has changed since registration. Re-register if intentional."
            )
        except LUTEngineCompatibilityError as e:
            raise JobSpecValidationError(
                f"LUT incompatible with engine: {e}. "
                f"This job routes to {engine} which has specific format requirements."
            )

    def validate(self, check_paths: bool = True) -> None:
        """
        Run all validation checks.
        
        Args:
            check_paths: Whether to validate that paths exist (default: True).
                        Set to False for dry-run or pre-flight checks.
        
        Raises:
            JobSpecValidationError: If any validation fails.
        """
        # Always validate these - sources must not be empty
        self.validate_sources()
        self.validate_codec_container()
        self.validate_naming_tokens_resolvable()
        self.validate_fps_mode()
        self.validate_multi_clip_naming()  # V2 Phase 1: Enforce unique output names
        
        # Note: proxy_profile validation is deferred to execution time when
        # engine routing is determined. See execute_multi_job_spec() in headless_execute.py
        
        # Optionally validate paths (checks all sources exist)
        if check_paths:
            self.validate_paths_exist()
            # V2: Validate source formats AFTER confirming files exist
            self.validate_source_capabilities()
    
    # -------------------------------------------------------------------------
    # Utility
    # -------------------------------------------------------------------------
    
    def __repr__(self) -> str:
        return (
            f"JobSpec(job_id={self.job_id!r}, "
            f"sources=[{len(self.sources)} files], "
            f"codec={self.codec!r}, "
            f"container={self.container!r})"
        )

    
    # -------------------------------------------------------------------------
    # Validation
    # -------------------------------------------------------------------------
    
    # NOTE: DNxHD is MXF-only (industry standard). DNxHR supports MOV and MXF.
    VALID_CODEC_CONTAINERS: ClassVar[Dict[str, List[str]]] = {
        "prores_proxy": ["mov"],
        "prores_lt": ["mov"],
        "prores_standard": ["mov"],
        "prores_hq": ["mov"],
        "prores_4444": ["mov"],
        "h264": ["mp4", "mov", "mkv"],
        "h265": ["mp4", "mov", "mkv"],
        "hevc": ["mp4", "mov", "mkv"],
        "dnxhd": ["mxf"],  # DNxHD = MXF only (broadcast standard)
        "dnxhr": ["mov", "mxf"],  # DNxHR supports MOV and MXF
        "vp9": ["webm", "mkv"],
        "av1": ["mp4", "mkv", "webm"],
    }
    
    KNOWN_TOKENS: ClassVar[List[str]] = [
        "{source_name}",
        "{source_ext}",
        "{job_id}",
        "{date}",
        "{time}",
        "{index}",
        "{codec}",
        "{resolution}",
    ]
    
    def validate_paths_exist(self) -> None:
        """Validate that all source paths exist and output directory is writable."""
        errors: List[str] = []
        for source in self.sources:
            source_path = Path(source)
            if not source_path.exists():
                errors.append(f"Source file does not exist: {source}")
            elif not source_path.is_file():
                errors.append(f"Source path is not a file: {source}")
        output_path = Path(self.output_directory)
        if not output_path.exists():
            errors.append(f"Output directory does not exist: {self.output_directory}")
        elif not output_path.is_dir():
            errors.append(f"Output path is not a directory: {self.output_directory}")
        if errors:
            raise JobSpecValidationError(
                f"Path validation failed with {len(errors)} error(s):\n" +
                "\n".join(f"  - {e}" for e in errors)
            )
    
    def validate_codec_container(self) -> None:
        """Validate that the codec/container combination is valid."""
        codec_lower = self.codec.lower()
        container_lower = self.container.lower().lstrip(".")
        if codec_lower not in self.VALID_CODEC_CONTAINERS:
            valid_codecs = ", ".join(sorted(self.VALID_CODEC_CONTAINERS.keys()))
            raise JobSpecValidationError(
                f"Unknown codec '{self.codec}'. Valid codecs are: {valid_codecs}"
            )
        valid_containers = self.VALID_CODEC_CONTAINERS[codec_lower]
        if container_lower not in valid_containers:
            # Special error message for DNxHD+MOV (common mistake)
            if codec_lower == "dnxhd" and container_lower == "mov":
                raise JobSpecValidationError(
                    "DNxHD must be wrapped in MXF. DNxHD-in-MOV is non-standard and unsupported. "
                    "Use MXF container for DNxHD output, or switch to DNxHR which supports MOV."
                )
            raise JobSpecValidationError(
                f"Invalid container '{self.container}' for codec '{self.codec}'. "
                f"Valid containers for {self.codec}: {', '.join(valid_containers)}"
            )
    
    def validate_naming_tokens_resolvable(self) -> None:
        """Validate that all tokens in the naming template are known/resolvable."""
        token_pattern = r"\{[^}]+\}"
        found_tokens = re.findall(token_pattern, self.naming_template)
        unknown_tokens: List[str] = []
        for token in found_tokens:
            if token not in self.KNOWN_TOKENS:
                unknown_tokens.append(token)
        if unknown_tokens:
            known_list = ", ".join(self.KNOWN_TOKENS)
            raise JobSpecValidationError(
                f"Unknown tokens in naming template: {', '.join(unknown_tokens)}. "
                f"Known tokens: {known_list}"
            )
    
    def validate_sources(self) -> None:
        """Validate that sources list is non-empty."""
        if not self.sources:
            raise JobSpecValidationError(
                "JobSpec must have at least one source file. "
                "The sources list cannot be empty."
            )
    
    def validate_multi_clip_naming(self) -> None:
        """Validate that multi-clip jobs have deterministic, unique output names."""
        if len(self.sources) <= 1:
            return
        required_tokens = ["{index}", "{source_name}"]
        has_required_token = any(token in self.naming_template for token in required_tokens)
        if not has_required_token:
            raise JobSpecValidationError(
                "Multi-clip jobs must include either {index} or {source_name} in naming_template "
                "to ensure unique output filenames."
            )
    
    def validate_fps_mode(self) -> None:
        """Validate FPS mode configuration."""
        if self.fps_mode == FpsMode.EXPLICIT and self.fps_explicit is None:
            raise JobSpecValidationError(
                "fps_mode is 'explicit' but fps_explicit value is not set."
            )
        if self.fps_explicit is not None and self.fps_explicit <= 0:
            raise JobSpecValidationError(
                f"fps_explicit must be a positive number, got: {self.fps_explicit}"
            )
    
    def validate(self, check_paths: bool = True) -> None:
        """Run all validation checks."""
        self.validate_sources()
        self.validate_codec_container()
        self.validate_naming_tokens_resolvable()
        self.validate_fps_mode()
        self.validate_multi_clip_naming()
        if check_paths:
            self.validate_paths_exist()
    
    def __repr__(self) -> str:
        return (
            f"JobSpec(job_id={self.job_id!r}, "
            f"sources=[{len(self.sources)} files], "
            f"codec={self.codec!r}, "
            f"container={self.container!r})"
        )
