"""
Golden Render Expectations - Invariant verification for proxy outputs.

This module defines the expectation checks used by the golden render verification suite.
Each expectation verifies an objective, measurable property of the rendered proxy.

Design Principles:
==================
1. Invariants only - no subjective quality assessment
2. Explicit failures - clear messages for every failure
3. No auto-correction - failures require human intervention
4. No tolerance creep - thresholds are fixed and documented

Usage:
======
    from expectations import ExpectationRunner
    
    runner = ExpectationRunner(source_probe, proxy_probe)
    results = runner.run_expectations(["duration_matches", "frame_count_matches"])
    
    for result in results:
        if not result.passed:
            print(f"FAILED: {result.expectation} - {result.reason}")
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable
import json
import subprocess
import shutil


# =============================================================================
# Expectation Result
# =============================================================================

@dataclass
class ExpectationResult:
    """Result of a single expectation check."""
    
    expectation: str
    """Name of the expectation that was checked."""
    
    passed: bool
    """Whether the expectation passed."""
    
    reason: str
    """Human-readable explanation of the result."""
    
    source_value: Optional[Any] = None
    """Value observed in source (if applicable)."""
    
    proxy_value: Optional[Any] = None
    """Value observed in proxy (if applicable)."""
    
    threshold: Optional[Any] = None
    """Threshold used for comparison (if applicable)."""
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "expectation": self.expectation,
            "passed": self.passed,
            "reason": self.reason,
            "source_value": self.source_value,
            "proxy_value": self.proxy_value,
            "threshold": self.threshold,
        }


# =============================================================================
# Probe Functions
# =============================================================================

def probe_file(path: Path) -> Optional[Dict[str, Any]]:
    """
    Probe a media file using ffprobe and return structured data.
    
    Returns None if ffprobe fails.
    """
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    
    try:
        result = subprocess.run(
            [
                ffprobe,
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        if result.returncode != 0:
            return None
        
        return json.loads(result.stdout)
    
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        return None


def get_video_stream(probe: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Extract the first video stream from probe data."""
    streams = probe.get("streams", [])
    for stream in streams:
        if stream.get("codec_type") == "video":
            return stream
    return None


def get_audio_stream(probe: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Extract the first audio stream from probe data."""
    streams = probe.get("streams", [])
    for stream in streams:
        if stream.get("codec_type") == "audio":
            return stream
    return None


def get_audio_streams(probe: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract all audio streams from probe data."""
    streams = probe.get("streams", [])
    return [s for s in streams if s.get("codec_type") == "audio"]


# =============================================================================
# Individual Expectation Functions
# =============================================================================

def check_duration_matches(
    source_probe: Dict[str, Any],
    proxy_probe: Dict[str, Any],
    **kwargs,
) -> ExpectationResult:
    """
    Verify proxy duration matches source duration (±50ms tolerance).
    
    Tolerance accounts for frame-boundary rounding and container overhead.
    """
    TOLERANCE_MS = 50
    
    source_duration = float(source_probe.get("format", {}).get("duration", 0))
    proxy_duration = float(proxy_probe.get("format", {}).get("duration", 0))
    
    diff_ms = abs(source_duration - proxy_duration) * 1000
    passed = diff_ms <= TOLERANCE_MS
    
    if passed:
        reason = f"Duration matches: source={source_duration:.3f}s, proxy={proxy_duration:.3f}s (diff={diff_ms:.1f}ms)"
    else:
        reason = f"Duration mismatch: source={source_duration:.3f}s, proxy={proxy_duration:.3f}s (diff={diff_ms:.1f}ms exceeds {TOLERANCE_MS}ms tolerance)"
    
    return ExpectationResult(
        expectation="duration_matches",
        passed=passed,
        reason=reason,
        source_value=source_duration,
        proxy_value=proxy_duration,
        threshold=TOLERANCE_MS,
    )


def check_frame_count_matches(
    source_probe: Dict[str, Any],
    proxy_probe: Dict[str, Any],
    **kwargs,
) -> ExpectationResult:
    """
    Verify proxy frame count matches source frame count (exact).
    
    Frame count MUST be exact - any difference breaks edit synchronization.
    """
    source_video = get_video_stream(source_probe)
    proxy_video = get_video_stream(proxy_probe)
    
    if not source_video:
        return ExpectationResult(
            expectation="frame_count_matches",
            passed=False,
            reason="Source has no video stream",
        )
    
    if not proxy_video:
        return ExpectationResult(
            expectation="frame_count_matches",
            passed=False,
            reason="Proxy has no video stream",
        )
    
    # Try nb_frames first, fall back to calculating from duration and fps
    source_frames = source_video.get("nb_frames")
    proxy_frames = proxy_video.get("nb_frames")
    
    if source_frames is None:
        # Calculate from duration and frame rate
        source_duration = float(source_probe.get("format", {}).get("duration", 0))
        source_fps_str = source_video.get("r_frame_rate", "24/1")
        try:
            if "/" in source_fps_str:
                num, den = source_fps_str.split("/")
                source_fps = float(num) / float(den)
            else:
                source_fps = float(source_fps_str)
            source_frames = int(round(source_duration * source_fps))
        except (ValueError, ZeroDivisionError):
            source_frames = None
    else:
        source_frames = int(source_frames)
    
    if proxy_frames is None:
        proxy_duration = float(proxy_probe.get("format", {}).get("duration", 0))
        proxy_fps_str = proxy_video.get("r_frame_rate", "24/1")
        try:
            if "/" in proxy_fps_str:
                num, den = proxy_fps_str.split("/")
                proxy_fps = float(num) / float(den)
            else:
                proxy_fps = float(proxy_fps_str)
            proxy_frames = int(round(proxy_duration * proxy_fps))
        except (ValueError, ZeroDivisionError):
            proxy_frames = None
    else:
        proxy_frames = int(proxy_frames)
    
    if source_frames is None:
        return ExpectationResult(
            expectation="frame_count_matches",
            passed=False,
            reason="Could not determine source frame count",
        )
    
    if proxy_frames is None:
        return ExpectationResult(
            expectation="frame_count_matches",
            passed=False,
            reason="Could not determine proxy frame count",
        )
    
    passed = source_frames == proxy_frames
    
    if passed:
        reason = f"Frame count matches: {source_frames} frames"
    else:
        reason = f"Frame count mismatch: source={source_frames}, proxy={proxy_frames} (diff={abs(source_frames - proxy_frames)})"
    
    return ExpectationResult(
        expectation="frame_count_matches",
        passed=passed,
        reason=reason,
        source_value=source_frames,
        proxy_value=proxy_frames,
    )


def check_start_timecode_matches(
    source_probe: Dict[str, Any],
    proxy_probe: Dict[str, Any],
    **kwargs,
) -> ExpectationResult:
    """
    Verify proxy starts at same timecode as source.
    
    Timecode preservation is critical for NLE attachment.
    """
    # Get timecode from format tags or video stream tags
    source_tc = None
    proxy_tc = None
    
    # Check format tags first
    source_format_tags = source_probe.get("format", {}).get("tags", {})
    proxy_format_tags = proxy_probe.get("format", {}).get("tags", {})
    
    source_tc = source_format_tags.get("timecode") or source_format_tags.get("TIMECODE")
    proxy_tc = proxy_format_tags.get("timecode") or proxy_format_tags.get("TIMECODE")
    
    # Fall back to video stream tags
    if not source_tc:
        source_video = get_video_stream(source_probe)
        if source_video:
            stream_tags = source_video.get("tags", {})
            source_tc = stream_tags.get("timecode") or stream_tags.get("TIMECODE")
    
    if not proxy_tc:
        proxy_video = get_video_stream(proxy_probe)
        if proxy_video:
            stream_tags = proxy_video.get("tags", {})
            proxy_tc = stream_tags.get("timecode") or stream_tags.get("TIMECODE")
    
    if not source_tc:
        return ExpectationResult(
            expectation="start_timecode_matches",
            passed=False,
            reason="Source has no timecode",
            source_value=None,
        )
    
    if not proxy_tc:
        return ExpectationResult(
            expectation="start_timecode_matches",
            passed=False,
            reason="Proxy has no timecode (source has {source_tc})",
            source_value=source_tc,
            proxy_value=None,
        )
    
    passed = source_tc == proxy_tc
    
    if passed:
        reason = f"Timecode matches: {source_tc}"
    else:
        reason = f"Timecode mismatch: source={source_tc}, proxy={proxy_tc}"
    
    return ExpectationResult(
        expectation="start_timecode_matches",
        passed=passed,
        reason=reason,
        source_value=source_tc,
        proxy_value=proxy_tc,
    )


def check_audio_channel_count_matches(
    source_probe: Dict[str, Any],
    proxy_probe: Dict[str, Any],
    **kwargs,
) -> ExpectationResult:
    """
    Verify proxy audio channel count matches source.
    
    Channel layout must be preserved for audio sync.
    """
    source_audio = get_audio_stream(source_probe)
    proxy_audio = get_audio_stream(proxy_probe)
    
    if not source_audio:
        # No source audio is valid - proxy should also have no audio
        if not proxy_audio:
            return ExpectationResult(
                expectation="audio_channel_count_matches",
                passed=True,
                reason="Neither source nor proxy has audio (expected)",
            )
        else:
            return ExpectationResult(
                expectation="audio_channel_count_matches",
                passed=False,
                reason=f"Source has no audio but proxy has {proxy_audio.get('channels', 'unknown')} channels",
            )
    
    if not proxy_audio:
        return ExpectationResult(
            expectation="audio_channel_count_matches",
            passed=False,
            reason=f"Source has {source_audio.get('channels', 'unknown')} audio channels but proxy has none",
        )
    
    source_channels = source_audio.get("channels", 0)
    proxy_channels = proxy_audio.get("channels", 0)
    
    passed = source_channels == proxy_channels
    
    if passed:
        reason = f"Audio channel count matches: {source_channels} channels"
    else:
        reason = f"Audio channel count mismatch: source={source_channels}, proxy={proxy_channels}"
    
    return ExpectationResult(
        expectation="audio_channel_count_matches",
        passed=passed,
        reason=reason,
        source_value=source_channels,
        proxy_value=proxy_channels,
    )


def check_audio_sample_rate_matches(
    source_probe: Dict[str, Any],
    proxy_probe: Dict[str, Any],
    **kwargs,
) -> ExpectationResult:
    """
    Verify proxy audio sample rate matches source.
    
    Sample rate preservation prevents audio drift.
    """
    source_audio = get_audio_stream(source_probe)
    proxy_audio = get_audio_stream(proxy_probe)
    
    if not source_audio:
        if not proxy_audio:
            return ExpectationResult(
                expectation="audio_sample_rate_matches",
                passed=True,
                reason="Neither source nor proxy has audio (expected)",
            )
        else:
            return ExpectationResult(
                expectation="audio_sample_rate_matches",
                passed=False,
                reason="Source has no audio but proxy does",
            )
    
    if not proxy_audio:
        return ExpectationResult(
            expectation="audio_sample_rate_matches",
            passed=False,
            reason="Source has audio but proxy does not",
        )
    
    source_rate = int(source_audio.get("sample_rate", 0))
    proxy_rate = int(proxy_audio.get("sample_rate", 0))
    
    passed = source_rate == proxy_rate
    
    if passed:
        reason = f"Audio sample rate matches: {source_rate} Hz"
    else:
        reason = f"Audio sample rate mismatch: source={source_rate} Hz, proxy={proxy_rate} Hz"
    
    return ExpectationResult(
        expectation="audio_sample_rate_matches",
        passed=passed,
        reason=reason,
        source_value=source_rate,
        proxy_value=proxy_rate,
    )


def check_container_is_mov(
    source_probe: Dict[str, Any],
    proxy_probe: Dict[str, Any],
    **kwargs,
) -> ExpectationResult:
    """
    Verify proxy container is QuickTime MOV.
    
    MOV container required for NLE compatibility.
    """
    format_name = proxy_probe.get("format", {}).get("format_name", "")
    
    # MOV files report as "mov,mp4,m4a,3gp,3g2,mj2" or similar
    passed = "mov" in format_name.lower()
    
    if passed:
        reason = f"Container is MOV (format: {format_name})"
    else:
        reason = f"Container is not MOV (format: {format_name})"
    
    return ExpectationResult(
        expectation="container_is_mov",
        passed=passed,
        reason=reason,
        proxy_value=format_name,
    )


def check_proxy_codec_matches_profile(
    source_probe: Dict[str, Any],
    proxy_probe: Dict[str, Any],
    profile: str = "",
    **kwargs,
) -> ExpectationResult:
    """
    Verify proxy video codec matches requested profile.
    
    Profile maps to specific codec requirements.
    """
    proxy_video = get_video_stream(proxy_probe)
    
    if not proxy_video:
        return ExpectationResult(
            expectation="proxy_codec_matches_profile",
            passed=False,
            reason="Proxy has no video stream",
        )
    
    proxy_codec = proxy_video.get("codec_name", "").lower()
    proxy_profile_name = proxy_video.get("profile", "").lower()
    
    # Map profile names to expected codecs
    profile_codec_map = {
        "proxy_h264_low": ["h264", "avc"],
        "proxy_h264": ["h264", "avc"],
        "proxy_prores_proxy": ["prores"],
        "proxy_prores_lt": ["prores"],
        "proxy_prores_standard": ["prores"],
        "proxy_prores_hq": ["prores"],
        "proxy_prores_proxy_resolve": ["prores"],
        "audio_passthrough": [],  # No video expected
    }
    
    expected_codecs = profile_codec_map.get(profile, [])
    
    if not expected_codecs:
        return ExpectationResult(
            expectation="proxy_codec_matches_profile",
            passed=True,
            reason=f"Profile '{profile}' does not require specific video codec",
        )
    
    passed = any(codec in proxy_codec for codec in expected_codecs)
    
    if passed:
        reason = f"Codec matches profile '{profile}': {proxy_codec} (profile: {proxy_profile_name})"
    else:
        reason = f"Codec mismatch for profile '{profile}': expected one of {expected_codecs}, got '{proxy_codec}'"
    
    return ExpectationResult(
        expectation="proxy_codec_matches_profile",
        passed=passed,
        reason=reason,
        proxy_value=proxy_codec,
        threshold=expected_codecs,
    )


def check_burnin_present(
    source_probe: Dict[str, Any],
    proxy_probe: Dict[str, Any],
    proxy_path: Optional[Path] = None,
    **kwargs,
) -> ExpectationResult:
    """
    Verify burn-in text is present in expected regions.
    
    Checks for non-black pixels in typical burn-in overlay areas
    (top and bottom margins). This is a coarse detection - not OCR.
    """
    if proxy_path is None:
        return ExpectationResult(
            expectation="burnin_present",
            passed=False,
            reason="No proxy path provided for burn-in detection",
        )
    
    # Use FFmpeg to sample pixels from burn-in regions
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return ExpectationResult(
            expectation="burnin_present",
            passed=False,
            reason="FFmpeg not found for burn-in detection",
        )
    
    try:
        # Extract a small region from the top-left where burn-in text typically appears
        # We'll check if there's any non-near-black content
        result = subprocess.run(
            [
                ffmpeg,
                "-i", str(proxy_path),
                "-vf", "crop=400:50:10:10,format=gray",  # Top-left corner, 400x50 region
                "-frames:v", "1",
                "-f", "rawvideo",
                "-",
            ],
            capture_output=True,
            timeout=10,
        )
        
        if result.returncode != 0:
            return ExpectationResult(
                expectation="burnin_present",
                passed=False,
                reason=f"FFmpeg failed to extract burn-in region: {result.stderr.decode()[:200]}",
            )
        
        # Check if there are bright pixels (text) in the region
        pixel_data = result.stdout
        if not pixel_data:
            return ExpectationResult(
                expectation="burnin_present",
                passed=False,
                reason="No pixel data extracted from burn-in region",
            )
        
        # Count pixels above threshold (text should be bright against dark background)
        threshold = 40  # Luma threshold for "bright" pixels
        bright_pixels = sum(1 for pixel in pixel_data if pixel > threshold)
        total_pixels = len(pixel_data)
        bright_ratio = bright_pixels / total_pixels if total_pixels > 0 else 0
        
        # We expect at least some bright pixels (text) in the burn-in region
        # Typical burn-in text covers ~5-20% of the region
        passed = bright_ratio > 0.02
        
        if passed:
            reason = f"Burn-in detected: {bright_ratio:.1%} bright pixels in overlay region"
        else:
            reason = f"Burn-in not detected: only {bright_ratio:.1%} bright pixels in overlay region (expected >2%)"
        
        return ExpectationResult(
            expectation="burnin_present",
            passed=passed,
            reason=reason,
            proxy_value=bright_ratio,
            threshold=0.02,
        )
    
    except subprocess.TimeoutExpired:
        return ExpectationResult(
            expectation="burnin_present",
            passed=False,
            reason="Timeout extracting burn-in region",
        )
    except Exception as e:
        return ExpectationResult(
            expectation="burnin_present",
            passed=False,
            reason=f"Error detecting burn-in: {e}",
        )


def check_lut_applied_detectable(
    source_probe: Dict[str, Any],
    proxy_probe: Dict[str, Any],
    proxy_path: Optional[Path] = None,
    source_path: Optional[Path] = None,
    **kwargs,
) -> ExpectationResult:
    """
    Verify LUT application is detectable via histogram/luma analysis.
    
    Compares average luma between source and proxy. A LUT should produce
    a measurable difference in color/exposure. This is a coarse check.
    """
    if proxy_path is None or source_path is None:
        return ExpectationResult(
            expectation="lut_applied_detectable",
            passed=False,
            reason="Source and proxy paths required for LUT detection",
        )
    
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return ExpectationResult(
            expectation="lut_applied_detectable",
            passed=False,
            reason="FFmpeg not found for LUT detection",
        )
    
    def get_average_luma(path: Path) -> Optional[float]:
        """Extract average luma from first frame."""
        try:
            result = subprocess.run(
                [
                    ffmpeg,
                    "-i", str(path),
                    "-vf", "scale=320:180,format=gray",
                    "-frames:v", "1",
                    "-f", "rawvideo",
                    "-",
                ],
                capture_output=True,
                timeout=15,
            )
            
            if result.returncode != 0:
                return None
            
            pixel_data = result.stdout
            if not pixel_data:
                return None
            
            return sum(pixel_data) / len(pixel_data)
        
        except (subprocess.TimeoutExpired, Exception):
            return None
    
    source_luma = get_average_luma(source_path)
    proxy_luma = get_average_luma(proxy_path)
    
    if source_luma is None:
        return ExpectationResult(
            expectation="lut_applied_detectable",
            passed=False,
            reason="Could not analyze source luma",
        )
    
    if proxy_luma is None:
        return ExpectationResult(
            expectation="lut_applied_detectable",
            passed=False,
            reason="Could not analyze proxy luma",
        )
    
    # LUT should produce measurable luma difference (at least 5% of range)
    luma_diff = abs(source_luma - proxy_luma)
    min_expected_diff = 12.75  # ~5% of 255 luma range
    
    passed = luma_diff >= min_expected_diff
    
    if passed:
        reason = f"LUT effect detected: luma delta={luma_diff:.1f} (source={source_luma:.1f}, proxy={proxy_luma:.1f})"
    else:
        reason = f"LUT effect not detected: luma delta={luma_diff:.1f} (expected ≥{min_expected_diff:.1f})"
    
    return ExpectationResult(
        expectation="lut_applied_detectable",
        passed=passed,
        reason=reason,
        source_value=source_luma,
        proxy_value=proxy_luma,
        threshold=min_expected_diff,
    )


# =============================================================================
# Expectation Registry
# =============================================================================

EXPECTATION_REGISTRY: Dict[str, Callable] = {
    "duration_matches": check_duration_matches,
    "frame_count_matches": check_frame_count_matches,
    "start_timecode_matches": check_start_timecode_matches,
    "audio_channel_count_matches": check_audio_channel_count_matches,
    "audio_sample_rate_matches": check_audio_sample_rate_matches,
    "container_is_mov": check_container_is_mov,
    "proxy_codec_matches_profile": check_proxy_codec_matches_profile,
    "burnin_present": check_burnin_present,
    "lut_applied_detectable": check_lut_applied_detectable,
}


# =============================================================================
# Expectation Runner
# =============================================================================

class ExpectationRunner:
    """
    Runs expectation checks against source and proxy probe data.
    """
    
    def __init__(
        self,
        source_probe: Dict[str, Any],
        proxy_probe: Dict[str, Any],
        source_path: Optional[Path] = None,
        proxy_path: Optional[Path] = None,
    ):
        self.source_probe = source_probe
        self.proxy_probe = proxy_probe
        self.source_path = source_path
        self.proxy_path = proxy_path
    
    def run_expectation(
        self,
        expectation: str,
        **kwargs,
    ) -> ExpectationResult:
        """Run a single expectation check."""
        if expectation not in EXPECTATION_REGISTRY:
            return ExpectationResult(
                expectation=expectation,
                passed=False,
                reason=f"Unknown expectation: {expectation}",
            )
        
        check_fn = EXPECTATION_REGISTRY[expectation]
        
        return check_fn(
            source_probe=self.source_probe,
            proxy_probe=self.proxy_probe,
            source_path=self.source_path,
            proxy_path=self.proxy_path,
            **kwargs,
        )
    
    def run_expectations(
        self,
        expectations: List[str],
        **kwargs,
    ) -> List[ExpectationResult]:
        """Run multiple expectation checks."""
        results = []
        for expectation in expectations:
            result = self.run_expectation(expectation, **kwargs)
            results.append(result)
        return results
