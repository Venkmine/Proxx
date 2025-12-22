"""
Tests for the canonical IngestionService.
"""

import pytest
import tempfile
import os
from pathlib import Path

from app.services.ingestion import IngestionService, IngestionError, IngestionResult
from app.jobs.registry import JobRegistry
from app.jobs.engine import JobEngine
from app.deliver.settings import DeliverSettings


class TestIngestionService:
    """Tests for IngestionService.ingest_sources()."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.job_registry = JobRegistry()
        self.job_engine = JobEngine()
        self.ingestion_service = IngestionService(
            job_registry=self.job_registry,
            job_engine=self.job_engine,
        )
        
        # Create a temp file for testing
        self.temp_dir = tempfile.mkdtemp()
        self.test_file = Path(self.temp_dir) / "test_video.mp4"
        self.test_file.write_text("fake video content")
    
    def teardown_method(self):
        """Clean up temp files."""
        if self.test_file.exists():
            self.test_file.unlink()
        if os.path.exists(self.temp_dir):
            os.rmdir(self.temp_dir)
    
    def test_ingest_sources_success(self):
        """Test successful ingestion creates a job."""
        result = self.ingestion_service.ingest_sources(
            source_paths=[str(self.test_file)],
            output_dir=self.temp_dir,
            deliver_settings=DeliverSettings(),
            engine="ffmpeg",
        )
        
        assert result.success
        assert result.job_id is not None
        assert result.task_count == 1
        
        # Verify job was registered
        job = self.job_registry.get_job(result.job_id)
        assert job is not None
        assert len(job.tasks) == 1
        assert job.tasks[0].source_path == str(self.test_file.resolve())
    
    def test_ingest_sources_empty_paths_fails(self):
        """Test ingestion with empty paths fails."""
        with pytest.raises(IngestionError) as exc_info:
            self.ingestion_service.ingest_sources(
                source_paths=[],
                output_dir=self.temp_dir,
                deliver_settings=DeliverSettings(),
            )
        assert "At least one source file required" in str(exc_info.value)
    
    def test_ingest_sources_nonexistent_file_fails(self):
        """Test ingestion with non-existent file fails."""
        with pytest.raises(IngestionError) as exc_info:
            self.ingestion_service.ingest_sources(
                source_paths=["/nonexistent/file.mp4"],
                output_dir=self.temp_dir,
                deliver_settings=DeliverSettings(),
            )
        assert "does not exist" in str(exc_info.value)
    
    def test_ingest_sources_invalid_output_dir_fails(self):
        """Test ingestion with invalid output directory fails."""
        with pytest.raises(IngestionError) as exc_info:
            self.ingestion_service.ingest_sources(
                source_paths=[str(self.test_file)],
                output_dir="/nonexistent/output/dir",
                deliver_settings=DeliverSettings(),
            )
        assert "Output directory does not exist" in str(exc_info.value)
    
    def test_ingest_sources_settings_snapshot(self):
        """Test that settings are properly snapshotted."""
        settings = DeliverSettings(output_dir="/original/path")
        
        result = self.ingestion_service.ingest_sources(
            source_paths=[str(self.test_file)],
            output_dir=self.temp_dir,  # Override output_dir
            deliver_settings=settings,
        )
        
        job = self.job_registry.get_job(result.job_id)
        # output_dir should be updated to the explicit parameter
        assert job.settings_dict.get("output_dir") == self.temp_dir


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
