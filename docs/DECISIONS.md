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
