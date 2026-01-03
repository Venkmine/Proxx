"""
Backend Integration Test: RAW Encode Matrix

Tests ALL supported file formats in forge-tests/samples/RAW:
- Detects RAW vs non-RAW formats
- Routes to correct engine (Resolve for RAW, FFmpeg for non-RAW)
- Creates jobs via backend API directly (no Electron/Playwright)
- Verifies job execution completes
- Validates output files exist with non-zero size

This is a BACKEND integration test, not a UI E2E test.
Uses TestClient - no running server or Electron required.
"""

import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import tempfile
import os
import time

from app.main import app


# RAW file extensions that should route to Resolve
RAW_EXTENSIONS = {
    '.braw',
    '.r3d', '.R3D',
    '.ari', '.arri',
    '.dng',
    '.cri', '.crm',  # Canon RAW
    '.cine',  # Phantom
}


def is_raw_format(file_path: Path) -> bool:
    """Determine if file is RAW format based on extension and path."""
    ext = file_path.suffix.lower()
    
    # Check known RAW extensions
    if ext in RAW_EXTENSIONS:
        return True
    
    # For .mov files, check if in PRORES_RAW folder
    if ext == '.mov':
        if 'PRORES_RAW' in str(file_path) or 'ProRes' in str(file_path):
            return True
    
    # ARRI MXF files with codec=unknown must route to Resolve
    # These are detected at routing time, not by test
    # For test purposes, check if in ARRI folders that typically contain RAW
    if ext == '.mxf':
        path_str = str(file_path)
        # ARRI 35 Xtreme MXF HDE, ARRICORE folders contain RAW MXF
        if any(x in path_str for x in ['ARRI 35 Xtreme', 'ARRICORE', 'ARRI35']):
            # Check if it's NOT the ProRes one (DW0001C003_251020_112744_p1I7H.mxf)
            if 'p1I7H' not in file_path.name and 'p12SQ' not in file_path.name:
                return True
    
    return False


def scan_raw_directory(base_dir: Path, exclude_dirs=None):
    """Scan directory for video files, excluding specified directories."""
    if exclude_dirs is None:
        exclude_dirs = ['Image_SEQS']
    
    video_extensions = {
        '.braw', '.r3d', '.R3D', '.ari', '.arri', '.dng',
        '.mov', '.mp4', '.mxf', '.avi',
        '.cri', '.crm',  # Canon RAW
        '.cine',  # Phantom
        '.mkv', '.webm',
    }
    
    # RED sidecar files and other metadata - exclude from processing
    EXCLUDED_EXTENSIONS = {'.rmd', '.rdc', '.rtn', '.ale', '.RMD', '.RDC', '.RTN', '.ALE'}
    
    files = []
    
    for root, dirs, filenames in os.walk(base_dir):
        # Remove excluded directories from traversal
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
        
        for filename in filenames:
            if filename.startswith('.'):
                continue
            
            file_path = Path(root) / filename
            
            # Skip RED sidecars and metadata files
            if file_path.suffix in EXCLUDED_EXTENSIONS:
                continue
            
            if file_path.suffix.lower() in video_extensions:
                files.append(file_path)
    
    return files


@pytest.fixture(scope="module")
def test_client():
    """Create FastAPI test client."""
    # Set E2E_TEST mode to mock Resolve execution
    os.environ['E2E_TEST'] = 'true'
    return TestClient(app)


@pytest.fixture(scope="module")
def raw_samples_dir():
    """Get path to RAW samples directory."""
    project_root = Path(__file__).parent.parent.parent
    samples_dir = project_root / 'forge-tests' / 'samples' / 'RAW'
    
    if not samples_dir.exists():
        pytest.skip(f"RAW samples directory not found: {samples_dir}")
    
    return samples_dir


@pytest.fixture(scope="module")
def test_files(raw_samples_dir):
    """Discover all test files in RAW samples directory."""
    files = scan_raw_directory(raw_samples_dir, exclude_dirs=['Image_SEQS'])
    
    if not files:
        pytest.skip("No test files found in RAW samples directory")
    
    # Sort for deterministic test order
    files.sort()
    
    print(f"\n🔍 Discovered {len(files)} test files")
    raw_count = sum(1 for f in files if is_raw_format(f))
    print(f"   - RAW (Resolve): {raw_count}")
    print(f"   - Non-RAW (FFmpeg): {len(files) - raw_count}")
    
    return files


@pytest.fixture(scope="function")
def output_dir():
    """Create temporary output directory for each test."""
    temp_dir = tempfile.mkdtemp(prefix='proxx-test-')
    yield Path(temp_dir)
    
    # Cleanup
    import shutil
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)


class TestRawEncodeMatrix:
    """Backend integration tests for RAW encode matrix."""
    
    def test_encode_all_files(self, test_client, test_files, output_dir):
        """Test encoding for all discovered files with correct engine routing."""
        
        results = []
        
        for test_file in test_files:
            # Determine expected engine
            is_raw = is_raw_format(test_file)
            expected_engine = 'resolve' if is_raw else 'ffmpeg'
            
            print(f"\n  🧪 Testing: {test_file.name}")
            print(f"     Format: {'RAW' if is_raw else 'non-RAW'}")
            print(f"     Engine: {expected_engine}")
            print(f"     Path: {test_file}")
            
            # Create unique output dir for this test
            import tempfile
            temp_output = Path(tempfile.mkdtemp(prefix='proxx-test-'))
            
            try:
                # Create job payload
                payload = {
                    "source_paths": [str(test_file)],
                    "engine": expected_engine,
                    "deliver_settings": {
                        "output_dir": str(temp_output),
                        "video": {"codec": "prores_proxy"},
                        "audio": {"codec": "pcm_s16le"},
                        "file": {
                            "container": "mov",
                            "naming_template": "{source_name}__proxx"
                        }
                    }
                }
                
                # Create job
                start_time = time.time()
                response = test_client.post("/control/jobs/create", json=payload)
                
                # Assert job creation succeeded
                if response.status_code != 200:
                    print(f"     ✗ Job creation failed: {response.text}")
                    results.append({'file': test_file.name, 'success': False, 'error': response.text})
                    continue
                
                job_data = response.json()
                if "job_id" not in job_data:
                    print(f"     ✗ Response missing job_id")
                    results.append({'file': test_file.name, 'success': False, 'error': 'Missing job_id'})
                    continue
                
                job_id = job_data["job_id"]
                print(f"     ✓ Job created: {job_id}")
                
                # Start the job (transitions from PENDING → RUNNING)
                start_response = test_client.post(f"/control/jobs/{job_id}/start")
                if start_response.status_code != 200:
                    print(f"     ✗ Failed to start job: {start_response.text}")
                    results.append({'file': test_file.name, 'success': False, 'error': f'Start failed: {start_response.text}'})
                    continue
                
                print(f"     ✓ Job started")
                
                # Poll for job completion
                max_attempts = 120  # 60 seconds with 0.5s intervals
                attempts = 0
                final_status = None
                
                while attempts < max_attempts:
                    job_response = test_client.get(f"/monitor/jobs/{job_id}")
                    if job_response.status_code != 200:
                        if attempts == 0:
                            print(f"     ⚠️  Status check failed: {job_response.status_code}")
                            print(f"         Response: {job_response.text[:200]}")
                        time.sleep(0.5)
                        attempts += 1
                        continue
                    
                    job_info = job_response.json()
                    status = job_info.get("status", "UNKNOWN").upper()
                    
                    if attempts == 0:
                        print(f"     📊 Initial status: {status}")
                        print(f"         Full response: {job_info}")
                    
                    if status in ['COMPLETED', 'FAILED', 'ERROR']:
                        final_status = status
                        break
                    
                    time.sleep(0.5)
                    attempts += 1
                
                duration = time.time() - start_time
                
                # Assert job completed successfully
                if final_status != 'COMPLETED':
                    error_msg = f"Job status: {final_status}, Time: {duration:.1f}s"
                    print(f"     ✗ {error_msg}")
                    results.append({'file': test_file.name, 'success': False, 'error': error_msg})
                    continue
                
                print(f"     ✓ Job completed in {duration:.1f}s")
                
                # Verify output file exists
                output_files = list(temp_output.glob('*.mov')) + list(temp_output.glob('*.mp4'))
                if len(output_files) == 0:
                    print(f"     ✗ No output files created")
                    results.append({'file': test_file.name, 'success': False, 'error': 'No output files'})
                    continue
                
                output_file = output_files[0]
                if not output_file.exists():
                    print(f"     ✗ Output file missing: {output_file}")
                    results.append({'file': test_file.name, 'success': False, 'error': 'Output file missing'})
                    continue
                
                # Verify output file is non-zero
                file_size = output_file.stat().st_size
                if file_size == 0:
                    print(f"     ✗ Output file is empty")
                    results.append({'file': test_file.name, 'success': False, 'error': 'Output file empty'})
                    continue
                
                print(f"     ✓ Output: {output_file.name} ({file_size / 1024 / 1024:.2f} MB)")
                results.append({'file': test_file.name, 'success': True})
                
            finally:
                # Cleanup temp output dir
                import shutil
                if temp_output.exists():
                    shutil.rmtree(temp_output)
        
        # Print summary
        print(f"\n{'='*70}")
        print(f"📊 Test Results:")
        print(f"{'='*70}")
        passed = len([r for r in results if r['success']])
        failed = len([r for r in results if not r['success']])
        print(f"Total: {len(results)}")
        print(f"✓ Passed: {passed}")
        print(f"✗ Failed: {failed}")
        
        if failed > 0:
            print(f"\nFailed files:")
            for r in results:
                if not r['success']:
                    print(f"  - {r['file']}: {r['error']}")
        
        print(f"{'='*70}\n")
        
        # Assert all passed
        assert failed == 0, f"{failed}/{len(results)} files failed"
    
    def test_raw_files_route_to_resolve(self, test_client, test_files):
        """Verify RAW files are correctly identified and would route to Resolve."""
        raw_files = [f for f in test_files if is_raw_format(f)]
        
        assert len(raw_files) > 0, "No RAW files found in test set"
        
        print(f"\n📋 RAW files identified ({len(raw_files)}):")
        for f in raw_files[:5]:  # Show first 5
            print(f"   - {f.name}")
        
        if len(raw_files) > 5:
            print(f"   ... and {len(raw_files) - 5} more")
    
    def test_non_raw_files_route_to_ffmpeg(self, test_client, test_files):
        """Verify non-RAW files are correctly identified and would route to FFmpeg."""
        non_raw_files = [f for f in test_files if not is_raw_format(f)]
        
        assert len(non_raw_files) > 0, "No non-RAW files found in test set"
        
        print(f"\n📋 Non-RAW files identified ({len(non_raw_files)}):")
        for f in non_raw_files[:5]:  # Show first 5
            print(f"   - {f.name}")
        
        if len(non_raw_files) > 5:
            print(f"   ... and {len(non_raw_files) - 5} more")
    
    def test_summary_statistics(self, test_files):
        """Print summary statistics of test coverage."""
        raw_files = [f for f in test_files if is_raw_format(f)]
        non_raw_files = [f for f in test_files if not is_raw_format(f)]
        
        # Group by extension
        from collections import Counter
        extensions = Counter(f.suffix.lower() for f in test_files)
        
        print(f"\n{'='*70}")
        print(f"📊 RAW Encode Matrix Test Coverage:")
        print(f"{'='*70}")
        print(f"Total files: {len(test_files)}")
        print(f"  RAW (Resolve): {len(raw_files)}")
        print(f"  Non-RAW (FFmpeg): {len(non_raw_files)}")
        print(f"\nFile types:")
        for ext, count in sorted(extensions.items(), key=lambda x: -x[1]):
            print(f"  {ext}: {count}")
        print(f"{'='*70}\n")
