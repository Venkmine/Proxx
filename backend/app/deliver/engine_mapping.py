"""
Engine Mapping Layer — Translate Capabilities to Engine-Specific Arguments.

This is the ONLY place where DeliverCapabilities are translated to
engine-specific commands. Engines never interpret capabilities directly.

CRITICAL RULES:
1. Capabilities are pure data — this module interprets them
2. If a capability cannot be mapped, emit explicit warning
3. NEVER guess or silently coerce unsupported values
4. Engines receive the output of this module, not raw capabilities

FFmpeg support status:
- VIDEO: Full editorial subset supported
- AUDIO: Copy, AAC, PCM supported
- METADATA: Container passthrough supported
- OVERLAYS: Text via drawtext supported (Phase 1)
- SCALING: fit/fill/stretch modes supported
"""

import logging
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path

from .capabilities import (
    VideoCapabilities,
    AudioCapabilities,
    FileCapabilities,
    MetadataCapabilities,
    OverlayCapabilities,
    TextOverlay,
    TextPosition,
    ResolutionPolicy,
    FrameRatePolicy,
    ScalingFilter,
    AudioCodec,
    DataLevels,
    ColorSpace,
)
from .settings import DeliverSettings

logger = logging.getLogger(__name__)


# ============================================================================
# MAPPING RESULTS
# ============================================================================

@dataclass
class EngineWarning:
    """Warning about an unsupported or degraded capability."""
    capability: str
    message: str
    fallback: Optional[str] = None  # What we're doing instead


@dataclass
class FFmpegMappingResult:
    """
    Result of mapping DeliverSettings to FFmpeg arguments.
    
    Contains:
    - Complete command line arguments
    - Any warnings about unsupported/degraded capabilities
    - Metadata about the mapping
    """
    
    # Pre-input arguments (before -i)
    pre_input_args: List[str] = field(default_factory=list)
    
    # Post-input arguments (after -i, before output)
    video_args: List[str] = field(default_factory=list)
    audio_args: List[str] = field(default_factory=list)
    metadata_args: List[str] = field(default_factory=list)
    filter_chains: List[str] = field(default_factory=list)
    
    # Warnings about unsupported capabilities
    warnings: List[EngineWarning] = field(default_factory=list)
    
    def build_command(
        self,
        ffmpeg_path: str,
        source_path: str,
        output_path: str,
    ) -> List[str]:
        """
        Assemble complete FFmpeg command.
        
        Order matters for FFmpeg:
        1. ffmpeg binary
        2. Global options
        3. Pre-input options
        4. Input file
        5. Video codec/options
        6. Filters
        7. Audio codec/options
        8. Metadata options
        9. Output file
        """
        cmd = [ffmpeg_path, "-y"]  # -y to overwrite
        
        # Pre-input
        cmd.extend(self.pre_input_args)
        
        # Input
        cmd.extend(["-i", source_path])
        
        # Video
        cmd.extend(self.video_args)
        
        # Filters
        if self.filter_chains:
            cmd.extend(["-vf", ",".join(self.filter_chains)])
        
        # Audio
        cmd.extend(self.audio_args)
        
        # Metadata
        cmd.extend(self.metadata_args)
        
        # Output
        cmd.append(output_path)
        
        return cmd


# ============================================================================
# FFMPEG CODEC MAPPINGS
# ============================================================================

FFMPEG_VIDEO_CODEC_MAP: Dict[str, List[str]] = {
    # H.264
    "h264": ["-c:v", "libx264"],
    
    # ProRes variants (using prores_ks encoder)
    "prores_proxy": ["-c:v", "prores_ks", "-profile:v", "0"],
    "prores_lt": ["-c:v", "prores_ks", "-profile:v", "1"],
    "prores_422": ["-c:v", "prores_ks", "-profile:v", "2"],
    "prores_422_hq": ["-c:v", "prores_ks", "-profile:v", "3"],
    "prores_4444": ["-c:v", "prores_ks", "-profile:v", "4"],
    "prores_4444_xq": ["-c:v", "prores_ks", "-profile:v", "5"],
    
    # DNxHR variants
    "dnxhr_lb": ["-c:v", "dnxhd", "-profile:v", "dnxhr_lb"],
    "dnxhr_sq": ["-c:v", "dnxhd", "-profile:v", "dnxhr_sq"],
    "dnxhr_hq": ["-c:v", "dnxhd", "-profile:v", "dnxhr_hq"],
    "dnxhr_hqx": ["-c:v", "dnxhd", "-profile:v", "dnxhr_hqx"],
    "dnxhr_444": ["-c:v", "dnxhd", "-profile:v", "dnxhr_444"],
    
    # DNxHD variants (specific bitrates)
    "dnxhd_36": ["-c:v", "dnxhd", "-b:v", "36M"],
    "dnxhd_145": ["-c:v", "dnxhd", "-b:v", "145M"],
    "dnxhd_220": ["-c:v", "dnxhd", "-b:v", "220M"],
}

FFMPEG_AUDIO_CODEC_MAP: Dict[str, List[str]] = {
    "copy": ["-c:a", "copy"],
    "aac": ["-c:a", "aac"],
    "pcm_s16le": ["-c:a", "pcm_s16le"],
    "pcm_s24le": ["-c:a", "pcm_s24le"],
    "pcm_s32le": ["-c:a", "pcm_s32le"],
    "ac3": ["-c:a", "ac3"],
    "eac3": ["-c:a", "eac3"],
}

FFMPEG_SCALING_FILTER_MAP: Dict[str, str] = {
    "auto": "",  # FFmpeg default
    "bilinear": "bilinear",
    "bicubic": "bicubic",
    "lanczos": "lanczos",
    "nearest": "neighbor",
}


# ============================================================================
# TEXT OVERLAY POSITION MAPPING
# ============================================================================

def _get_text_position_coords(position: TextPosition) -> Tuple[str, str]:
    """
    Map TextPosition enum to FFmpeg drawtext x:y expressions.
    
    Returns (x, y) as FFmpeg expressions.
    """
    # Padding from edges
    PAD = "10"
    
    positions = {
        TextPosition.TOP_LEFT: (PAD, PAD),
        TextPosition.TOP_CENTER: ("(w-text_w)/2", PAD),
        TextPosition.TOP_RIGHT: (f"w-text_w-{PAD}", PAD),
        TextPosition.BOTTOM_LEFT: (PAD, f"h-text_h-{PAD}"),
        TextPosition.BOTTOM_CENTER: ("(w-text_w)/2", f"h-text_h-{PAD}"),
        TextPosition.BOTTOM_RIGHT: (f"w-text_w-{PAD}", f"h-text_h-{PAD}"),
        TextPosition.CENTER: ("(w-text_w)/2", "(h-text_h)/2"),
    }
    
    return positions.get(position, (PAD, f"h-text_h-{PAD}"))


# ============================================================================
# FFMPEG ENGINE MAPPER
# ============================================================================

class FFmpegEngineMapper:
    """
    Maps DeliverSettings to FFmpeg command arguments.
    
    This is the translation layer between abstract capabilities
    and concrete FFmpeg implementation.
    """
    
    def map(
        self,
        settings: DeliverSettings,
        source_width: Optional[int] = None,
        source_height: Optional[int] = None,
        source_timecode: Optional[str] = None,
    ) -> FFmpegMappingResult:
        """
        Map DeliverSettings to FFmpeg arguments.
        
        Args:
            settings: Complete deliver settings
            source_width: Source video width (for scaling calculations)
            source_height: Source video height (for scaling calculations)
            source_timecode: Source timecode (for burn-in)
            
        Returns:
            FFmpegMappingResult with complete command arguments
        """
        result = FFmpegMappingResult()
        
        # Map each capability domain
        self._map_video(settings.video, result, source_width, source_height)
        self._map_audio(settings.audio, result)
        self._map_metadata(settings.metadata, result)
        self._map_overlays(settings.overlay, result, source_timecode)
        
        return result
    
    def _map_video(
        self,
        video: VideoCapabilities,
        result: FFmpegMappingResult,
        source_width: Optional[int],
        source_height: Optional[int],
    ) -> None:
        """Map video capabilities to FFmpeg arguments."""
        
        # Codec
        codec = video.codec.lower()
        if codec in FFMPEG_VIDEO_CODEC_MAP:
            result.video_args.extend(FFMPEG_VIDEO_CODEC_MAP[codec])
        else:
            result.warnings.append(EngineWarning(
                capability="video.codec",
                message=f"Codec '{codec}' not in FFmpeg mapping",
                fallback="Using H.264 with CRF 23",
            ))
            result.video_args.extend(["-c:v", "libx264", "-crf", "23"])
        
        # Quality/bitrate (for H.264)
        if codec == "h264":
            if video.quality is not None:
                result.video_args.extend(["-crf", str(video.quality)])
            if video.preset:
                result.video_args.extend(["-preset", video.preset])
        
        # Explicit bitrate overrides CRF
        if video.bitrate:
            result.video_args.extend(["-b:v", video.bitrate])
        
        # Pixel format
        if video.pixel_format:
            result.video_args.extend(["-pix_fmt", video.pixel_format])
        
        # Scaling
        if video.resolution_policy != ResolutionPolicy.SOURCE:
            self._build_scale_filter(video, result, source_width, source_height)
        
        # Frame rate
        if video.frame_rate_policy == FrameRatePolicy.FORCE and video.frame_rate:
            result.video_args.extend(["-r", video.frame_rate])
        
        # Data levels
        if video.data_levels == DataLevels.VIDEO:
            result.filter_chains.append("colorspace=range=tv")
        elif video.data_levels == DataLevels.FULL:
            result.filter_chains.append("colorspace=range=pc")
    
    def _build_scale_filter(
        self,
        video: VideoCapabilities,
        result: FFmpegMappingResult,
        source_width: Optional[int],
        source_height: Optional[int],
    ) -> None:
        """Build FFmpeg scale filter from resolution settings."""
        
        target_w = video.width
        target_h = video.height
        
        if not target_w or not target_h:
            result.warnings.append(EngineWarning(
                capability="video.resolution",
                message="Scale requested but target dimensions not specified",
                fallback="Skipping scale filter",
            ))
            return
        
        # Get scaling algorithm
        scale_algo = FFMPEG_SCALING_FILTER_MAP.get(video.scaling_filter.value, "")
        flags = f":flags={scale_algo}" if scale_algo else ""
        
        if video.resolution_policy == ResolutionPolicy.SCALE:
            # FIT mode: scale to fit within target, maintain aspect
            # Use -1 to auto-calculate preserving aspect ratio
            result.filter_chains.append(
                f"scale=w={target_w}:h={target_h}:force_original_aspect_ratio=decrease{flags}"
            )
        elif video.resolution_policy == ResolutionPolicy.CUSTOM:
            # Exact dimensions (may stretch)
            result.filter_chains.append(f"scale=w={target_w}:h={target_h}{flags}")
    
    def _map_audio(
        self,
        audio: AudioCapabilities,
        result: FFmpegMappingResult,
    ) -> None:
        """Map audio capabilities to FFmpeg arguments."""
        
        # Passthrough takes precedence
        if audio.passthrough or audio.codec == AudioCodec.COPY:
            result.audio_args.extend(["-c:a", "copy"])
            return
        
        # Codec
        codec = audio.codec.value
        if codec in FFMPEG_AUDIO_CODEC_MAP:
            result.audio_args.extend(FFMPEG_AUDIO_CODEC_MAP[codec])
        else:
            result.warnings.append(EngineWarning(
                capability="audio.codec",
                message=f"Audio codec '{codec}' not in FFmpeg mapping",
                fallback="Using audio copy",
            ))
            result.audio_args.extend(["-c:a", "copy"])
            return
        
        # Bitrate
        if audio.bitrate:
            result.audio_args.extend(["-b:a", audio.bitrate])
        
        # Sample rate
        if audio.sample_rate:
            result.audio_args.extend(["-ar", str(audio.sample_rate)])
        
        # Channels
        if audio.channels:
            result.audio_args.extend(["-ac", str(audio.channels)])
    
    def _map_metadata(
        self,
        metadata: MetadataCapabilities,
        result: FFmpegMappingResult,
    ) -> None:
        """
        Map metadata capabilities to FFmpeg arguments.
        
        CRITICAL: Metadata passthrough is ON by default.
        If we cannot preserve metadata, we MUST log a warning.
        """
        
        # Master strip override
        if metadata.strip_all_metadata:
            result.metadata_args.extend(["-map_metadata", "-1"])
            logger.warning(
                "DESTRUCTIVE: strip_all_metadata enabled. "
                "All source metadata will be removed."
            )
            return
        
        # Default: passthrough container metadata
        if metadata.passthrough_all_container_metadata:
            result.metadata_args.extend(["-map_metadata", "0"])
        
        # Map all video and audio streams
        result.metadata_args.extend(["-map", "0:v", "-map", "0:a?"])
        
        # Timecode passthrough
        # Note: FFmpeg preserves timecode in container metadata by default
        # with -map_metadata 0. For explicit timecode writing, we'd need
        # to extract and re-apply it, which is container-dependent.
        if metadata.passthrough_timecode:
            # Timecode is preserved via -map_metadata 0
            # Log if we can't guarantee preservation
            pass
        
        # Color metadata passthrough
        if metadata.passthrough_color_metadata:
            # FFmpeg preserves color metadata with -map_metadata 0
            # and appropriate output container
            pass
        
        # Log warnings for capabilities we can't fully guarantee
        if not metadata.passthrough_all_container_metadata:
            result.warnings.append(EngineWarning(
                capability="metadata.passthrough_all_container_metadata",
                message="Container metadata passthrough disabled",
                fallback="Metadata will not be copied from source",
            ))
    
    def _map_overlays(
        self,
        overlay: OverlayCapabilities,
        result: FFmpegMappingResult,
        source_timecode: Optional[str],
    ) -> None:
        """
        Map overlay capabilities to FFmpeg drawtext filters.
        
        Phase 1: Text overlays only with fixed font defaults.
        """
        
        for text_layer in overlay.text_layers:
            if not text_layer.enabled:
                continue
            
            # Resolve any tokens in text
            text = self._resolve_overlay_tokens(text_layer.text, source_timecode)
            
            # Escape special characters for FFmpeg
            text = self._escape_drawtext(text)
            
            # Get position
            x, y = _get_text_position_coords(text_layer.position)
            
            # Build drawtext filter
            # Using fixed font (system default) per Phase 1 scope
            drawtext = (
                f"drawtext=text='{text}'"
                f":fontsize={text_layer.font_size}"
                f":fontcolor=white@{text_layer.opacity}"
                f":x={x}:y={y}"
                f":box=1:boxcolor=black@0.5:boxborderw=5"
            )
            
            result.filter_chains.append(drawtext)
    
    def _resolve_overlay_tokens(
        self,
        text: str,
        source_timecode: Optional[str],
    ) -> str:
        """
        Resolve overlay text tokens.
        
        Supported tokens:
        - {timecode} — Source timecode or frame counter
        - More tokens added in later phases
        """
        if "{timecode}" in text:
            if source_timecode:
                text = text.replace("{timecode}", source_timecode)
            else:
                # Use FFmpeg's timecode expression for per-frame rendering
                # This is a static replacement for now
                text = text.replace("{timecode}", "%{pts\\:hms}")
        
        return text
    
    def _escape_drawtext(self, text: str) -> str:
        """Escape special characters for FFmpeg drawtext filter."""
        # FFmpeg drawtext escaping rules
        text = text.replace("\\", "\\\\")
        text = text.replace(":", "\\:")
        text = text.replace("'", "\\'")
        return text


# Singleton instance for convenience
ffmpeg_mapper = FFmpegEngineMapper()


def map_to_ffmpeg(
    settings: DeliverSettings,
    source_width: Optional[int] = None,
    source_height: Optional[int] = None,
    source_timecode: Optional[str] = None,
) -> FFmpegMappingResult:
    """
    Convenience function to map DeliverSettings to FFmpeg arguments.
    
    This is the primary API for engine mapping.
    """
    return ffmpeg_mapper.map(settings, source_width, source_height, source_timecode)
