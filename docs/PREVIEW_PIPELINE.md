# Preview Pipeline — Tiered, Non-Blocking, Editor-Grade Model

## Philosophy

The preview system follows a **tiered, non-blocking, editor-grade model** modeled after 
DaVinci Resolve and RV-class NLE monitors. This is a corrective architectural change 
designed to ensure previews NEVER block job operations.

## Core Principles

1. **Preview must NEVER block job creation, preflight, or encoding**
2. **Preview generation must NEVER auto-generate video for RAW media**
3. **Something visual must appear IMMEDIATELY on source selection**
4. **All higher-fidelity previews are OPTIONAL and user-initiated**
5. **Preview is identification only — not editorial accuracy**

## Preview Tiers

### Tier 1: Poster Frame (Mandatory, Instant)

- **Purpose**: Immediate visual identification
- **Timing**: Appears within 2 seconds of source selection
- **Behavior**: Single frame extracted at ~7% position (typical slate offset)
- **Format**: JPEG, 1280px max dimension
- **Failure Mode**: Falls back to metadata display (never blocks)
- **Cache**: `/tmp/proxx_previews/posters/`

### Tier 2: Burst Thumbnails (Recommended)

- **Purpose**: Scrub preview for quick visual scan
- **Count**: 7 evenly-spaced frames (default)
- **Format**: JPEG, 480px max dimension
- **Behavior**: User can hover/scrub to switch displayed frame
- **Activation**: Optional, can be triggered from preview menu
- **Cache**: `/tmp/proxx_previews/bursts/{hash_id}/`

### Tier 3: Video Preview (User-Initiated ONLY)

- **Purpose**: Full motion playback for detailed review
- **Behavior**: NEVER auto-generated
- **Activation**: User must explicitly click "Generate Preview" menu
- **Duration Options**: 1s, 5s, 10s (primary) / 20s, 30s, 60s (extended)
- **Format**: H.264/AAC MP4, 1280px max
- **Cache**: `~/.awaire/proxy_cache/`

## RAW Media Handling

RAW formats (ARRIRAW, REDCODE, BRAW, ProRes RAW) require special handling:

1. **Poster Frame**: Generated normally (2s timeout still applies)
2. **Burst Thumbnails**: Generated normally (may be slower)
3. **Video Preview**: 
   - Requires user confirmation dialog
   - Default duration capped at 5 seconds
   - Warning displayed: "RAW format detected. Video preview may take longer."

**Rationale**: RAW transcoding is computationally expensive and should never happen 
without explicit user consent.

## API Endpoints

### Tier 1: Poster

```
POST /preview/poster
Body: { "source_path": "/path/to/file.mov" }
Response: { "poster_url": "/preview/poster/abc123.jpg", "source_info": {...} }

GET /preview/poster/{filename}
Response: JPEG image
```

### Tier 2: Burst

```
POST /preview/burst
Body: { "source_path": "/path/to/file.mov", "count": 7 }
Response: { "hash_id": "abc123", "thumbnails": [...], "source_duration": 120.5 }

GET /preview/burst/{hash_id}/{index}.jpg
Response: JPEG image
```

### Tier 3: Video

```
POST /preview/generate
Body: { 
  "source_path": "/path/to/file.mov", 
  "max_duration": 10,
  "confirm_raw": true  // Required for RAW formats
}
Response: { "preview_url": "/preview/abc123.mp4", ... }
```

## Frontend Integration

### useTieredPreview Hook

The `useTieredPreview` hook manages all preview state:

```typescript
const preview = useTieredPreview(backendUrl)

// Tier 1 — called automatically on source selection
preview.requestPoster(sourcePath)

// Tier 2 — user-initiated
preview.requestBurst(sourcePath)

// Tier 3 — user-initiated, requires explicit action
preview.requestVideo(sourcePath, duration, confirmRaw?)

// State
preview.mode        // 'poster' | 'burst' | 'video' | 'none'
preview.poster      // PosterInfo | null
preview.burst       // BurstInfo | null
preview.video       // VideoPreviewInfo | null
preview.burstIndex  // Current thumbnail index for scrub
```

### MonitorSurface Component

The `MonitorSurface` component renders the appropriate tier:

- **source-loaded state**: Shows poster by default
- **PreviewModeBadge**: Indicates current tier (Poster/Thumbnails/Preview Video)
- **PreviewMenu**: User-initiated video generation menu (top-right)
- **BurstStrip**: Horizontal thumbnail scrub (when in burst mode)

## Cache Management

```
GET /preview/cache-stats
Response: { "poster": {...}, "burst": {...}, "video": {...} }

DELETE /preview/cache
Query: ?tier=all|poster|burst|video
```

## UX Flow

1. User selects source file
2. Poster frame appears **immediately** (within 2s)
3. User can click "Preview" button to open menu
4. Menu shows duration options (1s, 5s, 10s, More...)
5. Selecting duration generates video preview
6. For RAW: confirmation dialog appears first
7. During generation: spinner + "Generating..." badge
8. On completion: video mode activates, playback available

## What This Is NOT

- **NOT a timeline preview** — No cut-level accuracy
- **NOT a color-accurate preview** — Basic debayer only for RAW
- **NOT a replacement for Resolve/FCPX** — Identification only
- **NOT auto-generated** — Higher tiers require explicit action

## Migration from Legacy

The legacy `usePreviewProxy` hook auto-generated video previews on source selection.
This was problematic because:

1. Blocked UI during generation
2. Wasted resources on unwanted previews
3. Especially slow/expensive for RAW media
4. Violated the "never block" principle

The new tiered system:
- Shows poster immediately (no blocking)
- Video is opt-in only
- RAW requires confirmation
- Resources used only when requested

---

*Last Updated: 2025*
