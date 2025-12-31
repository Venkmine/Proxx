# Golden Render Test Media

This directory contains test media for golden render verification.

**Per the Test Media Policy (docs/QA.md section 10), media files are NOT committed
to the repository. They must be generated on demand.**

## Setup

Run the setup script to generate/link test media:

```bash
python qa/media/setup_golden_media.py
```

This will:
1. Generate synthetic video/audio samples using FFmpeg
2. Create a symlink to an existing BRAW sample (if available)

## Requirements

Test media MUST be:
- Short (2–5 seconds)
- Small (minimize repository size)
- Legally distributable (no copyrighted content)
- Representative of real-world workflows

## Media Files

| File | Format | Duration | Purpose |
|------|--------|----------|---------|
| `ffmpeg_sample.mov` | ProRes 422 Proxy, 1920x1080 | ~3 seconds | Standard FFmpeg proxy tests |
| `ffmpeg_sample.wav` | PCM 48kHz 16-bit stereo | ~3 seconds | Audio-only proxy tests |
| `resolve_raw_sample.braw` | BRAW (Blackmagic RAW) | ~2 seconds | Resolve RAW proxy tests |

## Generation Specifications

The setup script generates media with these specifications:

### ffmpeg_sample.mov
```bash
ffmpeg -f lavfi -i testsrc2=duration=3:size=1920x1080:rate=24 \
       -f lavfi -i sine=frequency=1000:duration=3:sample_rate=48000 \
       -c:v prores_ks -profile:v 0 -c:a pcm_s16le \
       -timecode 01:00:00:00 \
       qa/media/ffmpeg_sample.mov
```

### ffmpeg_sample.wav
```bash
ffmpeg -f lavfi -i sine=frequency=440:duration=3:sample_rate=48000 \
       -ac 2 -c:a pcm_s16le \
       qa/media/ffmpeg_sample.wav
```

### resolve_raw_sample.braw
Must be captured from real camera or sourced from official Blackmagic samples.
Cannot be synthetically generated.

## Legal

All media in this directory must be either:
1. Synthetically generated (test patterns, tone generators)
2. Captured specifically for testing (no third-party content)
3. Official manufacturer samples with redistribution rights

Do NOT commit:
- Copyrighted footage
- Client media
- Downloaded sample clips without licenses
