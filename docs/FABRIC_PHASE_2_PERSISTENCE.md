# FABRIC PHASE 2: PERSISTENCE & HISTORY

**Status**: Implemented  
**Schema Version**: 1  
**Storage**: SQLite (embedded)

---

## PURPOSE

Persist Fabric Phase-1 ingestion data so that:

- Data survives process restarts
- Historical queries are possible  
- Semantics remain identical to in-memory Fabric

This is **STORAGE, not INTELLIGENCE**.

---

## WHAT PERSISTENCE PROVIDES

### Guarantees

1. **Durability**: Jobs survive process restarts
2. **Transactional Writes**: No partial job records (ACID)
3. **Idempotent Ingestion**: Same `job_id` overwrites previous record
4. **Deterministic Rebuild**: Indexes rebuilt identically from storage
5. **Explicit Schema**: Version tracked in database (`PRAGMA user_version`)
6. **Corruption Detection**: `PRAGMA integrity_check` fails loudly

### Data Integrity

- All writes are atomic transactions
- Foreign keys enforced
- Schema version explicit (no silent migration)
- Corruption = immediate failure

---

## WHAT PERSISTENCE DOES NOT PROVIDE

Explicitly **FORBIDDEN**:

1. **Auto-Migration**: Schema version mismatch = loud failure
2. **Background Compaction**: No automatic optimization
3. **Retention Policies**: Fabric remembers forever
4. **Deletion**: Operator must manually remove storage file
5. **Data Healing**: Corrupted database = unrecoverable error
6. **Performance Optimization**: Correctness over speed

---

## STORAGE MODEL

### Choice: SQLite

**Rationale**:
- Embedded (no external dependencies)
- ACID transactions (no partial writes)
- Explicit schema versioning (`user_version` pragma)
- Built-in corruption detection
- Idempotent writes via `INSERT OR REPLACE`

### Schema Structure

**Table: `jobs`**
```sql
job_id TEXT PRIMARY KEY
final_status TEXT NOT NULL
started_at TEXT NOT NULL
canonical_proxy_profile TEXT
fingerprint TEXT
validation_stage TEXT
validation_error TEXT
engine_used TEXT
resolve_preset_used TEXT
jobspec_version TEXT
completed_at TEXT
ingested_at TEXT NOT NULL
total_clips INTEGER NOT NULL
completed_clips INTEGER NOT NULL
failed_clips INTEGER NOT NULL
outputs_json TEXT NOT NULL
```

**Indexes**:
- `idx_jobs_fingerprint` (WHERE fingerprint IS NOT NULL)
- `idx_jobs_profile` (WHERE canonical_proxy_profile IS NOT NULL)
- `idx_jobs_status`
- `idx_jobs_engine` (WHERE engine_used IS NOT NULL)

### Data Format

- Datetimes: ISO 8601 strings
- Outputs: JSON array (serialized `IngestedOutput` list)
- No compression, no binary encoding

---

## ARCHITECTURE

### Components

1. **`fabric/storage.py`**: SQLite wrapper, schema management
2. **`fabric/persistence.py`**: High-level API for reads/writes
3. **`fabric/index.py`**: Rebuilds in-memory indexes from storage
4. **`fabric/queries.py`**: Query semantics unchanged

### Data Flow

```
Ingestion → Persistence → Storage (SQLite)
                ↓
           Index Rebuild (on startup)
                ↓
           Queries (memory-backed)
```

### Startup Sequence

1. Open persistence layer
2. Check schema version (fail if mismatch)
3. Run integrity check (fail if corrupted)
4. Load all jobs from storage
5. Rebuild in-memory indexes deterministically

### Write Path

1. Receive `IngestedJob`
2. Begin transaction
3. `INSERT OR REPLACE INTO jobs`
4. Commit (or rollback on error)
5. Update in-memory indexes

---

## USAGE

### Initialization

```python
from fabric.persistence import create_persistence
from fabric.index import FabricIndex

# Create persistence (default: ~/.proxx/fabric/fabric.db)
persistence = create_persistence()
persistence.open()

# Create index with persistence
index = FabricIndex(persistence=persistence)

# Index automatically rebuilds from storage
```

### Adding Jobs

```python
from fabric.ingestion import ingest_execution_result

# Ingest job (idempotent)
job = ingest_execution_result(result_json_path)
index.add_job(job)  # Persists AND indexes
```

### Querying

```python
from fabric.queries import FabricQueries

queries = FabricQueries(index)

# Query semantics unchanged from Phase 1
job = queries.get_job("job_abc123")
failed_jobs = queries.get_failed_jobs()
```

### Cleanup

```python
persistence.close()
```

---

## FAILURE MODES

### Schema Version Mismatch

**Symptom**: `StorageError: Schema version mismatch: expected 1, found 0`

**Cause**: Database from different Fabric version

**Resolution**: 
- Operator must handle migration manually
- OR delete storage file (loses history)

**Fabric Does NOT**: Auto-migrate

---

### Database Corruption

**Symptom**: `StorageCorruptionError: Database corruption detected`

**Cause**: Disk failure, process kill during write, filesystem corruption

**Resolution**:
- Restore from backup
- OR delete storage file (loses history)

**Fabric Does NOT**: Repair corrupted data

---

### Disk Full

**Symptom**: `StorageError: Failed to persist job: database or disk is full`

**Cause**: No disk space for write

**Resolution**: Operator must free disk space

**Fabric Does NOT**: Compact or delete old data

---

### Missing Storage File

**Symptom**: Fresh database created at default path

**Cause**: First run OR storage file deleted

**Resolution**: Normal operation (empty history)

**Fabric Does NOT**: Warn about missing history

---

## OPERATOR RESPONSIBILITIES

1. **Backup**: Periodic backups of `~/.proxx/fabric/fabric.db`
2. **Disk Space**: Monitor storage size, free space if needed
3. **Schema Migration**: Handle version mismatches manually
4. **Corruption Recovery**: Restore from backup or accept data loss
5. **Deletion**: Manually remove database file if reset needed

**Fabric remembers. Humans decide what to forget.**

---

## TESTING

See `qa/test_fabric_persistence.py`:

- Persistence across process restart
- Idempotent ingestion with persistence
- Index rebuild correctness
- Corruption detection
- Query parity with Phase-1 behavior

---

## FUTURE CONSIDERATIONS

**NOT in Phase 2**:

- Query pagination
- Storage compression
- Remote storage backends
- Automatic retention policies
- Performance optimization
- Multi-process concurrency

**If needed**: Operator must implement externally.

---

## FILES MODIFIED

- `fabric/storage.py` (NEW)
- `fabric/persistence.py` (NEW)
- `fabric/index.py` (MODIFIED - storage-backed rebuild)
- `fabric/queries.py` (MODIFIED - documentation only)
- `docs/FABRIC_PHASE_2_PERSISTENCE.md` (NEW)
- `qa/test_fabric_persistence.py` (NEW)

---

**End of Phase 2 Documentation**
