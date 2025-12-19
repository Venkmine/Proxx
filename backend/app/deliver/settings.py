"""
DeliverSettings — Composed from Capability Models.

DeliverSettings is the SINGLE OBJECT that defines a render output.
It composes all capability models into one immutable structure.

CRITICAL RULES:
1. DeliverSettings is IMMUTABLE once rendering begins
2. Editable ONLY while job.status == PENDING
3. Backend MUST reject mutation attempts on non-PENDING jobs
4. UI disabling alone is INSUFFICIENT — backend enforcement required

This replaces the legacy JobSettings with a more comprehensive model.
"""

from dataclasses import dataclass, field, asdict
from typing import Optional, Any, Dict, List
import json

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
    FieldOrder,
    ColorSpace,
    GammaTransfer,
    DataLevels,
    ScalingFilter,
    AudioCodec,
    AudioChannelLayout,
    OverwritePolicy,
)


@dataclass(frozen=True)
class DeliverSettings:
    """
    Complete, immutable deliver configuration.
    
    Composes all capability models into one structure.
    This is what engines receive (via engine_mapping.py translation).
    
    Immutability contract:
    - frozen=True makes dataclass immutable at Python level
    - Backend routes enforce job.status == PENDING for mutations
    - Any mutation attempt on non-PENDING job raises error
    
    Migration from JobSettings:
    - output_dir → file.output_dir (new field in FileCapabilities extended)
    - naming_template → file.naming_template
    - watermark_enabled/text → overlay.text_layers
    - preserve_source_dirs → file.preserve_source_dirs
    """
    
    # Core capabilities
    video: VideoCapabilities = field(default_factory=VideoCapabilities)
    audio: AudioCapabilities = field(default_factory=AudioCapabilities)
    file: FileCapabilities = field(default_factory=FileCapabilities)
    metadata: MetadataCapabilities = field(default_factory=MetadataCapabilities)
    overlay: OverlayCapabilities = field(default_factory=OverlayCapabilities)
    
    # Output directory (absolute path)
    # If None, falls back to source file's parent directory
    output_dir: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize to dictionary for JSON storage.
        
        Handles nested dataclasses and enums.
        """
        def serialize_value(val: Any) -> Any:
            if hasattr(val, 'value'):  # Enum
                return val.value
            elif hasattr(val, '__dataclass_fields__'):  # Dataclass
                return {k: serialize_value(v) for k, v in asdict(val).items()}
            elif isinstance(val, tuple):
                return [serialize_value(v) for v in val]
            elif isinstance(val, list):
                return [serialize_value(v) for v in val]
            else:
                return val
        
        return {
            "video": serialize_value(self.video),
            "audio": serialize_value(self.audio),
            "file": serialize_value(self.file),
            "metadata": serialize_value(self.metadata),
            "overlay": serialize_value(self.overlay),
            "output_dir": self.output_dir,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeliverSettings":
        """
        Deserialize from dictionary.
        
        Handles nested dataclasses and enums.
        """
        if not data:
            return DEFAULT_DELIVER_SETTINGS
        
        # Parse video capabilities
        video_data = data.get("video", {})
        video = VideoCapabilities(
            codec=video_data.get("codec", "prores_422"),
            profile=video_data.get("profile"),
            level=video_data.get("level"),
            pixel_format=video_data.get("pixel_format"),
            resolution_policy=ResolutionPolicy(video_data.get("resolution_policy", "source")),
            width=video_data.get("width"),
            height=video_data.get("height"),
            scaling_filter=ScalingFilter(video_data.get("scaling_filter", "auto")),
            frame_rate_policy=FrameRatePolicy(video_data.get("frame_rate_policy", "source")),
            frame_rate=video_data.get("frame_rate"),
            field_order=FieldOrder(video_data.get("field_order", "progressive")),
            color_space=ColorSpace(video_data.get("color_space", "source")),
            gamma=GammaTransfer(video_data.get("gamma", "source")),
            data_levels=DataLevels(video_data.get("data_levels", "source")),
            hdr_metadata_passthrough=video_data.get("hdr_metadata_passthrough", True),
            quality=video_data.get("quality"),
            bitrate=video_data.get("bitrate"),
            preset=video_data.get("preset"),
        )
        
        # Parse audio capabilities
        audio_data = data.get("audio", {})
        audio = AudioCapabilities(
            codec=AudioCodec(audio_data.get("codec", "copy")),
            bitrate=audio_data.get("bitrate"),
            channels=audio_data.get("channels"),
            layout=AudioChannelLayout(audio_data.get("layout", "source")),
            sample_rate=audio_data.get("sample_rate"),
            passthrough=audio_data.get("passthrough", False),
        )
        
        # Parse file capabilities
        file_data = data.get("file", {})
        file_caps = FileCapabilities(
            container=file_data.get("container", "mov"),
            extension=file_data.get("extension"),
            naming_template=file_data.get("naming_template", "{source_name}__proxx"),
            prefix=file_data.get("prefix"),
            suffix=file_data.get("suffix"),
            overwrite_policy=OverwritePolicy(file_data.get("overwrite_policy", "never")),
            preserve_source_dirs=file_data.get("preserve_source_dirs", False),
            preserve_dir_levels=file_data.get("preserve_dir_levels", 0),
        )
        
        # Parse metadata capabilities
        metadata_data = data.get("metadata", {})
        metadata = MetadataCapabilities(
            strip_all_metadata=metadata_data.get("strip_all_metadata", False),
            passthrough_all_container_metadata=metadata_data.get("passthrough_all_container_metadata", True),
            passthrough_timecode=metadata_data.get("passthrough_timecode", True),
            passthrough_reel_name=metadata_data.get("passthrough_reel_name", True),
            passthrough_camera_metadata=metadata_data.get("passthrough_camera_metadata", True),
            passthrough_color_metadata=metadata_data.get("passthrough_color_metadata", True),
        )
        
        # Parse overlay capabilities
        overlay_data = data.get("overlay", {})
        text_layers_data = overlay_data.get("text_layers", [])
        text_layers = tuple(
            TextOverlay(
                text=layer.get("text", ""),
                position=TextPosition(layer.get("position", "bottom_left")),
                font_size=layer.get("font_size", 24),
                opacity=layer.get("opacity", 1.0),
                enabled=layer.get("enabled", True),
            )
            for layer in text_layers_data
        )
        overlay = OverlayCapabilities(text_layers=text_layers)
        
        return cls(
            video=video,
            audio=audio,
            file=file_caps,
            metadata=metadata,
            overlay=overlay,
            output_dir=data.get("output_dir"),
        )
    
    def with_updates(self, **kwargs) -> "DeliverSettings":
        """
        Create a new DeliverSettings with specified fields updated.
        
        Since dataclass is frozen, we return a new instance.
        This is the only way to "modify" settings.
        
        For nested updates, pass the full capability object:
            settings.with_updates(video=new_video_caps)
        """
        current = self.to_dict()
        
        # Handle nested capability updates
        for key, value in kwargs.items():
            if hasattr(value, '__dataclass_fields__'):
                # It's a dataclass, serialize it
                current[key] = {k: v.value if hasattr(v, 'value') else v 
                               for k, v in asdict(value).items()}
            else:
                current[key] = value
        
        return DeliverSettings.from_dict(current)
    
    @classmethod
    def from_legacy_job_settings(cls, legacy: Dict[str, Any]) -> "DeliverSettings":
        """
        Convert legacy JobSettings dict to DeliverSettings.
        
        Provides migration path from old JobSettings format.
        """
        # Map legacy watermark to text overlay
        text_layers: tuple[TextOverlay, ...] = ()
        if legacy.get("watermark_enabled") and legacy.get("watermark_text"):
            text_layers = (
                TextOverlay(
                    text=legacy["watermark_text"],
                    position=TextPosition.BOTTOM_LEFT,
                    enabled=True,
                ),
            )
        
        return cls(
            video=VideoCapabilities(),  # Defaults
            audio=AudioCapabilities(),  # Defaults
            file=FileCapabilities(
                naming_template=legacy.get("naming_template", "{source_name}__proxx"),
                prefix=legacy.get("file_prefix"),
                suffix=legacy.get("file_suffix"),
                preserve_source_dirs=legacy.get("preserve_source_dirs", False),
                preserve_dir_levels=legacy.get("preserve_dir_levels", 0),
            ),
            metadata=MetadataCapabilities(),  # Defaults (all ON)
            overlay=OverlayCapabilities(text_layers=text_layers),
            output_dir=legacy.get("output_dir"),
        )


# Default settings instance
DEFAULT_DELIVER_SETTINGS = DeliverSettings()
