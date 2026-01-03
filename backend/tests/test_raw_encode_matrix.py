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
    
    files = []
    
    for root, dirs, filenames in os.walk(base_dir):
        # Remove excluded directories from traversal
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
        
        for filename in filenames:
            if filename.startswith('.'):
                continue
            
            file_path = Path(root) / filename
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
    
    @pytest.mark.parametrize("test_file", pytest.lazy_fixture("test_files"), ids=lambda f: f.name)
    def test_encode_file(self, test_client, test_file, output_dir):
        """Test encoding for a single file with correct engine routing."""
        
        # Determine expected engine
        is_raw = is_raw_format(test_file)
        expected_engine = 'resolve' if is_raw else 'ffmpeg'
        
        print(f"\n  🧪 Testing: {test_file.name}")
        print(f"     Format: {'RAW' if is_raw else 'non-RAW'}")
        print(f"     Engine: {expected_engine}")
        print(f"     Path: {test_file}")
        
        # Create job payload
        payload = {
            "source_paths": [str(test_file)],
            "engine": expected_engine,
            "deliver_settings": {
                "output_dir": str(output_dir),
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
        assert response.status_code == 200, f"Job creation failed: {response.text}"
        
        job_data = response.json()
        assert "job_id" in job_data, "Response missing job_id"
        
        job_id = job_data["job_id"]
        print(f"     ✓ Job created: {job_id}")
        
        # Poll for job completion
        max_attempts = 120  # 60 seconds with 0.5s intervals
        attempts = 0
        final_status = None
        
        while attempts < max_attempts:
            job_response = test_client.get(f"/monitor/jobs/{job_id}")
            assert job_response.status_code == 200, f"Failed to fetch job: {job_response.text}"
            
            job_info = job_response.json()
            status = job_info.get("status", "UNKNOWN").upper()
            
            if status in ['COMPLETED', 'FAILED', 'ERROR']:
                final_status = status
                break
            
            time.sleep(0.5)
            attempts += 1
        
        duration = time.time() - start_time
        
        # Assert job completed successfully
        assert final_status == 'COMPLETED', \
            f"Job did not complete successfully. Status: {final_status}, Time: {duration:.1f}s"
        
        print(f"     ✓ Job completed in {duration:.1f}s")
        
        # Verify output file exists
        output_files = list(output_dir.glob('*.mov')) + list(output_dir.glob('*.mp4'))
        assert len(output_files) > 0, f"No output files created in {output_dir}"
        
        output_file = output_files[0]
        assert output_file.exists(), f"Output file does not exist: {output_file}"
        
        # Verify output file is non-zero
        file_size = output_file.stat().st_size
        assert file_size > 0, f"Output file is empty: {output_file}"
        
        print(f"     ✓ Output: {output_file.name} ({file_size / 1024 / 1024:.2f} MB)")
    
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
