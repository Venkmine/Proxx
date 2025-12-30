# V2 Watch Folder: Recursive Support - UI Implementation Note

## Status

Backend implementation is **COMPLETE** and tested.

UI implementation is **DEFERRED** because:
- The `apps/operator-ui/` directory is currently empty
- No existing watch folder UI to extend
- Backend CLI flag `--recursive` is fully functional

## Backend Implementation

The recursive feature is fully functional via CLI:

```bash
# Non-recursive (default)
python -m backend.v2.watch_folder_runner ./watch

# Recursive
python -m backend.v2.watch_folder_runner ./watch --recursive
```

## Future UI Requirements

When the operator UI is built, add a single checkbox:

### Specification

- **Label**: "Include subfolders"
- **Default**: Unchecked (false)
- **Location**: Watch folder configuration panel
- **Behavior**: Maps directly to `--recursive` CLI flag

### Implementation Guidance

The UI should pass the `recursive` boolean to the watch folder runner when starting a watch job.

Example JSON config that might be passed:

```json
{
  "watch_folder": "/path/to/watch",
  "poll_seconds": 2,
  "max_workers": 1,
  "recursive": true
}
```

### No Additional UI Required

- ❌ No tooltips needed
- ❌ No preview of subdirectories
- ❌ No folder tree visualization
- ❌ No special styling

Just a simple checkbox that toggles the boolean.

## Testing

The backend implementation includes comprehensive tests in:
- `backend/tests/test_v2_watch_folder_recursive.py`

All 18 tests pass, covering:
- Non-recursive mode (unchanged behavior)
- Recursive mode (new feature)
- Deterministic ordering
- Edge cases (deep nesting, special characters, symlinks)
- Comparison between modes

## Documentation

See [V2_WATCH_FOLDERS.md](../V2_WATCH_FOLDERS.md) for:
- Usage examples
- Deterministic ordering rules
- Non-goals and scope

---

**Implementation Date**: 2025-12-30  
**Status**: Backend complete, UI deferred until operator-ui is built
