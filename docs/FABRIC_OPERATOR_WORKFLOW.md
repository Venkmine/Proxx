# Fabric Operator Workflow

**Status:** ACTIVE  
**Effective Date:** 29 December 2025

---

## Workflow Overview

This document defines the minimal operator workflow for manual decisioning using Fabric data.

---

## Step 1: Generate Snapshot A

### Fabric Provides

- Snapshot generation capability
- Point-in-time system state capture
- Persistent storage of snapshot data

### Fabric Does NOT Provide

- Automatic snapshot scheduling
- Snapshot triggers
- Snapshot recommendations

### Human Judgment

The operator determines when to generate a snapshot and which scope to capture.

---

## Step 2: Generate Snapshot B

### Fabric Provides

- Snapshot generation capability
- Point-in-time system state capture
- Persistent storage of snapshot data

### Fabric Does NOT Provide

- Automatic follow-up snapshots
- Time-based scheduling
- Change detection triggers

### Human Judgment

The operator determines when a second snapshot is warranted and initiates capture.

---

## Step 3: Compute Diff

### Fabric Provides

- Diff computation between two snapshots
- Structured change representation
- Persistence of diff results

### Fabric Does NOT Provide

- Automatic diff computation
- Change significance assessment
- Priority assignment

### Human Judgment

The operator selects which snapshots to compare and initiates diff computation.

---

## Step 4: Review Changes

### Fabric Provides

- Diff data access
- Report generation
- Export capability

### Fabric Does NOT Provide

- Change interpretation
- Impact assessment
- Recommendations
- Severity classification

### Human Judgment

The operator interprets diff results and determines significance.

---

## Step 5: Decide Action

### Fabric Provides

- Data necessary for informed decision
- Historical context via snapshots
- Change visibility via diffs

### Fabric Does NOT Provide

- Decision recommendations
- Automatic actions
- Policy enforcement
- Action execution

### Human Judgment

The operator decides one of:

- Retry: Manually re-execute a failed job
- Ignore: Accept the current state without action
- Escalate: Defer to another authority for investigation

---

## Constraints

- No user interface assumptions are made
- No automation is permitted
- No future features are referenced

---

## Binding Terms

This workflow governs operator interaction with Fabric. All decisions and actions are the sole responsibility of the operator.
