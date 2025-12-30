# Fabric Phase-3: View Exports

## Purpose

Deterministic serialization of composed views to human-readable and machine-readable formats.

This is a **PRESENTATION-ONLY** layer that converts outputs from `FabricViewComposer` to JSON and text formats.

## Scope

**Inputs**: Outputs from `FabricViewComposer` only:
- `list[JobWithAnnotations]`
- `list[SnapshotWithAnnotations]`

**Outputs**: Formatted strings (JSON or text):
- No filesystem writes
- No mutation of inputs
- No side effects

## Explicit Non-Goals

This module does **NOT**:
- Filter data
- Aggregate or summarize
- Generate alerts
- Trigger execution
- Interpret meaning
- Add context or inference
- Persist to storage
- Make decisions

## API

### `FabricViewExporter`

```python
class FabricViewExporter:
    def export_jobs_view_json(self, jobs: list[JobWithAnnotations]) -> str:
        """Export jobs with annotations to JSON format."""
        
    def export_jobs_view_text(self, jobs: list[JobWithAnnotations]) -> str:
        """Export jobs with annotations to human-readable text format."""
        
    def export_snapshots_view_json(self, snapshots: list[SnapshotWithAnnotations]) -> str:
        """Export snapshots with annotations to JSON format."""
        
    def export_snapshots_view_text(self, snapshots: list[SnapshotWithAnnotations]) -> str:
        """Export snapshots with annotations to human-readable text format."""
```

## Constraints

### Allowed Imports
- `fabric.views.views` (JobWithAnnotations, SnapshotWithAnnotations)
- `fabric.operator_annotations.models` (OperatorAnnotation)
- Standard library only (json, typing, dataclasses)

### Forbidden Imports
- No execution modules
- No retry logic
- No persistence
- No policy
- No scoring
- No workflow

### Function Purity
All methods must be pure functions:
- No side effects
- No mutation of inputs
- Deterministic output for same inputs
- No I/O operations (except return strings)

## Deterministic Output

All export methods guarantee:
1. **Stable field ordering**: JSON keys are sorted
2. **Consistent formatting**: Same inputs → same outputs
3. **No randomness**: No timestamps, UUIDs, or random values introduced
4. **Reproducible**: Can be tested with exact string matching

## Design Rationale

### Why Separate from Views?

`FabricViewComposer` composes data structures in memory.
`FabricViewExporter` serializes those structures to strings.

Separation allows:
- Different serialization formats without changing composition logic
- Testing composition independently from serialization
- Pluggable exporters (JSON, text, XML, etc.) without coupling

### Why No Filesystem Access?

Return strings instead of writing files because:
- Caller controls where/when to write (e.g., HTTP response, file, stdout)
- Easier to test (no temp files or mocking)
- More composable (can pipe to other functions)
- No I/O errors in this layer

### Why No Filtering/Aggregation?

This is a presentation layer only. Any filtering or aggregation is a separate concern that should happen before calling these methods.

If filtering is needed, it should be done by:
1. Creating a new composition method in `FabricViewComposer`, or
2. Filtering the list before passing to exporter

This keeps the exporter focused on serialization only.

## Usage Example

```python
from fabric.fabric_store import FabricStore
from fabric.operator_annotations.store import AnnotationStore
from fabric.views.views import FabricViewComposer
from fabric.view_exports.export import FabricViewExporter

# Setup (phase-2 components)
fabric_store = FabricStore(...)
annotation_store = AnnotationStore(...)
composer = FabricViewComposer(fabric_store, annotation_store)

# Compose views (phase-2)
jobs = composer.jobs_with_annotations()

# Export to formats (phase-3)
exporter = FabricViewExporter()
json_output = exporter.export_jobs_view_json(jobs)
text_output = exporter.export_jobs_view_text(jobs)

# Caller decides what to do with strings
print(text_output)
# or: write to file
# or: send over HTTP
# or: pipe to another function
```

## Testing Strategy

Tests must verify:
1. **Deterministic output**: Same input → same output
2. **Empty views**: Handles empty lists gracefully
3. **Stable field ordering**: Keys are always in same order
4. **No mutation**: Input objects unchanged after export
5. **JSON validity**: All JSON outputs parse correctly
6. **Text output stability**: No newline issues, consistent formatting

## Future Extensions

Possible future additions (not in scope for phase-3):
- CSV export
- XML export
- HTML export
- Markdown export
- Streaming exports for large datasets

All future exporters must follow the same constraints:
- Pure functions
- No I/O (return strings only)
- Deterministic output
- No filtering/aggregation
