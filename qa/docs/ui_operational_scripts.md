# UI Operational Scripts

This document provides scripted manual testing flows for the Awaire Proxy UI.

## Prerequisites

- Awaire Proxy running (`./dev_launch.sh`)
- Backend healthy (http://127.0.0.1:8085/health returns ok)
- Test media files available

## Script 1: App Launch Verification

**Purpose:** Verify app launches correctly.

1. Run `./dev_launch.sh`
2. ✓ Electron window appears
3. ✓ Title bar shows "Awaire Proxy"
4. ✓ No white screen / error page
5. ✓ Queue panel visible
6. ✓ "Render All" button visible (if jobs pending)

## Script 2: Create Proxy Job

**Purpose:** Verify job creation workflow.

1. Click "Add Files" or drag files to window
2. ✓ Files appear in source list
3. Select preset from dropdown
4. ✓ Deliver panel populates with settings
5. Click "Create Job"
6. ✓ Job appears in queue
7. ✓ Job status shows "PENDING"
8. ✓ Clip count matches files added

## Script 3: Run Proxy Job

**Purpose:** Verify job execution.

1. Create a job (Script 2)
2. Click "Render All" or job's start button
3. ✓ Job status changes to "RUNNING"
4. ✓ Progress indicator updates
5. ✓ ETA displayed (if available)
6. Wait for completion
7. ✓ Job status changes to "COMPLETED"
8. ✓ Output path shown for each clip

## Script 4: Reveal Output

**Purpose:** Verify output reveal.

1. Complete a job (Script 3)
2. Click reveal button on completed clip
3. ✓ Finder opens to output location
4. ✓ Proxy file exists
5. ✓ Proxy file plays correctly

## Script 5: Cancel Job

**Purpose:** Verify job cancellation.

1. Start a job with multiple clips
2. While running, click cancel button
3. ✓ Current clip finishes
4. ✓ Remaining clips marked SKIPPED
5. ✓ Job status shows CANCELLED
6. ✓ Completed clips remain COMPLETED

## Script 6: Watch Folder

**Purpose:** Verify watch folder ingestion.

1. Configure watch folder (Settings)
2. Drop file into watch folder
3. ✓ File detected after scan interval
4. ✓ Job created automatically
5. ✓ File not re-detected on next scan

## Script 7: Keyboard Shortcuts

**Purpose:** Verify keyboard controls.

1. Select a job: ✓ Cmd+A selects all clips
2. With selection: ✓ Delete removes selected
3. After delete: ✓ Cmd+Z undoes delete
4. ✓ Cmd+Shift+Z redoes
5. ✓ Escape clears selection

## Reporting Issues

When an operational script fails:

1. Note the step number
2. Capture screenshot
3. Check console for errors (Cmd+Option+I)
4. File bug with reproduction steps
5. Add regression test after fix
