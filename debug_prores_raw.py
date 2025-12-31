#!/usr/bin/env python3
"""Debug ProRes RAW routing."""

import sys
from pathlib import Path

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "backend"))

from backend.v2.ffprobe_wrapper import probe_media
from backend.v2.source_capabilities import get_execution_engine, normalize_format, RAW_CODECS_RESOLVE

sample_path = project_root / "forge-tests/samples/RAW/PRORES_RAW/a7s III ProRes RAW HQ.mov"

print("Probing ProRes RAW sample...")
probe_result = probe_media(str(sample_path))

print(f"\nProbe result:")
print(f"  Container: {probe_result.container}")
print(f"  Codec: {probe_result.video_codec}")
print(f"  Container normalized: {normalize_format(probe_result.container)}")
print(f"  Codec normalized: {normalize_format(probe_result.video_codec)}")

print(f"\nCodec in RAW_CODECS_RESOLVE: {normalize_format(probe_result.video_codec) in RAW_CODECS_RESOLVE}")

engine = get_execution_engine(probe_result.container, probe_result.video_codec)
print(f"\nEngine routing: {engine}")

print(f"\nRAW_CODECS_RESOLVE contents:")
for codec in sorted(RAW_CODECS_RESOLVE):
    if "prores" in codec.lower():
        print(f"  - {codec}")
