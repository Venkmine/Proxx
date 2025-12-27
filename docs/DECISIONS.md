INACTIVE — DOES NOT DESCRIBE CURRENT PRODUCT STATE (ALPHA)

PRODUCT_PROXY_V1.md

QA.md (Verify principles stay, “Definition of Done” does not)

NEXT_AFTER_V1.md

# Awaire Proxy — Irreversible Decisions

Only decisions that should never be re-litigated live here.

## Execution Engine

- FFmpeg is the sole execution engine
- No Resolve integration in v1
- Subprocess execution, not library binding

## Codecs

- ProRes, DNxHR, H.264 are supported
- Intra-frame codecs are editorial defaults
- Long-GOP codecs warn but do not block

## Presets

- Global presets reference category presets
- Category presets are reusable libraries
- Presets are data, not hardcoded logic

## Reliability

- Warn-and-continue is the default
- Filesystem is the final authority
- Reports are first-class outputs

## Naming

- Product is "Awaire Proxy"
- All identifiers use `awaire_proxy_*` (snake_case)
- No Fabric, Proxx, or multi-module language

## QA

- Verify is the QA system
- Definition of Done is enforced
- Every bug gets a regression test

## Overlays (v1 — December 2024)

**Decision: Preview-only overlays for v1. No overlay state persisted to jobs.**

### What This Means

1. **Overlays are purely visual feedback** — They show what *could* be burned in, but are not serialized to job payloads
2. **No drag/scale position editing** — Removed from v1 scope
3. **No overlay modes** — The view/overlays/burn-in mode system is removed
4. **Text watermark only** — The legacy watermark feature (single text overlay via `drawtext`) remains functional
5. **Timecode burn-in deferred** — Will be added in v2 as a fixed-position, always-rendered feature

### Rationale

- The overlay system accrued significant complexity (layers, scopes, modes, position sources, drag handles)
- Position editing was preview-only anyway (not wired to FFmpeg output coordinates)
- Removing this complexity eliminates a class of bugs and confusion
- Text watermark covers the MVP use case
- v2 can add proper burn-in with simpler, output-focused implementation

### What Was Removed

- `OverlayLayer` system with scope, order, positionSource
- Preview modes (`view`, `overlays`, `burn-in`) and `PreviewModeInteraction` gating
- Overlay selection boxes, drag handles, scale handles
- `timecode_overlay` and `image_watermark` job serialization
- Complex overlay panels (`BurnInsEditor`, `TimecodeBurnInPanel`, etc.)

### What Remains

- Static text watermark (legacy `watermark_text` in job settings)
- Visual preview of where overlays *would* appear (non-interactive)

### Not Negotiable

This decision is final for v1. Do not re-add overlay complexity without explicit v2 planning.
