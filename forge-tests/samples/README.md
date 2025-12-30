# Test Media Samples - DO NOT COMMIT

This directory should contain test media samples for format support validation.

**IMPORTANT**: Do NOT commit large media files to git.

## Required Samples

For comprehensive testing, provide samples for:

### RAW Formats (Resolve Engine)
- `braw_sample.braw` - Blackmagic RAW
- `r3d_sample.r3d` - RED RAW
- `arriraw_sample.ari` - ARRI RAW
- `xocn_sample.mxf` - Sony X-OCN
- `prores_raw_sample.mov` - ProRes RAW (for block testing)

### Standard Formats (FFmpeg Engine)
- `h264_sample.mp4` - H.264
- `hevc_sample.mp4` - H.265/HEVC
- `prores_sample.mov` - Standard ProRes 422
- `dnxhd_sample.mxf` - DNxHD

## Obtaining Samples

1. Use your own production media
2. Generate test patterns with Resolve or Media Encoder
3. Download camera manufacturer samples (ARRI, RED, Blackmagic provide test clips)

## File Naming Convention

Use the naming convention: `{format}_sample.{ext}`

This matches the sample_id in test matrix configs.

## .gitignore

This directory is gitignored to prevent accidental commits of large files.
