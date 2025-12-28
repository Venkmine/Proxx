"""
V2 Headless Execution - Execute JobSpec without UI involvement.

This module provides a parallel execution path for V2 Phase 1.
It executes validated JobSpec instances using existing FFmpeg engine helpers.

Design principles:
- NO UI involvement
- NO modification to V1 execution paths
- Synchronous execution (for now)
- Structured result reporting
- Explicit error propagation (no swallowing, no retries)

This enables future automation scenarios:
- Watch folder processing
- Batch queue processing
- CI/CD integration testing
- Scripted workflows
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
import json
import os
import shutil
import subprocess
import sys

from job_spec import JobSpec, JobSpecValidationError, FpsMode


# -----------------------------------------------------------------------------
# Result Structure
# -----------------------------------------------------------------------------

@dataclass
class ExecutionResult:
    """
    Structured result of headless JobSpec execution.
    
    Captures everything needed to:
    - Determine success/failure
    - Debug issues
    - Integrate with automation systems
    """
    
    job_id: str
    """JobSpec job_id that was executed."""
    
    ffmpeg_command: List[str]
    """Complete FFmpeg command that was invoked."""
    
    exit_code: int
    """FFmpeg process exit code (0 = success)."""
    
    stdout: str
    """Captured stdout from FFmpeg."""
    
    stderr: str
    """Captured stderr from FFmpeg (contains progress/errors)."""
    
    output_path: str
    """Resolved output file path."""
    
    output_exists: bool
    """Whether output file exists after execution."""
    
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    """When execution started (UTC)."""
    
    completed_at: Optional[datetime] = None
    """When execution completed (UTC)."""
    
    @property
    def success(self) -> bool:
        """Check if execution was successful."""
        return self.exit_code == 0 and self.output_exists
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """Execution duration in seconds."""
        if self.completed_at is None:
            return None
        return (self.completed_at - self.started_at).total_seconds()
    
    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON output."""
        return {
            "job_id": self.job_id,
            "success": self.success,
            "exit_code": self.exit_code,
            "output_path": self.output_path,
            "output_exists": self.output_exists,
            "ffmpeg_command": self.ffmpeg_command,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": self.duration_seconds,
        }
    
    def summary(self) -> str:
        """Concise human-readable summary."""
        status = "SUCCESS" if self.success else "FAILED"
        duration = f" ({self.duration_seconds:.1f}s)" if self.duration_seconds else ""
        return f"[{status}] Job {self.job_id}{duration} → {self.output_path}"


# -----------------------------------------------------------------------------
# FFmpeg Codec/Container Mappings (subset from engine)
# -----------------------------------------------------------------------------

FFMPEG_CODEC_MAP = {
    "h264": ["-c:v", "libx264"],
    "h265": ["-c:v", "libx265", "-tag:v", "hvc1"],
    "hevc": ["-c:v", "libx265", "-tag:v", "hvc1"],
    "av1": ["-c:v", "libaom-av1", "-cpu-used", "4"],
    "prores_proxy": ["-c:v", "prores_ks", "-profile:v", "0"],
    "prores_lt": ["-c:v", "prores_ks", "-profile:v", "1"],
    "prores_standard": ["-c:v", "prores_ks", "-profile:v", "2"],
    "prores_hq": ["-c:v", "prores_ks", "-profile:v", "3"],
    "prores_4444": ["-c:v", "prores_ks", "-profile:v", "4"],
    "dnxhd": ["-c:v", "dnxhd"],
    "dnxhr": ["-c:v", "dnxhd", "-profile:v", "dnxhr_hq"],
    "vp9": ["-c:v", "libvpx-vp9"],
}


# -----------------------------------------------------------------------------
# Path and Token Resolution
# -----------------------------------------------------------------------------

def _find_ffmpeg() -> Optional[str]:
    """Find FFmpeg binary path."""
    # Try PATH first
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        return ffmpeg_path
    
    # Common install locations
    common_paths = [
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
    ]
    for path in common_paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    
    return None


def _resolve_naming_tokens(
    template: str,
    source_path: Path,
    job_spec: JobSpec,
    index: int = 0,
) -> str:
    """
    Resolve naming template tokens to final filename (without extension).
    
    Supported tokens:
    - {source_name}: Source filename without extension
    - {source_ext}: Source file extension (without dot)
    - {job_id}: JobSpec job_id
    - {date}: Current date (YYYYMMDD)
    - {time}: Current time (HHMMSS)
    - {index}: File index (for multi-source jobs)
    - {codec}: Output codec
    - {resolution}: Target resolution string
    """
    now = datetime.now()
    
    token_values = {
        "source_name": source_path.stem,
        "source_ext": source_path.suffix.lstrip("."),
        "job_id": job_spec.job_id,
        "date": now.strftime("%Y%m%d"),
        "time": now.strftime("%H%M%S"),
        "index": str(index).zfill(3),
        "codec": job_spec.codec,
        "resolution": job_spec.resolution,
    }
    
    result = template
    for token, value in token_values.items():
        result = result.replace(f"{{{token}}}", value)
    
    # Clean up any double underscores from empty tokens
    while "__" in result:
        result = result.replace("__", "_")
    
    return result.strip("_") or source_path.stem


def _resolve_output_path(
    source_path: Path,
    job_spec: JobSpec,
    index: int = 0,
) -> Path:
    """
    Resolve output path for a source file.
    
    Uses:
    - job_spec.output_directory as base
    - job_spec.naming_template for filename
    - job_spec.container for extension
    """
    output_dir = Path(job_spec.output_directory)
    
    # Resolve filename from template
    filename = _resolve_naming_tokens(
        template=job_spec.naming_template,
        source_path=source_path,
        job_spec=job_spec,
        index=index,
    )
    
    # Add container extension
    extension = job_spec.container.lstrip(".")
    output_filename = f"{filename}.{extension}"
    
    return output_dir / output_filename


def _build_ffmpeg_command(
    ffmpeg_path: str,
    source_path: str,
    output_path: str,
    job_spec: JobSpec,
) -> List[str]:
    """
    Build FFmpeg command from JobSpec.
    
    Uses existing codec mappings. Does NOT modify engine internals.
    """
    cmd = [ffmpeg_path, "-y"]  # -y to overwrite output
    
    # Input file
    cmd.extend(["-i", source_path])
    
    # Video codec
    codec_lower = job_spec.codec.lower()
    if codec_lower in FFMPEG_CODEC_MAP:
        cmd.extend(FFMPEG_CODEC_MAP[codec_lower])
    else:
        # Fallback to H.264
        cmd.extend(["-c:v", "libx264", "-crf", "23", "-preset", "medium"])
    
    # Resolution handling
    resolution = job_spec.resolution.lower()
    if resolution == "half":
        cmd.extend(["-vf", "scale=iw/2:ih/2"])
    elif resolution == "quarter":
        cmd.extend(["-vf", "scale=iw/4:ih/4"])
    elif "x" in resolution:
        # Explicit resolution like "1920x1080"
        parts = resolution.split("x")
        if len(parts) == 2:
            try:
                width, height = int(parts[0]), int(parts[1])
                cmd.extend(["-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease"])
            except ValueError:
                pass  # Invalid resolution, skip filter
    # "same" or unrecognized = no scaling
    
    # Frame rate handling
    if job_spec.fps_mode == FpsMode.EXPLICIT and job_spec.fps_explicit:
        cmd.extend(["-r", str(job_spec.fps_explicit)])
    
    # Audio: copy by default (preserves original)
    cmd.extend(["-c:a", "copy"])
    
    # Output file
    cmd.append(output_path)
    
    return cmd


# -----------------------------------------------------------------------------
# Main Execution Function
# -----------------------------------------------------------------------------

def execute_job_spec(job_spec: JobSpec) -> ExecutionResult:
    """
    Execute a validated JobSpec without UI involvement.
    
    This function:
    1. Validates the JobSpec
    2. Resolves output paths deterministically
    3. Builds FFmpeg command using existing helpers
    4. Executes synchronously
    5. Captures full execution context
    
    Args:
        job_spec: A complete JobSpec instance
        
    Returns:
        ExecutionResult with all execution details
        
    Raises:
        JobSpecValidationError: If JobSpec validation fails
        
    Note:
        - Execution failures do NOT raise exceptions
        - Check result.success or result.exit_code
    """
    # Step 1: Validate JobSpec (raises on failure)
    job_spec.validate(check_paths=True)
    
    # Step 2: Find FFmpeg
    ffmpeg_path = _find_ffmpeg()
    if not ffmpeg_path:
        raise JobSpecValidationError("FFmpeg not found. Install FFmpeg to use headless execution.")
    
    # Step 3: Resolve paths (use first source for V2 Phase 1)
    # Future: Multi-source execution in V2 Phase 2+
    if not job_spec.sources:
        raise JobSpecValidationError("JobSpec has no source files")
    
    source_path = Path(job_spec.sources[0])
    output_path = _resolve_output_path(source_path, job_spec, index=0)
    
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Step 4: Build command
    ffmpeg_command = _build_ffmpeg_command(
        ffmpeg_path=ffmpeg_path,
        source_path=str(source_path),
        output_path=str(output_path),
        job_spec=job_spec,
    )
    
    # Step 5: Execute synchronously
    started_at = datetime.now(timezone.utc)
    
    try:
        process = subprocess.run(
            ffmpeg_command,
            capture_output=True,
            text=True,
            timeout=3600,  # 1 hour timeout for long renders
        )
        exit_code = process.returncode
        stdout = process.stdout
        stderr = process.stderr
    except subprocess.TimeoutExpired:
        exit_code = -1
        stdout = ""
        stderr = "Execution timed out after 3600 seconds"
    except Exception as e:
        exit_code = -1
        stdout = ""
        stderr = f"Execution failed: {e}"
    
    completed_at = datetime.now(timezone.utc)
    
    # Step 6: Check output exists
    output_exists = output_path.is_file()
    
    return ExecutionResult(
        job_id=job_spec.job_id,
        ffmpeg_command=ffmpeg_command,
        exit_code=exit_code,
        stdout=stdout,
        stderr=stderr,
        output_path=str(output_path),
        output_exists=output_exists,
        started_at=started_at,
        completed_at=completed_at,
    )


# -----------------------------------------------------------------------------
# CLI Entry Point
# -----------------------------------------------------------------------------

def main():
    """
    CLI entry point for headless execution.
    
    Usage:
        python -m backend.headless_execute <path_to_jobspec.json>
    
    Prints concise summary and exits with appropriate code.
    """
    if len(sys.argv) < 2:
        print("Usage: python -m backend.headless_execute <path_to_jobspec.json>", file=sys.stderr)
        sys.exit(1)
    
    jobspec_path = sys.argv[1]
    
    # Load JobSpec from JSON
    try:
        with open(jobspec_path, "r") as f:
            data = json.load(f)
        job_spec = JobSpec.from_dict(data)
    except FileNotFoundError:
        print(f"Error: JobSpec file not found: {jobspec_path}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {jobspec_path}: {e}", file=sys.stderr)
        sys.exit(1)
    except (KeyError, ValueError) as e:
        print(f"Error: Invalid JobSpec structure: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Execute
    try:
        result = execute_job_spec(job_spec)
    except JobSpecValidationError as e:
        print(f"Validation Error: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Print summary
    print(result.summary())
    
    # Print key details
    if result.success:
        print(f"  Output: {result.output_path}")
        if result.duration_seconds:
            print(f"  Duration: {result.duration_seconds:.1f}s")
    else:
        print(f"  Exit Code: {result.exit_code}")
        # Print last 5 lines of stderr for quick debugging
        stderr_lines = result.stderr.strip().split("\n")
        if stderr_lines:
            print("  Last stderr lines:")
            for line in stderr_lines[-5:]:
                print(f"    {line}")
    
    # Exit with appropriate code
    sys.exit(0 if result.success else 1)


if __name__ == "__main__":
    main()
