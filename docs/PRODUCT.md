INACTIVE — DOES NOT DESCRIBE CURRENT PRODUCT STATE (ALPHA)

PRODUCT_PROXY_V1.md

QA.md (Verify principles stay, “Definition of Done” does not)

NEXT_AFTER_V1.md

# Awaire Proxy — Product Definition

## What Awaire Proxy Is

Awaire Proxy is a boring, reliable, watch-folder proxy generator.

It is designed to:
- Watch folders for new media
- Generate proxies deterministically
- Run overnight without supervision
- Survive bad footage, bad mounts, and restarts
- Fail loudly when something goes wrong

FFmpeg is the execution engine.

## What Awaire Proxy Is NOT

Awaire Proxy is not:
- A copy or ingest tool
- A media management system
- A creative color pipeline
- A consumer application
- A DaVinci Resolve integration
- A platform or suite

If a feature drifts toward any of the above, it is out of scope.

## Target Users

- Assistant editors
- Post-production engineers
- Freelancers running proxy workflows

Freelancers are self-serve and unsupported by design.

## Success Criteria

Success is defined as:
- Watch folders detect new media exactly once
- Jobs complete unattended
- Failures are visible, explainable, and non-blocking
- Outputs can be trusted without manual spot checking
- Restarts do not cause duplication

## Explicit Non-Goals

- No Resolve integration
- No ingest/copy tooling
- No checksums
- No automation chains
- No federation
- No enterprise features
- No platform promises
- No roadmap commitments
