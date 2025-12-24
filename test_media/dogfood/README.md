# Dogfood Test Media

**Purpose:** Real media files for systematic dogfooding of Proxx.

## ⚠️ IMPORTANT: Use REAL Media

DO NOT use synthetic test clips. Use actual production media:
- Real codecs (H.264, ProRes, DNxHD)
- Real resolutions (720p, 1080p, 4K)
- Real durations (5 sec to 30 min)
- Real problems (slow I/O, weird filenames, permissions)

## Required Files

### 1. short_h264.mp4
- 5-10 seconds
- H.264 codec (baseline profile preferred)
- Any resolution (720p+ recommended)
- **Purpose:** Quick test, annoying codec

### 2. multi_clip_folder/
- 5-10 clips
- Mixed formats OK (mov, mp4, mxf)
- Mixed codecs OK
- **Purpose:** Test folder ingestion, multi-clip jobs

### 3. long_form.mov
- 10-30 minutes
- ProRes or H.264
- **Purpose:** Test concurrent execution, pause/resume

### 4. mixed_resolution/
- 3-5 clips
- Different resolutions (720p, 1080p, 4K)
- Different codecs (H.264, ProRes, DNxHD)
- **Purpose:** Test metadata extraction, codec handling

### 5. external_volume.mp4
- Any clip
- MUST be on external USB drive or network mount
- **Purpose:** Test slow I/O, timeout handling

### 6. broken_paths/
- `missing_file.mp4` (create reference but delete actual file)
- `no_permissions.mp4` (chmod 000)
- `weird_filename_!@#$%^&*().mp4` (special characters)
- `unsupported.avi` (codec FFmpeg doesn't support)
- **Purpose:** Test failure paths, error messaging

## Setup Instructions

1. Copy real media files to this directory
2. Follow naming convention above
3. For broken_paths:
   ```bash
   touch broken_paths/no_permissions.mp4
   chmod 000 broken_paths/no_permissions.mp4
   
   # For missing_file: create job with path, then delete file before running
   ```

## DO NOT

- Use synthetic test patterns (colored bars, tone)
- Use tiny files (< 1 MB)
- Use only one codec/resolution
- Skip the "broken" files (failures are part of the test)

## Verification

Before starting dogfooding, verify:
- [ ] All files are REAL media (not test patterns)
- [ ] Files span different codecs/resolutions
- [ ] broken_paths/ contains intentional failures
- [ ] external_volume file is on slow volume
- [ ] Total test suite size: 500MB - 5GB (representative scale)
