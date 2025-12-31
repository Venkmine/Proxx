# Proxy Attach Compatibility

## Overview

Forge guarantees that proxy files maintain strict compatibility with their source files for NLE (Non-Linear Editor) attach workflows. This document explains what Forge guarantees, known NLE constraints, and why MOV + PCM is the default configuration.

## What Forge Guarantees

When creating proxy files, Forge enforces the following compatibility constraints:

### Audio Channel Count Parity
- **Guarantee**: Proxy audio has **exactly** the same number of channels as source
- **Validation**: Enforced before and after rendering
- **Failure Mode**: Job fails if channel count mismatch detected

### Audio Channel Order Parity
- **Guarantee**: Channel ordering is preserved (e.g., L, R, C, LFE, Ls, Rs)
- **Implementation**: Channel layout metadata is preserved
- **Critical For**: Surround sound formats (5.1, 7.1, etc.)

### Sample Rate Parity
- **Guarantee**: Proxy sample rate matches source exactly
- **No Resampling**: Forge never silently resamples audio
- **Common Rates**: 44.1kHz, 48kHz, 96kHz all preserved

### Container Compatibility
- **Guarantee**: Output container is validated for target NLE compatibility
- **Enforcement**: Jobs fail if incompatible container/channel combination detected
- **Default**: MOV container for universal compatibility

## What Forge Does NOT Do

To maintain predictability and avoid silent failures, Forge explicitly does **NOT**:

- **Downmix Audio**: Never converts multichannel to stereo
- **Remap Channels**: Never reorders or reassigns channel routing
- **Guess Container Suitability**: Never assumes a container will work
- **Silent Fallbacks**: Never silently changes settings on your behalf

## Default Proxy Audio Configuration

Forge uses the following defaults for proxy audio:

```
Container:     MOV
Audio Codec:   PCM (LPCM)
Sample Rate:   Match source
Channel Count: Exact match
Channel Layout: Preserve source
```

### Why These Defaults?

**MOV Container**:
- Universal NLE support (Premiere, Resolve, Avid, Final Cut)
- Reliable multichannel audio handling
- No channel count limitations
- Proven attach workflow compatibility

**PCM Audio Codec**:
- Lossless preservation of audio quality
- No compression artifacts
- Maximum NLE compatibility
- Instant decode (no CPU overhead during editing)
- Bitstream identical across encode/decode cycles

**Sample Rate Matching**:
- Avoids resampling artifacts
- Preserves original audio fidelity
- Prevents sync drift issues
- NLE-native sample rate handling

**Channel Count Matching**:
- Critical for professional workflows
- Preserves mix bus routing
- No information loss
- Predictable behavior

## Known NLE Constraints

### MP4 Container

**Limitation**: MP4 does not reliably support multichannel audio (> 2 channels) in NLE attach workflows.

**Symptoms**:
- Premiere: May only see first 2 channels
- Resolve: Channel mapping issues
- Final Cut: Unpredictable channel routing

**Forge Behavior**:
- **Stereo or Mono**: MP4 allowed
- **Multichannel (4+)**: Job fails with clear error
- **Error Message**: "MP4 does not reliably support X channel audio in NLE attach workflows. Use MOV."

**Workaround**: Always use MOV for multichannel sources.

### AAC Audio Codec

**Limitation**: AAC has limited multichannel support and introduces compression artifacts.

**Issues**:
- AAC 5.1: Supported but lossy
- AAC 7.1: Limited compatibility
- Compression artifacts affect editorial sound monitoring

**Forge Default**: Uses PCM instead of AAC for guaranteed compatibility.

## Validation Workflow

Forge validates audio parity at two stages:

### 1. Pre-Render Validation

Before starting the render:
- Probe source audio properties
- Validate container compatibility for channel count
- Fail immediately if incompatible configuration detected

```
Source: 6 channels @ 48kHz
Container: MP4
Result: FAIL - "MP4 does not reliably support 6 channel audio"
```

### 2. Post-Render Validation

After render completes:
- Probe proxy audio properties
- Compare with source audio properties
- Fail if any mismatch detected

```
Source:  6ch @ 48kHz, layout=5.1
Proxy:   2ch @ 48kHz, layout=stereo
Result:  FAIL - "Channel mismatch: source=6, proxy=2"
```

## Testing Audio Parity

Forge includes automated tests for audio parity enforcement:

```bash
cd qa/automated
pytest test_audio_parity.py -v
```

**Test Coverage**:
- Mono (1 channel)
- Stereo (2 channels)
- Quad (4 channels)
- 5.1 Surround (6 channels)
- Sample rate preservation
- Channel layout preservation
- Container compatibility validation
- Mismatch detection

## Troubleshooting

### "MP4 does not reliably support X channel audio"

**Problem**: Source has multichannel audio (> 2 channels) and output container is MP4.

**Solution**: Use MOV container:
```json
{
  "proxy_profile": "proxy_prores_proxy_resolve",
  "container": "mov"
}
```

### "Audio parity validation failed: Channel mismatch"

**Problem**: Proxy has different channel count than source.

**Causes**:
- Incorrect render preset (may downmix to stereo)
- NLE render settings override
- Codec limitation

**Solution**: 
1. Verify render preset preserves audio channels
2. Use PCM codec (no channel limitations)
3. Ensure MOV container for multichannel

### "Audio parity validation failed: Sample rate mismatch"

**Problem**: Proxy has different sample rate than source.

**Causes**:
- Render preset specifies fixed sample rate
- Codec resampling behavior

**Solution**:
1. Use render presets that preserve source sample rate
2. Verify codec supports source sample rate
3. Check FFmpeg/Resolve output logs for resampling warnings

## API Reference

### Python: Audio Probing

```python
from backend.audio_probe import probe_audio, verify_audio_parity

# Probe source audio
source_props = probe_audio(Path("source.mov"))
print(f"Channels: {source_props.channels}")
print(f"Sample Rate: {source_props.sample_rate}")
print(f"Layout: {source_props.channel_layout}")

# Verify parity after render
passed, error = verify_audio_parity(
    Path("source.mov"),
    Path("proxy.mov")
)
if not passed:
    print(f"Parity check failed: {error}")
```

### Python: Container Validation

```python
from backend.audio_probe import validate_container_compatibility

# Check if container supports channel count
compatible, error = validate_container_compatibility("mp4", 6)
if not compatible:
    print(error)  # "MP4 does not reliably support 6 channel audio..."
```

### Python: Recommended Configuration

```python
from backend.audio_probe import probe_audio, get_recommended_audio_config

# Get recommended proxy settings for source
source_props = probe_audio(Path("source.mov"))
config = get_recommended_audio_config(source_props)

print(config)
# {
#   'codec': 'pcm_s16le',
#   'sample_rate': 48000,
#   'channels': 6,
#   'channel_layout': '5.1',
#   'container': 'mov'
# }
```

## Why This Matters

### Professional Workflows

In professional post-production, proxies are attached to high-resolution source files. The proxy audio must match exactly or:

- **Sync Issues**: Sample rate mismatches cause audio drift
- **Mix Loss**: Channel count mismatches lose audio content
- **Routing Errors**: Channel order mismatches break mix bus routing
- **Delivery Failures**: Audio incompatibilities caught at QC stage

### Attach Workflow Fundamentals

NLE attach workflows depend on:
1. **Identical Timecode**: Proxy and source have same timecode
2. **Identical Duration**: Frame-accurate length match
3. **Identical Audio**: Channel count, rate, and order match

Forge guarantees #3. Other aspects (#1, #2) depend on source file characteristics and proxy render settings.

## Implementation Details

### FFmpeg Audio Enforcement

Forge modifies FFmpeg commands to enforce audio parity:

```bash
# Enforced audio arguments
-c:a pcm_s16le                    # PCM codec
-ar 48000                          # Match source sample rate
-ac 6                              # Match source channel count
-channel_layout 5.1                # Preserve channel layout
```

These override any profile defaults when source audio is detected.

### Resolve Audio Enforcement

For DaVinci Resolve renders:
- Render presets must preserve audio channels
- Post-render validation ensures parity
- Failures trigger job failure (no silent issues)

### Validation Points

1. **Job Creation**: Container validated for source channel count
2. **Pre-Render**: Source audio probed and settings adjusted
3. **Post-Render**: Output audio compared to source
4. **Any Mismatch**: Job marked as FAILED with clear error

## Future Considerations

### Metadata Preservation

Currently not enforced but under consideration:
- Timecode metadata
- Audio track naming
- Bit depth preservation (currently forced to 16-bit PCM)

### Advanced Channel Layouts

Potential future support:
- Ambisonics (spatial audio)
- Object-based audio
- Custom channel layouts

### Performance Optimization

Audio parity adds minimal overhead:
- Probing: ~50-100ms per file
- Validation: ~50-100ms per file
- Total: < 200ms per clip (negligible for multi-minute renders)

## Compliance

This compatibility enforcement aligns with:
- **SMPTE Standards**: Audio channel mapping
- **EBU R128**: Loudness measurement (multichannel)
- **ITU-R BS.775**: Multichannel surround sound
- **Professional NLE Requirements**: Premiere, Resolve, Avid, FCP

## Summary

**Forge Guarantees**:
- ✅ Exact channel count match
- ✅ Exact sample rate match
- ✅ Channel layout preservation
- ✅ Container compatibility validation
- ✅ Validation at multiple stages
- ✅ Clear failure messages

**Forge Does Not**:
- ❌ Downmix audio silently
- ❌ Remap channels
- ❌ Guess container suitability
- ❌ Allow silent compatibility failures

**Default Configuration**:
- Container: MOV (universal compatibility)
- Codec: PCM (lossless, maximum compatibility)
- Sample Rate: Match source
- Channels: Match source exactly

**Testing**:
- Automated test suite: `qa/automated/test_audio_parity.py`
- Coverage: Mono, Stereo, Quad, 5.1
- Validation: Pre-render and post-render checks
