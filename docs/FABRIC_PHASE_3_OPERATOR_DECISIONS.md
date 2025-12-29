# Fabric Phase-3: Operator Decision Contract

**Status:** DRAFT  
**Effective Date:** 29 December 2025

---

## Purpose

Phase-3 defines a human-driven decision layer.

The operator SHALL:

- Consume Fabric snapshots, reports, and diffs
- Make explicit human decisions based on Fabric data

---

## Allowed Operator Decisions

The following decisions are permitted and require explicit human action:

- Manually retry a job
- Ignore a failure
- Escalate for investigation
- Annotate an outcome (recorded outside Fabric)

---

## Explicit Non-Features

The following capabilities are explicitly excluded from Phase-3:

- No automatic retries
- No alerting
- No scoring or ranking
- No background evaluation
- No policy enforcement

---

## Contract Rules

### Immutability

Fabric data is immutable input. Operator decisions SHALL NOT alter Fabric state.

### Separation

Operator decisions are recorded outside Fabric. Fabric remains a read-only data source.

### Accountability

Accountability for all decisions belongs to the operator, not the system.

### Boundary

Fabric provides information. The operator provides judgment.

---

## Glossary

| Term | Definition |
|------|------------|
| Operator | A human actor authorized to make decisions based on Fabric data |
| Snapshot | A point-in-time capture of system state produced by Fabric |
| Diff | A computed comparison between two snapshots |
| Report | A structured summary of Fabric intelligence |
| Decision | An explicit human action taken outside Fabric |
| Escalation | A decision to defer judgment to another authority |
| Annotation | A human-provided note recorded outside Fabric |

---

## Binding Terms

This contract governs all Phase-3 operator interactions with Fabric. Deviations require formal amendment.
