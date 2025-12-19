"""
Codec Specification Registry — Single Source of Truth for UI Generation.

Phase 20: Codec-driven UI authority.

This module defines what each codec supports. The UI MUST be generated
from these specifications. No hardcoded toggles in frontend.

CRITICAL RULES:
1. This is the ONLY place codec capabilities are defined
2. Frontend fetches via /control/codecs and reconfigures dynamically
3. If a codec does not declare a capability, UI must not show it
4. Invalid UI states are architecturally impossible

RULES FOR UI:
- CRF slider: Only if supports_crf == True
- Bitrate dropdown: Only if supports_bitrate == True
- CRF and Bitrate are mutually exclusive
- Audio bitrate: Only for lossy audio codecs
- Container dropdown: Filtered by supported_containers
- LUT section: Only if supports_lut == True
"""

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any
from enum import Enum


class RateControlMode(str, Enum):
    """Rate control modes available for a codec."""
    CRF = "crf"           # Constant Rate Factor (quality-based)
    BITRATE = "bitrate"   # Target bitrate
    CONSTANT_QP = "qp"    # Constant Quantization Parameter


class BitratePreset(str, Enum):
    """Standardized bitrate presets (no free-text entry)."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    BROADCAST = "broadcast"


@dataclass(frozen=True)
class BitratePresetValues:
    """Actual bitrate values for each preset, per codec category."""
    low: str
    medium: str
    high: str
    broadcast: str


# Bitrate presets by codec category
BITRATE_PRESETS_H264 = BitratePresetValues(
    low="5M",
    medium="15M",
    high="35M",
    broadcast="50M",
)

BITRATE_PRESETS_H265 = BitratePresetValues(
    low="3M",
    medium="10M",
    high="25M",
    broadcast="40M",
)

BITRATE_PRESETS_AV1 = BitratePresetValues(
    low="2M",
    medium="8M",
    high="20M",
    broadcast="35M",
)


@dataclass(frozen=True)
class CodecSpec:
    """
    Complete specification for a video codec.
    
    This defines what the UI can and cannot show for this codec.
    The frontend MUST respect these flags.
    
    Attributes:
        name: Human-readable codec name (for UI display)
        codec_id: Internal codec identifier (matches engine_mapping.py)
        category: Codec category for grouping (prores, dnx, delivery)
        
        supports_crf: Whether CRF rate control is available
        supports_bitrate: Whether bitrate rate control is available
        supports_constant_qp: Whether constant QP is available (NOT exposed Phase 20)
        default_rate_control: Default rate control mode when codec selected
        
        crf_range: (min, max, default) for CRF slider, if supported
        bitrate_presets: Preset values for bitrate mode, if supported
        
        supported_containers: Valid container formats for this codec
        default_container: Recommended container when codec selected
        
        supported_pixel_formats: Valid pixel formats
        default_pixel_format: Default pixel format
        
        supported_color_spaces: Valid color spaces for output
        
        supports_lut: Whether LUT application is meaningful for this codec
        supports_hdr_metadata: Whether HDR metadata can be preserved/written
        
        is_lossless: Whether codec is visually lossless (ProRes, etc.)
        is_intraframe: Whether codec is intraframe (no temporal compression)
        
        notes: Tooltip text for UI (usage guidance, warnings)
    """
    
    # Identity
    name: str
    codec_id: str
    category: str  # "prores", "dnx", "delivery", "utility"
    
    # Rate control capabilities
    supports_crf: bool = False
    supports_bitrate: bool = False
    supports_constant_qp: bool = False  # NOT exposed in Phase 20
    default_rate_control: Optional[RateControlMode] = None
    
    # CRF configuration (only if supports_crf)
    crf_min: int = 0
    crf_max: int = 51
    crf_default: int = 23
    
    # Bitrate presets (only if supports_bitrate)
    bitrate_presets: Optional[BitratePresetValues] = None
    
    # Container compatibility
    supported_containers: tuple = field(default_factory=lambda: ("mov",))
    default_container: str = "mov"
    
    # Pixel format
    supported_pixel_formats: tuple = field(default_factory=lambda: ("yuv420p",))
    default_pixel_format: str = "yuv420p"
    
    # Color
    supported_color_spaces: tuple = field(default_factory=lambda: ("source", "rec709"))
    
    # Advanced capabilities
    supports_lut: bool = True  # Most codecs can have LUT applied pre-encode
    supports_hdr_metadata: bool = False
    
    # Codec characteristics (informational)
    is_lossless: bool = False
    is_intraframe: bool = False
    
    # UI notes
    notes: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary for API response."""
        result = {
            "name": self.name,
            "codec_id": self.codec_id,
            "category": self.category,
            "supports_crf": self.supports_crf,
            "supports_bitrate": self.supports_bitrate,
            "supports_constant_qp": self.supports_constant_qp,
            "default_rate_control": self.default_rate_control.value if self.default_rate_control else None,
            "crf_min": self.crf_min,
            "crf_max": self.crf_max,
            "crf_default": self.crf_default,
            "bitrate_presets": {
                "low": self.bitrate_presets.low,
                "medium": self.bitrate_presets.medium,
                "high": self.bitrate_presets.high,
                "broadcast": self.bitrate_presets.broadcast,
            } if self.bitrate_presets else None,
            "supported_containers": list(self.supported_containers),
            "default_container": self.default_container,
            "supported_pixel_formats": list(self.supported_pixel_formats),
            "default_pixel_format": self.default_pixel_format,
            "supported_color_spaces": list(self.supported_color_spaces),
            "supports_lut": self.supports_lut,
            "supports_hdr_metadata": self.supports_hdr_metadata,
            "is_lossless": self.is_lossless,
            "is_intraframe": self.is_intraframe,
            "notes": self.notes,
        }
        return result


# ============================================================================
# CODEC REGISTRY — Single Source of Truth
# ============================================================================

CODEC_REGISTRY: Dict[str, CodecSpec] = {
    
    # ========================================================================
    # PRORES FAMILY — Intraframe, Quality-Based
    # ========================================================================
    
    "prores_proxy": CodecSpec(
        name="ProRes Proxy",
        codec_id="prores_proxy",
        category="prores",
        supports_crf=False,
        supports_bitrate=False,
        supported_containers=("mov",),
        default_container="mov",
        supported_pixel_formats=("yuv422p10le",),
        default_pixel_format="yuv422p10le",
        supported_color_spaces=("source", "rec709", "rec2020", "p3d65"),
        supports_lut=True,
        supports_hdr_metadata=False,
        is_lossless=False,
        is_intraframe=True,
        notes="Lightweight proxy for offline editing. ~45:1 compression.",
    ),
    
    "prores_lt": CodecSpec(
        name="ProRes LT",
        codec_id="prores_lt",
        category="prores",
        supports_crf=False,
        supports_bitrate=False,
        supported_containers=("mov",),
        default_container="mov",
        supported_pixel_formats=("yuv422p10le",),
        default_pixel_format="yuv422p10le",
        supported_color_spaces=("source", "rec709", "rec2020", "p3d65"),
        supports_lut=True,
        supports_hdr_metadata=False,
        is_lossless=False,
        is_intraframe=True,
        notes="70% of ProRes 422 data rate. Good for space-constrained workflows.",
    ),
    
    "prores_422": CodecSpec(
        name="ProRes 422",
        codec_id="prores_422",
        category="prores",
        supports_crf=False,
        supports_bitrate=False,
        supported_containers=("mov",),
        default_container="mov",
        supported_pixel_formats=("yuv422p10le",),
        default_pixel_format="yuv422p10le",
        supported_color_spaces=("source", "rec709", "rec2020", "p3d65"),
        supports_lut=True,
        supports_hdr_metadata=False,
        is_lossless=False,
        is_intraframe=True,
        notes="Standard editorial codec. Excellent quality/size balance.",
    ),
    
    "prores_422_hq": CodecSpec(
        name="ProRes 422 HQ",
        codec_id="prores_422_hq",
        category="prores",
        supports_crf=False,
        supports_bitrate=False,
        supported_containers=("mov",),
        default_container="mov",
        supported_pixel_formats=("yuv422p10le",),
        default_pixel_format="yuv422p10le",
        supported_color_spaces=("source", "rec709", "rec2020", "p3d65"),
        supports_lut=True,
        supports_hdr_metadata=False,
        is_lossless=False,
        is_intraframe=True,
        notes="Higher bitrate for demanding workflows. Recommended for grading.",
    ),
    
    "prores_4444": CodecSpec(
        name="ProRes 4444",
        codec_id="prores_4444",
        category="prores",
        supports_crf=False,
        supports_bitrate=False,
        supported_containers=("mov",),
        default_container="mov",
        supported_pixel_formats=("yuva444p10le", "yuv444p10le"),
        default_pixel_format="yuv444p10le",
        supported_color_spaces=("source", "rec709", "rec2020", "p3d65"),
        supports_lut=True,
        supports_hdr_metadata=True,
        is_lossless=False,
        is_intraframe=True,
        notes="Full chroma, optional alpha. For VFX and graphics.",
    ),
    
    "prores_4444_xq": CodecSpec(
        name="ProRes 4444 XQ",
        codec_id="prores_4444_xq",
        category="prores",
        supports_crf=False,
        supports_bitrate=False,
        supported_containers=("mov",),
        default_container="mov",
        supported_pixel_formats=("yuva444p10le", "yuv444p10le"),
        default_pixel_format="yuv444p10le",
        supported_color_spaces=("source", "rec709", "rec2020", "p3d65"),
        supports_lut=True,
        supports_hdr_metadata=True,
        is_lossless=False,
        is_intraframe=True,
        notes="Highest ProRes quality. For HDR mastering and critical color.",
    ),
    
    # ========================================================================
    # DNXHR FAMILY — Avid Ecosystem
    # ========================================================================
    
    "dnxhr_lb": CodecSpec(
        name="DNxHR LB",
        codec_id="dnxhr_lb",
        category="dnx",
        supports_crf=False,
        supports_bitrate=False,
        supported_containers=("mov", "mxf"),
        default_container="mxf",
        supported_pixel_formats=("yuv422p",),
        default_pixel_format="yuv422p",
        supported_color_spaces=("source", "rec709"),
        supports_lut=True,
        supports_hdr_metadata=False,
        is_lossless=False,
        is_intraframe=True,
        notes="Low Bandwidth. Offline/proxy editing in Avid ecosystem.",
    ),
    
    "dnxhr_sq": CodecSpec(
        name="DNxHR SQ",
        codec_id="dnxhr_sq",
        category="dnx",
        supports_crf=False,
        supports_bitrate=False,
        supported_containers=("mov", "mxf"),
        default_container="mxf",
        supported_pixel_formats=("yuv422p",),
        default_pixel_format="yuv422p",
        supported_color_spaces=("source", "rec709"),
        supports_lut=True,
        supports_hdr_metadata=False,
        is_lossless=False,
        is_intraframe=True,
        notes="Standard Quality. Balanced for Avid workflows.",
    ),
    
    "dnxhr_hq": CodecSpec(
        name="DNxHR HQ",
        codec_id="dnxhr_hq",
        category="dnx",
        supports_crf=False,
        supports_bitrate=False,
        supported_containers=("mov", "mxf"),
        default_container="mxf",
        supported_pixel_formats=("yuv422p",),
        default_pixel_format="yuv422p",
        supported_color_spaces=("source", "rec709"),
        supports_lut=True,
        supports_hdr_metadata=False,
        is_lossless=False,
        is_intraframe=True,
        notes="High Quality. Suitable for broadcast finishing.",
    ),
    
    "dnxhr_hqx": CodecSpec(
        name="DNxHR HQX",
        codec_id="dnxhr_hqx",
        category="dnx",
        supports_crf=False,
        supports_bitrate=False,
        supported_containers=("mov", "mxf"),
        default_container="mxf",
        supported_pixel_formats=("yuv422p10le",),
        default_pixel_format="yuv422p10le",
        supported_color_spaces=("source", "rec709", "rec2020"),
        supports_lut=True,
        supports_hdr_metadata=True,
        is_lossless=False,
        is_intraframe=True,
        notes="12-bit UHD/4K. For high-end Avid finishing.",
    ),
    
    "dnxhr_444": CodecSpec(
        name="DNxHR 444",
        codec_id="dnxhr_444",
        category="dnx",
        supports_crf=False,
        supports_bitrate=False,
        supported_containers=("mov", "mxf"),
        default_container="mxf",
        supported_pixel_formats=("yuv444p10le",),
        default_pixel_format="yuv444p10le",
        supported_color_spaces=("source", "rec709", "rec2020", "p3d65"),
        supports_lut=True,
        supports_hdr_metadata=True,
        is_lossless=False,
        is_intraframe=True,
        notes="Full chroma 4:4:4. For VFX and graphics work.",
    ),
    
    # ========================================================================
    # DELIVERY CODECS — Lossy, Rate-Controlled
    # ========================================================================
    
    "h264": CodecSpec(
        name="H.264 / AVC",
        codec_id="h264",
        category="delivery",
        supports_crf=True,
        supports_bitrate=True,
        supports_constant_qp=True,
        default_rate_control=RateControlMode.CRF,
        crf_min=0,
        crf_max=51,
        crf_default=23,
        bitrate_presets=BITRATE_PRESETS_H264,
        supported_containers=("mp4", "mov", "mkv"),
        default_container="mp4",
        supported_pixel_formats=("yuv420p", "yuv422p", "yuv444p"),
        default_pixel_format="yuv420p",
        supported_color_spaces=("source", "rec709", "srgb"),
        supports_lut=True,
        supports_hdr_metadata=False,
        is_lossless=False,
        is_intraframe=False,
        notes="Universal delivery codec. CRF 18-23 for high quality.",
    ),
    
    "h265": CodecSpec(
        name="H.265 / HEVC",
        codec_id="h265",
        category="delivery",
        supports_crf=True,
        supports_bitrate=True,
        supports_constant_qp=True,
        default_rate_control=RateControlMode.CRF,
        crf_min=0,
        crf_max=51,
        crf_default=28,
        bitrate_presets=BITRATE_PRESETS_H265,
        supported_containers=("mp4", "mov", "mkv"),
        default_container="mp4",
        supported_pixel_formats=("yuv420p", "yuv420p10le", "yuv422p", "yuv444p"),
        default_pixel_format="yuv420p",
        supported_color_spaces=("source", "rec709", "rec2020", "p3d65"),
        supports_lut=True,
        supports_hdr_metadata=True,
        is_lossless=False,
        is_intraframe=False,
        notes="Efficient delivery. ~50% size reduction vs H.264 at same quality.",
    ),
    
    "av1": CodecSpec(
        name="AV1",
        codec_id="av1",
        category="delivery",
        supports_crf=True,
        supports_bitrate=True,
        supports_constant_qp=True,
        default_rate_control=RateControlMode.CRF,
        crf_min=0,
        crf_max=63,
        crf_default=30,
        bitrate_presets=BITRATE_PRESETS_AV1,
        supported_containers=("mp4", "mkv", "webm"),
        default_container="mp4",
        supported_pixel_formats=("yuv420p", "yuv420p10le", "yuv444p"),
        default_pixel_format="yuv420p",
        supported_color_spaces=("source", "rec709", "rec2020", "p3d65"),
        supports_lut=True,
        supports_hdr_metadata=True,
        is_lossless=False,
        is_intraframe=False,
        notes="Next-gen codec. Best compression but slow encoding. HDR support.",
    ),
}


# ============================================================================
# CONTAINER REGISTRY — Which containers support which codecs
# ============================================================================

CONTAINER_CODEC_MAP: Dict[str, List[str]] = {
    "mov": [
        "prores_proxy", "prores_lt", "prores_422", "prores_422_hq",
        "prores_4444", "prores_4444_xq",
        "dnxhr_lb", "dnxhr_sq", "dnxhr_hq", "dnxhr_hqx", "dnxhr_444",
        "h264", "h265",
    ],
    "mxf": [
        "dnxhr_lb", "dnxhr_sq", "dnxhr_hq", "dnxhr_hqx", "dnxhr_444",
    ],
    "mp4": [
        "h264", "h265", "av1",
    ],
    "mkv": [
        "h264", "h265", "av1",
    ],
    "webm": [
        "av1",
    ],
}


def get_codecs_for_container(container: str) -> List[CodecSpec]:
    """Get all codec specs valid for a container."""
    codec_ids = CONTAINER_CODEC_MAP.get(container, [])
    return [CODEC_REGISTRY[cid] for cid in codec_ids if cid in CODEC_REGISTRY]


def get_containers_for_codec(codec_id: str) -> List[str]:
    """Get all valid containers for a codec."""
    spec = CODEC_REGISTRY.get(codec_id)
    if spec:
        return list(spec.supported_containers)
    return []


def validate_codec_container(codec_id: str, container: str) -> bool:
    """Check if a codec/container combination is valid."""
    spec = CODEC_REGISTRY.get(codec_id)
    if not spec:
        return False
    return container in spec.supported_containers


def get_all_codecs() -> Dict[str, Dict[str, Any]]:
    """Get all codec specs as serializable dict for API response."""
    return {codec_id: spec.to_dict() for codec_id, spec in CODEC_REGISTRY.items()}


def get_codec_spec(codec_id: str) -> Optional[CodecSpec]:
    """Get a single codec spec by ID."""
    return CODEC_REGISTRY.get(codec_id)
