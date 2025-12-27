#!/usr/bin/env python3
"""
End-to-end test: Verify single job renders successfully through canonical ingestion pipeline.
Uses stdlib urllib only - no external dependencies.
"""

import time
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

BACKEND_URL = "http://127.0.0.1:8085"
TEST_INPUT = "/Users/leon.grant/projects/Proxx/test_media/test_input.mp4"
OUTPUT_DIR = "/Users/leon.grant/projects/Proxx/test_media/OUTPUT"


def http_get(url, timeout=10):
    """Simple HTTP GET using urllib."""
    try:
        req = Request(url)
        with urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode('utf-8')
    except HTTPError as e:
        return e.code, e.read().decode('utf-8') if e.fp else str(e)
    except (URLError, TimeoutError, OSError) as e:
        return None, str(e)


def http_post(url, data, timeout=30):
    """Simple HTTP POST using urllib."""
    try:
        req = Request(url, data=json.dumps(data).encode('utf-8'))
        req.add_header('Content-Type', 'application/json')
        with urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode('utf-8')
    except HTTPError as e:
        return e.code, e.read().decode('utf-8') if e.fp else str(e)
    except (URLError, TimeoutError, OSError) as e:
        return None, str(e)


def wait_for_backend(timeout=10):
    """Wait for backend to be ready."""
    print("Waiting for backend...")
    start = time.time()
    while time.time() - start < timeout:
        status, _ = http_get(f"{BACKEND_URL}/health", timeout=1)
        if status == 200:
            print("✓ Backend is ready")
            return True
        time.sleep(0.5)
    print("✗ Backend not ready after timeout")
    return False


def create_job():
    """Create a job via the canonical ingestion pipeline."""
    print(f"\nCreating job for: {TEST_INPUT}")
    
    payload = {
        "source_paths": [TEST_INPUT],
        "engine": "ffmpeg",
        "deliver_settings": {
            "output_dir": OUTPUT_DIR,
            "video": {"codec": "prores_proxy"},
            "audio": {"codec": "aac"},
            "file": {"container": "mov", "naming_template": "{source_name}_proxy"}
        }
    }
    
    status, body = http_post(f"{BACKEND_URL}/control/jobs/create", payload, timeout=30)
    
    if status != 200:
        print(f"✗ Job creation failed: {status}")
        print(f"  Response: {body}")
        return None
    
    data = json.loads(body)
    job_id = data.get("job_id")
    print(f"✓ Job created: {job_id}")
    return job_id


def get_job_status(job_id):
    """Get current job status."""
    status, body = http_get(f"{BACKEND_URL}/monitor/jobs/{job_id}", timeout=5)
    if status != 200:
        return None
    return json.loads(body)


def start_job(job_id):
    """Start job execution."""
    print(f"\nStarting job: {job_id}")
    status, body = http_post(f"{BACKEND_URL}/control/jobs/{job_id}/start", {}, timeout=30)
    
    if status != 200:
        print(f"✗ Job start failed: {status}")
        print(f"  Response: {body}")
        return False
    
    print("✓ Job started")
    return True


def wait_for_completion(job_id, timeout=120):
    """Wait for job to complete."""
    print(f"\nWaiting for job completion (timeout: {timeout}s)...")
    start = time.time()
    last_status = None
    
    while time.time() - start < timeout:
        job = get_job_status(job_id)
        if not job:
            print("✗ Could not get job status")
            return None
        
        status = job.get("status", "").upper()
        if status != last_status:
            print(f"  Status: {status}")
            last_status = status
        
        if status == "COMPLETED":
            print("✓ Job completed successfully")
            return job
        elif status == "FAILED":
            print("✗ Job failed")
            return job
        
        time.sleep(1)
    
    print("✗ Job timed out")
    return None


def verify_output():
    """Check that output file exists."""
    output_path = Path(OUTPUT_DIR) / "test_input_proxy.mov"
    
    print(f"\nVerifying output: {output_path}")
    if output_path.exists():
        size = output_path.stat().st_size
        print(f"✓ Output exists: {size} bytes")
        return True
    else:
        # Check for alternative names
        outputs = list(Path(OUTPUT_DIR).glob("test_input*.mov"))
        if outputs:
            print(f"✓ Found output: {outputs[0]} ({outputs[0].stat().st_size} bytes)")
            return True
        print("✗ Output file not found")
        return False


def main():
    print("=" * 60)
    print("END-TO-END TEST: Single Job Render via Ingestion Pipeline")
    print("=" * 60)
    
    # Clean up any previous output
    for f in Path(OUTPUT_DIR).glob("test_input*.mov"):
        print(f"Cleaning up: {f}")
        f.unlink()
    
    # Step 1: Verify backend
    if not wait_for_backend():
        sys.exit(1)
    
    # Step 2: Create job via ingestion pipeline
    job_id = create_job()
    if not job_id:
        sys.exit(1)
    
    # Step 3: Verify initial status is PENDING
    job = get_job_status(job_id)
    if job:
        status = job.get("status", "").upper()
        print(f"  Initial status: {status}")
        if status != "PENDING":
            print(f"✗ Expected PENDING, got {status}")
    
    # Step 4: Start job execution
    if not start_job(job_id):
        sys.exit(1)
    
    # Step 5: Wait for completion
    final_job = wait_for_completion(job_id)
    if not final_job:
        sys.exit(1)
    
    status = final_job.get("status", "").upper()
    if status != "COMPLETED":
        print(f"\n✗ FAILED: Job ended with status {status}")
        if final_job.get("tasks"):
            for task in final_job["tasks"]:
                if task.get("failure_reason"):
                    print(f"  Task failure: {task['failure_reason']}")
        sys.exit(1)
    
    # Step 6: Verify output file exists
    if not verify_output():
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("✓ END-TO-END TEST PASSED")
    print("=" * 60)
    sys.exit(0)


if __name__ == "__main__":
    main()
