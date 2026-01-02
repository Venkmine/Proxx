#!/usr/bin/env python3
"""
Test script to verify job execution works end-to-end.
This creates a JobSpec and executes it directly.
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

# Test configuration
TEST_SOURCE = "/Users/leon.grant/projects/Proxx/test_media/test_input.mp4"
TEST_OUTPUT_DIR = "/Users/leon.grant/projects/Proxx/test_media/OUTPUT"

def main():
    print("\n" + "="*80)
    print("PROXX EXECUTION TEST")
    print("="*80)
    
    # Create output directory if it doesn't exist
    Path(TEST_OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    
    # Create a simple JobSpec for testing
    print(f"\n📋 Creating JobSpec...")
    print(f"   Source: {TEST_SOURCE}")
    print(f"   Output: {TEST_OUTPUT_DIR}")
    
    jobspec = JobSpec(
        sources=[TEST_SOURCE],
        output_directory=TEST_OUTPUT_DIR,
        codec="h264",
        container="mp4",
        resolution="half",
        naming_template="{source_name}_test",
        proxy_profile="proxy_h264_low",  # Use a valid proxy profile
        fps_mode="same-as-source",
    )
    
    print(f"   Job ID: {jobspec.job_id}")
    print(f"   Proxy Profile: {jobspec.proxy_profile}")
    
    # Execute the job
    print(f"\n▶️  Executing job...\n")
    result = execute_jobspec(jobspec)
    
    # Print results
    print("\n" + "="*80)
    print("EXECUTION RESULTS")
    print("="*80)
    print(f"Job ID: {result.job_id}")
    print(f"Status: {result.final_status}")
    print(f"Clips: {len(result.clips)}")
    
    if result.validation_error:
        print(f"\n❌ Validation Error: {result.validation_error}")
        return 1
    
    for i, clip in enumerate(result.clips):
        print(f"\n--- Clip {i+1} ---")
        print(f"Source: {Path(clip.source_path).name}")
        print(f"Output: {clip.resolved_output_path}")
        print(f"Status: {clip.status}")
        print(f"Exit Code: {clip.exit_code}")
        print(f"Output Exists: {clip.output_exists}")
        if clip.output_size_bytes:
            print(f"Output Size: {clip.output_size_bytes / 1024 / 1024:.2f} MB")
        if clip.failure_reason:
            print(f"Failure: {clip.failure_reason}")
        print(f"Duration: {clip.duration_seconds:.1f}s" if clip.duration_seconds else "Duration: N/A")
    
    print("\n" + "="*80)
    
    if result.final_status == "COMPLETED":
        print("✅ SUCCESS: Job completed successfully!")
        return 0
    else:
        print("❌ FAILED: Job execution failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
