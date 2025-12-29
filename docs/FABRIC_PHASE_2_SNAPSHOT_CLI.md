# Fabric Phase-2 Snapshot CLI

**Read-only operator utility for snapshot creation and diffing.**

## Purpose

The Fabric Snapshot CLI provides a minimal, read-only interface for:

1. **Creating snapshots** - Capturing the current state of Fabric reports as immutable JSON
2. **Diffing snapshots** - Comparing two snapshots to identify changes

This is a **PURE UTILITY LAYER** for observational purposes only.

## Commands

### snapshot

Create a JSON snapshot from the current Fabric database state.

```bash
python scripts/fabric_snapshot.py snapshot /path/to/fabric.db > snapshot.json
```

**Output:** JSON snapshot written to stdout

```json
{
  "generated_at": "2025-12-29T12:34:56.789Z",
  "report": {
    "generated_at": "2025-12-29T12:34:56.789Z",
    "execution_summary": { ... },
    "failure_summary": { ... },
    "engine_health": { ... },
    "proxy_profile_stability": { ... },
    "determinism": { ... }
  },
  "snapshot_id": "a1b2c3d4e5f6..."
}
```

### diff

Compare two snapshots and output the differences.

```bash
python scripts/fabric_snapshot.py diff snapshot_a.json snapshot_b.json > diff.json
```

**Output:** Diff JSON written to stdout

```json
{
  "changes": {
    "determinism": {
      "new_non_deterministic_jobs": [],
      "resolved_non_deterministic_jobs": []
    },
    "engine_health": {
      "ffmpeg": {
        "completion_rate": {
          "from": 0.95,
          "to": 0.98,
          "delta": 0.03
        },
        "failure_rate": {
          "from": 0.05,
          "to": 0.02,
          "delta": -0.03
        }
      }
    },
    "execution_summary": {
      "completed_jobs": {
        "from": 100,
        "to": 150,
        "delta": 50
      },
      "failed_jobs": {
        "from": 5,
        "to": 3,
        "delta": -2
      }
    },
    "proxy_profile_stability": {
      "new_unstable_profiles": [],
      "resolved_unstable_profiles": []
    }
  },
  "from_snapshot": "a1b2c3d4e5f6...",
  "to_snapshot": "b2c3d4e5f6a7..."
}
```

## Exit Codes

- **0** - Success
- **1** - Invalid input (missing file, malformed JSON, etc.)
- **2** - Diff computation error

## Guarantees

### Determinism

- **Same input → same snapshot_id**: Content-based hashing ensures identical reports produce identical snapshot IDs
- **Same snapshots → same diff**: Diff computation is deterministic and repeatable
- **Sorted output**: All arrays in output are deterministically sorted
- **Float precision**: Float deltas are rounded to 3 decimal places

### Read-Only Behavior

- **No filesystem writes** (except stdout redirection)
- **No database mutations**
- **No side effects**
- **No background processes**
- **No retries**

### Input Validation

- **Explicit paths required**: No defaults, no implicit behavior
- **JSON validation**: Malformed JSON is rejected with clear errors
- **Missing files detected**: Non-existent paths fail immediately

## Explicit Non-Goals

❌ **NOT for automation** - This is an observational utility only  
❌ **NOT for persistence** - No built-in file writes or storage  
❌ **NOT for interpretation** - Reports facts, not recommendations  
❌ **NOT for execution** - No coupling to job execution or orchestration  
❌ **NOT for UI** - Pure CLI utility, no web interface  
❌ **NOT for heuristics** - No scoring, labeling, or inference  
❌ **NOT for thresholds** - No automatic judgments about "good" or "bad"  
❌ **NOT for alerts** - No notifications or monitoring integration  

## Warning

**⚠️ OBSERVATIONAL ONLY**

Snapshots are point-in-time captures with **NO OPERATIONAL MEANING**.

- They do not trigger actions
- They do not influence execution
- They do not persist automatically
- They do not represent "truth" beyond their capture time

**Humans decide what changes mean and what actions to take.**

## Integration Examples

### Manual Change Tracking

```bash
# Capture baseline
python scripts/fabric_snapshot.py snapshot fabric.db > baseline.json

# Run some jobs...
# (via Proxx execution, NOT this tool)

# Capture new state
python scripts/fabric_snapshot.py snapshot fabric.db > current.json

# Review changes
python scripts/fabric_snapshot.py diff baseline.json current.json
```

### CI/CD Reporting

```bash
# In CI pipeline
python scripts/fabric_snapshot.py snapshot fabric.db > snapshot_${BUILD_ID}.json

# Archive snapshot as build artifact
# (external tool, NOT this script)
```

### Manual Investigation

```bash
# Create snapshot for debugging
python scripts/fabric_snapshot.py snapshot fabric.db | jq .

# Compare with previous snapshot
python scripts/fabric_snapshot.py diff old.json new.json | jq .changes
```

## Architecture

### Utility Layer

[fabric/utils/snapshot_cli.py](../fabric/utils/snapshot_cli.py)

Pure utility functions that wrap Fabric Phase-2 APIs:
- `create_snapshot_json(intelligence)` → dict
- `diff_snapshot_json(a, b)` → dict

### CLI Wrapper

[scripts/fabric_snapshot.py](../scripts/fabric_snapshot.py)

Minimal argparse wrapper that:
- Handles command-line arguments
- Validates paths and files
- Calls utility functions
- Prints JSON to stdout
- Returns appropriate exit codes

### Fabric Phase-2 Dependencies

- `FabricIntelligence` - Read-only query layer
- `FabricReportExporter` - Report export to JSON
- `create_snapshot_from_report()` - Snapshot creation
- `diff_snapshots()` - Snapshot diffing

## Testing

See [fabric/tests/test_snapshot_cli.py](../fabric/tests/test_snapshot_cli.py) for comprehensive tests covering:

- Snapshot determinism
- Diff determinism
- Empty dataset behavior
- Invalid JSON handling
- No mutation of inputs
- Sorting guarantees
- No filesystem writes

## Related Documentation

- [V2_PHASE_2_FAILURE_MODEL.md](V2_PHASE_2_FAILURE_MODEL.md) - Phase-2 architecture
- [V2_WATCH_FOLDERS.md](../V2_WATCH_FOLDERS.md) - Execution model
- [V2_REAL_WORLD_LOG.md](../V2_REAL_WORLD_LOG.md) - Development log

---

**Remember: This tool observes. Humans decide.**
