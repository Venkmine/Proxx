#!/usr/bin/env python3
"""
Test script to verify RAW format routing and failure semantics.
This tests that Sony Venice MXF (RAW) properly fails when attempting execution.
"""

import sys
import logging
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

# Configure logging to show everything
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%H:%M:%S'
)

from job_spec import JobSpec
from execution_adapter import execute_jobspec

# Test configuration - Sony Venice RAW
SONY_VENICE_MXF = "/Users/leon.grant/projects/Proxx/forge-tests/samples/RAW/SONY/Venice/Sony VENICE 2 Test Footage.mxf"
TEST_OUTPUT_DIR = "/Users/leon.grant/projects/Proxx/test_media/OUTPUT"

def main():
    print("\n" + "="*80)
    print("PROXX RAW ROUTING TEST - Sony Venice")
    print("="*80)
    
    # Create output directory if it doesn't exist
    Path(TEST_OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    
    # Create a JobSpec with Sony Venice RAW (should route to Resolve, fail if Resolve not available)
    print(f"\n📋 Creating JobSpec for Sony Venice RAW...")
    print(f"   Source: {Path(SONY_VENICE_MXF).name}")
    print(f"   Output: {TEST_OUTPUT_DIR}")
    
    jobspec = JobSpec(
        sources=[SONY_VENICE_MXF],
        output_directory=TEST_OUTPUT_DIR,
        codec="prores_proxy",
        container="mov",
        resolution="half",
        naming_template="{source_name}_raw_test",
        proxy_profile="proxy_prores_proxy_resolve",  # Resolve profile
        resolve_preset="YouTube 1080p",  # Resolve preset
        fps_mode="same-as-source",
    )
    
    print(f"   Job ID: {jobspec.job_id}")
    print(f"   Proxy Profile: {jobspec.proxy_profile}")
    print(f"   Expected: Should route to Resolve engine")
    
    # Execute the job
    print(f"\n▶️  Executing job...\n")
    result = execute_jobspec(jobspec)
    
    # Print results
    print("\n" + "="*80)
    print("EXECUTION RESULTS")
    print("="*80)
    print(f"Job ID: {result.job_id}")
    print(f"Status: {result.final_status}")
    print(f"Engine: {result.engine_used}")
    print(f"Clips: {len(result.clips)}")
    
    if result.validation_error:
        print(f"\n⚠️  Validation/Routing Message: {result.validation_error}")
    
    for i, clip in enumerate(result.clips):
        print(f"\n--- Clip {i+1} ---")
        print(f"Source: {Path(clip.source_path).name}")
        print(f"Status: {clip.status}")
        if clip.failure_reason:
            print(f"Failure: {clip.failure_reason}")
    
    print("\n" + "="*80)
    
    # Expected outcomes:
    # 1. If Resolve is available: Job routes to Resolve, may succeed or skip
    # 2. If Resolve not available: Job fails with explicit message about Resolve requirement
    # 3. Should NOT route to FFmpeg (FFmpeg cannot decode Sony RAW)
    
    if result.engine_used == "resolve":
        print("✅ CORRECT: Job correctly routed to Resolve engine")
        if result.final_status == "SKIPPED":
            print("⚠️  Job was SKIPPED (Resolve running or edition mismatch)")
        elif result.final_status == "FAILED":
            print("⚠️  Job FAILED (Resolve error or preset issue)")
        return 0
    elif result.engine_used == "ffmpeg":
        print("❌ WRONG: Job incorrectly routed to FFmpeg (cannot process RAW)")
        return 1
    elif result.engine_used is None:
        print("✅ CORRECT: Job failed at routing stage (Resolve required)")
        if "resolve" in result.validation_error.lower():
            print("✅ Error message mentions Resolve requirement")
        return 0
    else:
        print("❓ UNEXPECTED: Unknown engine routing")
        return 1

if __name__ == "__main__":
    sys.exit(main())
