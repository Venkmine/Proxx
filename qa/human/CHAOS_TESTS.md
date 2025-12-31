# Human Chaos Tests

## Purpose

These tests verify Forge's behavior under real-world failure conditions that cannot be reliably simulated programmatically. Each test requires a human operator to physically trigger a failure condition and observe Forge's response.

**These are NOT automated tests. They require human action and judgment.**

---

## Test Protocol

For each test:

1. Read the entire test procedure before beginning
2. Verify all preconditions are met
3. Execute each step in order, exactly as written
4. Observe Forge's behavior carefully
5. Compare observed behavior against expected behavior
6. Record PASS, FAIL, or FAIL + notes
7. Do not skip steps or improvise

---

## FAIL Criteria (Universal)

A test FAILS if ANY of the following occur:

- Forge reports success when files are missing or corrupt
- Forge silently continues after unrecoverable error
- Forge leaves partial/corrupt output without clear warning
- Forge hangs indefinitely without timeout
- Forge provides misleading progress information
- Job state becomes inconsistent with filesystem state

---

## Test Index

| Test ID | Name | Category |
|---------|------|----------|
| HC-01 | Disconnect source drive mid-encode | Storage Failure |
| HC-02 | Make output directory read-only mid-job | Permissions |
| HC-03 | Kill Resolve process during render | Process Failure |
| HC-04 | Kill FFmpeg process during encode | Process Failure |
| HC-05 | Eject SD card during ingest | Storage Removal |
| HC-06 | Network share disappears mid-job | Network Failure |
| HC-07 | Machine sleeps during job | System State |
| HC-08 | Resolve launched manually before job start | Resource Conflict |

---

## HC-01: Disconnect Source Drive Mid-Encode

### Purpose

Verify that Forge fails cleanly when source media becomes unavailable during encoding.

### Preconditions

- [ ] External drive connected with source video files
- [ ] Forge is NOT running
- [ ] No Resolve or FFmpeg processes running
- [ ] Output directory is on local (non-removable) storage

### Procedure

1. Connect external drive with at least 3 video files (100MB+ each)
2. Start a Forge job using these files as sources
3. Wait until progress shows at least 1 file completed
4. **While encoding is in progress**: Physically disconnect the external drive
5. Observe Forge's response

### Expected Behavior

- [ ] Forge detects source unavailability within 30 seconds
- [ ] Forge reports which specific file(s) became unavailable
- [ ] Forge does NOT report the job as successful
- [ ] Forge does NOT leave orphaned/corrupt output files without warning
- [ ] Any completed files remain intact with correct metadata
- [ ] Job status reflects partial failure (not success)

### FAIL Conditions

- Forge reports "Success" or "Complete"
- Forge hangs indefinitely
- Forge crashes without error message
- Corrupt output files are created without warning
- Error message does not identify the missing source

### Result

```
[ ] PASS
[ ] FAIL

Notes:
_____________________________________________
_____________________________________________
_____________________________________________
```

---

## HC-02: Make Output Directory Read-Only Mid-Job

### Purpose

Verify that Forge fails cleanly when write permissions are revoked during encoding.

### Preconditions

- [ ] Output directory exists with write permissions
- [ ] Source files are on local (reliable) storage
- [ ] Forge is NOT running
- [ ] Terminal access available to change permissions

### Procedure

1. Create output directory: `mkdir -p /tmp/forge_test_output`
2. Verify writable: `touch /tmp/forge_test_output/test && rm /tmp/forge_test_output/test`
3. Start Forge job with multiple source files (at least 5)
4. Wait until at least 1 file is being written
5. In separate terminal: `chmod 000 /tmp/forge_test_output`
6. Observe Forge's response
7. After test: `chmod 755 /tmp/forge_test_output` to cleanup

### Expected Behavior

- [ ] Forge detects write failure within 10 seconds
- [ ] Forge reports permission denied error clearly
- [ ] Forge stops processing new files
- [ ] Forge does NOT report job as successful
- [ ] Already-completed files (before chmod) are reported accurately
- [ ] Job status shows partial failure

### FAIL Conditions

- Forge reports "Success"
- Forge continues attempting to write indefinitely
- Forge crashes without cleanup
- Progress percentage increases despite failed writes
- Error message is generic ("Unknown error")

### Result

```
[ ] PASS
[ ] FAIL

Notes:
_____________________________________________
_____________________________________________
_____________________________________________
```

---

## HC-03: Kill Resolve Process During Render

### Purpose

Verify that Forge handles unexpected Resolve termination gracefully.

### Preconditions

- [ ] DaVinci Resolve Studio is installed
- [ ] Source files require Resolve (BRAW, R3D, or ProRes RAW)
- [ ] Forge is NOT running
- [ ] Resolve is NOT running

### Procedure

1. Prepare at least 3 RAW format source files
2. Start Forge job with these sources (will trigger Resolve engine)
3. Wait until Resolve is launched and rendering begins
4. Confirm render progress is non-zero
5. In terminal: `pkill -9 -f "DaVinci Resolve"`
6. Observe Forge's response

### Expected Behavior

- [ ] Forge detects Resolve termination within 30 seconds
- [ ] Forge reports engine failure clearly
- [ ] Forge identifies which file was being processed
- [ ] Forge does NOT report job as successful
- [ ] Forge does NOT automatically restart Resolve
- [ ] Job can be retried after manual recovery

### FAIL Conditions

- Forge reports "Success"
- Forge hangs waiting for Resolve indefinitely
- Forge silently restarts Resolve and continues
- Forge crashes without error reporting
- Partial output file is marked as complete

### Result

```
[ ] PASS
[ ] FAIL

Notes:
_____________________________________________
_____________________________________________
_____________________________________________
```

---

## HC-04: Kill FFmpeg Process During Encode

### Purpose

Verify that Forge handles unexpected FFmpeg termination gracefully.

### Preconditions

- [ ] FFmpeg is installed
- [ ] Source files are standard formats (H.264, ProRes)
- [ ] Forge is NOT running
- [ ] No FFmpeg processes running

### Procedure

1. Prepare at least 3 standard video files (H.264/ProRes, 100MB+ each)
2. Start Forge job with these sources (will trigger FFmpeg engine)
3. Wait until FFmpeg is actively encoding (check with `ps aux | grep ffmpeg`)
4. Note which file is being processed
5. In terminal: `pkill -9 ffmpeg`
6. Observe Forge's response

### Expected Behavior

- [ ] Forge detects FFmpeg termination within 10 seconds
- [ ] Forge reports encoding failure clearly
- [ ] Forge identifies which file was being processed
- [ ] Forge does NOT report job as successful
- [ ] Partial output file is removed or marked as incomplete
- [ ] Other files in job are handled according to defined policy

### FAIL Conditions

- Forge reports "Success"
- Forge hangs indefinitely
- Partial file is marked as complete
- Forge silently restarts and continues without acknowledgment
- Error message doesn't identify the failed file

### Result

```
[ ] PASS
[ ] FAIL

Notes:
_____________________________________________
_____________________________________________
_____________________________________________
```

---

## HC-05: Eject SD Card During Ingest

### Purpose

Verify that Forge handles sudden media removal during source reading.

### Preconditions

- [ ] SD card reader available
- [ ] SD card with video files (at least 5 files, 50MB+ each)
- [ ] Forge is NOT running
- [ ] Output directory on local storage

### Procedure

1. Insert SD card and verify files are accessible
2. Start Forge job with all SD card files as sources
3. Wait until at least 1 file is being processed
4. **Physically eject SD card** (do NOT use safe eject)
5. Observe Forge's response

### Expected Behavior

- [ ] Forge detects source unavailability within 30 seconds
- [ ] Forge reports I/O error or source missing
- [ ] Forge stops attempting to read from missing source
- [ ] Forge does NOT report job as successful
- [ ] Already-processed files (if any) are reported correctly
- [ ] Clear distinction between completed and failed files

### FAIL Conditions

- Forge reports "Success"
- Forge hangs with spinning progress
- Forge crashes without error state
- Error message says "0 files failed"
- Forge attempts infinite retry on missing media

### Result

```
[ ] PASS
[ ] FAIL

Notes:
_____________________________________________
_____________________________________________
_____________________________________________
```

---

## HC-06: Network Share Disappears Mid-Job

### Purpose

Verify that Forge handles network storage failures gracefully.

### Preconditions

- [ ] Network share mounted (NFS, SMB, or AFP)
- [ ] Source files on network share (at least 3 files, 100MB+ each)
- [ ] Output directory on local storage
- [ ] Network share control (can disconnect)
- [ ] Forge is NOT running

### Procedure

1. Mount network share and verify source files accessible
2. Start Forge job with network-stored source files
3. Wait until at least 1 file is being processed
4. **Disconnect network share** (unplug cable, disable WiFi, or unmount)
5. Observe Forge's response
6. After test: Reconnect network (do NOT let Forge auto-recover)

### Expected Behavior

- [ ] Forge detects network failure within 60 seconds
- [ ] Forge reports network/I/O error clearly
- [ ] Forge does NOT report job as successful
- [ ] Forge does NOT hang waiting for network indefinitely
- [ ] Job state is recoverable after network restoration
- [ ] No data corruption on reconnection

### FAIL Conditions

- Forge reports "Success"
- Forge hangs for more than 2 minutes
- Forge crashes without saving state
- Forge auto-retries indefinitely without user notification
- Progress bar shows false progress

### Result

```
[ ] PASS
[ ] FAIL

Notes:
_____________________________________________
_____________________________________________
_____________________________________________
```

---

## HC-07: Machine Sleeps During Job

### Purpose

Verify that Forge handles system sleep/wake gracefully.

### Preconditions

- [ ] System sleep NOT disabled
- [ ] Source files on local storage
- [ ] Forge is NOT running
- [ ] Job expected duration: at least 5 minutes

### Procedure

1. Start Forge job with enough files to take 5+ minutes
2. Wait until job is actively processing (25-50% progress)
3. **Put machine to sleep** (close laptop lid or Apple menu → Sleep)
4. Wait 60 seconds
5. **Wake machine** (open lid or press key)
6. Observe Forge's response

### Expected Behavior

- [ ] Forge detects wake and resumes OR reports interruption
- [ ] If resumed: job continues from reasonable checkpoint
- [ ] If failed: clear message about sleep interruption
- [ ] No silent data corruption
- [ ] Progress reporting accurate after wake
- [ ] No duplicate processing of completed files

### FAIL Conditions

- Forge reports "Success" but files are missing/corrupt
- Forge hangs indefinitely after wake
- Progress percentage is inconsistent with actual state
- Forge reprocesses already-completed files without notification
- Job state becomes unrecoverable

### Result

```
[ ] PASS
[ ] FAIL

Notes:
_____________________________________________
_____________________________________________
_____________________________________________
```

---

## HC-08: Resolve Launched Manually Before Job Start

### Purpose

Verify that Forge detects Resolve already running and fails cleanly.

### Preconditions

- [ ] DaVinci Resolve installed
- [ ] RAW source files available (BRAW, R3D, etc.)
- [ ] Forge is NOT running

### Procedure

1. Launch DaVinci Resolve manually
2. Wait until Resolve is fully loaded (project browser visible)
3. Start Forge job with RAW source files
4. Observe Forge's response BEFORE any encoding begins

### Expected Behavior

- [ ] Forge detects Resolve is running BEFORE starting job
- [ ] Forge reports clear error about Resolve conflict
- [ ] Forge does NOT attempt to start second Resolve instance
- [ ] Forge does NOT begin any encoding
- [ ] Error message tells user to close Resolve
- [ ] No partial job state created

### FAIL Conditions

- Forge begins encoding despite Resolve running
- Forge crashes Resolve
- Forge starts second Resolve instance
- Error message is unclear ("Unknown error")
- Forge hangs without error
- Job appears to start but produces no output

### Result

```
[ ] PASS
[ ] FAIL

Notes:
_____________________________________________
_____________________________________________
_____________________________________________
```

---

## Post-Test Checklist

After completing all tests:

- [ ] All test results recorded
- [ ] All temporary files cleaned up
- [ ] All permissions restored
- [ ] Network shares reconnected
- [ ] System returned to normal state

---

## Summary Template

```
Date: _______________
Operator: _______________
Forge Version: _______________
OS Version: _______________

Test Results:
- HC-01: [ ] PASS / [ ] FAIL
- HC-02: [ ] PASS / [ ] FAIL
- HC-03: [ ] PASS / [ ] FAIL
- HC-04: [ ] PASS / [ ] FAIL
- HC-05: [ ] PASS / [ ] FAIL
- HC-06: [ ] PASS / [ ] FAIL
- HC-07: [ ] PASS / [ ] FAIL
- HC-08: [ ] PASS / [ ] FAIL

Total: ___/8 PASS

Forge is credible for real-world use: [ ] YES / [ ] NO

Critical Issues Found:
_____________________________________________
_____________________________________________
_____________________________________________
```
