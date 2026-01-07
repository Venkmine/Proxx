# INTENT.md

**Proxx (formerly Forge)** is a local-first, deterministic post-production automation tool for ingest, proxying, and delivery. It prioritizes execution reliability, observability, and auditability over convenience. Jobs are defined by immutable JobSpecs, validated through QC, and executed with full traceability. It is not an NLE, not a creative tool, and not a decision-making system.

---

## In-Scope Guarantees

These are **invariants**. Violating these breaks the project's contract:

1. **Execution must be deterministic and observable**  
   Same JobSpec + same source → same output. Every decision is traceable.

2. **No execution without QC validation**  
   JobSpecs are validated before execution. Invalid specifications fail fast with clear errors.

3. **JobSpec is immutable once execution begins**  
   Configuration cannot change mid-execution. Mutation is a violation.

4. **Presets are templates, not behavior**  
   Presets compile to JobSpecs. They do not control execution directly. Changing a preset never affects existing jobs.

5. **Watch folders are automation, not decision-makers**  
   Watch folders trigger jobs from JobSpecs. They do not interpret, guess, or "fix" configurations.

6. **FIFO execution is preserved unless explicitly redesigned**  
   Jobs execute in order. Concurrency and parallelism are future features, not assumptions.

7. **Diagnostics are read-only**  
   Diagnostic layers (FFmpeg capabilities, execution policy) explain behavior. They do not alter execution paths, presets, or performance settings.

---

## Explicit Non-Goals

Proxx will **NOT** attempt the following:

- **NLE replacement**  
  Proxx is not DaVinci Resolve, Premiere, or Avid. It proxies and delivers. It does not edit.

- **Creative decision-making**  
  Proxx does not choose codecs, resolutions, or LUTs based on "best practices." Users specify intent explicitly.

- **AI decides settings**  
  No machine learning models that "optimize" encoding or "predict" user intent. Explicit configuration only.

- **Silent automation**  
  No hidden fallbacks, no implicit retries, no "helpful" corrections. Failures surface with actionable errors.

- **Cloud dependency by default**  
  Proxx is local-first. Cloud integrations are optional extensions, not core requirements.

- **Hidden performance magic**  
  GPU acceleration, hardware encoders, and optimizations are capability-aware and observable. No invisible speed hacks.

- **Auto engine switching**  
  FFmpeg vs Resolve routing is explicit. The system does not silently switch engines based on heuristics.

---

## Execution Philosophy

### Engine Roles

- **FFmpeg**: CPU-bound codecs, broad format support, scriptable pipelines  
- **Resolve**: GPU-accelerated codecs, RAW decoding, professional color workflows

Engines are chosen at job creation, not dynamically during execution.

### Hardware Acceleration

- Detection is **observational**, not prescriptive  
- GPU decode ≠ GPU encode  
- ProRes has **no GPU encoder in FFmpeg** (hard assertion)  
- Capability reports explain reality, they do not enable features

### Performance and Correctness

- Correctness precedes performance  
- Optimizations are explicit, measurable, and documented  
- No "trust me" speed improvements  
- Execution time is observable, not estimated

### Diagnostics

- Diagnostics explain **why**, not **what to do**  
- Execution policy reports are read-only intelligence  
- FFmpeg capabilities are detection, not configuration  
- QC reports are post-execution truth, not mid-execution guidance

---

## Copilot / AI Contribution Rules

These rules apply to all AI-assisted code contributions, including GitHub Copilot, code generation tools, and LLM-based assistants:

### 1. Scope Discipline

- **Do not introduce features outside this INTENT.md without explicit instruction**  
  If a feature is not in-scope or contradicts a non-goal, reject it. Ask for clarification.

- **Do not add "helpful" automation that weakens guarantees**  
  No silent fallbacks. No implicit retries. No "fixing" invalid JobSpecs during execution.

### 2. Explanation Over Invention

- **Prefer explaining constraints over inventing solutions**  
  If a request conflicts with project intent, explain why rather than implementing a workaround.

- **Do not implement speculative features**  
  "This might be useful later" is not a valid reason. Implement what is explicitly requested.

### 3. QC Integrity

- **Do not weaken QC tests assuming "tests will catch it"**  
  Tests enforce invariants. Do not write code that bypasses validation, assuming tests will fail.

- **Do not stub out validation for convenience**  
  Validation exists to prevent invalid states. Stubbing validation is a contract violation.

### 4. Reconciliation Requirement

- **Reconcile all suggestions against INTENT.md before proposing changes**  
  If a suggestion contradicts an invariant or non-goal, flag it explicitly. Do not proceed silently.

- **If a change weakens an invariant, stop and ask**  
  Execution determinism, JobSpec immutability, and QC validation are non-negotiable.

### 5. Diagnostic Discipline

- **Read-only means read-only**  
  Diagnostic layers (execution policy, FFmpeg capabilities) must have **zero side effects** on execution. No "improving" execution based on detected capabilities.

- **No config flags for diagnostics**  
  Diagnostics explain reality. They do not create settings, flags, or toggles that alter behavior.

### 6. Documentation Standards

- **Do not add TODOs without explicit approval**  
  TODOs in code imply deferred work. Deferred work implies incomplete features. Incomplete features violate determinism.

- **Do not use marketing language in technical documentation**  
  "Blazing fast," "seamless," "intelligent" are banned. Use precise, measurable descriptions.

---

## How to Use This File

### For Humans

1. **Before adding a feature**: Check if it violates a non-goal or weakens an invariant  
2. **During code review**: Reconcile changes against INTENT.md  
3. **When debugging scope creep**: Reference this file as the project contract

### For Copilot / AI Assistants

1. **Before generating code**: Verify the request does not conflict with non-goals  
2. **Before suggesting a workaround**: Check if it weakens an invariant  
3. **When asked to add automation**: Confirm it maintains observability and auditability  
4. **When proposing optimizations**: Ensure they are explicit and measurable, not hidden

---

## Governance

This file is a **living contract**. Changes require:

- Explicit discussion of which invariants/non-goals are affected  
- Documented rationale for why the change aligns with project intent  
- Verification that existing tests and guarantees remain intact

**INTENT.md is not a suggestion. It is the definition of the project.**
