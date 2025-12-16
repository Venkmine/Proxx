"""
Watch folder engine — orchestration for unattended ingestion.

Coordinates filesystem scanning, stability checking, and job creation.
This is the main entry point for watch folder processing.
"""

import logging
from pathlib import Path
from typing import List, Set, Optional

from jobs.engine import JobEngine
from jobs.models import Job
from watchfolders.models import WatchFolder
from watchfolders.registry import WatchFolderRegistry
from watchfolders.scanner import FileScanner
from watchfolders.stability import FileStabilityChecker
from watchfolders.errors import WatchFolderError

logger = logging.getLogger(__name__)


class WatchFolderEngine:
    """
    Watch folder orchestration engine.

    Coordinates:
    1. Filesystem scanning (via FileScanner)
    2. File stability detection (via FileStabilityChecker)
    3. Duplicate prevention (in-memory tracking)
    4. Job creation (via JobEngine)

    Phase 10 behavior:
    - Creates jobs in PENDING state only
    - NO auto-execution
    - NO preset application
    - One job per file

    Jobs are created without presets. Preset application is deferred to Phase 11+.
    """

    def __init__(
        self,
        watch_folder_registry: WatchFolderRegistry,
        job_engine: JobEngine,
    ):
        """
        Initialize watch folder engine.

        Args:
            watch_folder_registry: Registry of watch folder configurations
            job_engine: Job engine for creating jobs
        """
        self.watch_folder_registry = watch_folder_registry
        self.job_engine = job_engine

        # Initialize scanner and stability checker
        self.scanner = FileScanner(skip_hidden=True, follow_symlinks=False)
        self.stability_checker = FileStabilityChecker(
            check_interval=5.0,
            required_stable_checks=3,
            min_age_seconds=10.0,
        )

        # In-memory tracking of processed files (prevents duplicates)
        # Maps: absolute_path -> job_id
        self._processed_files: Set[str] = set()

    def scan_all_folders(self) -> List[Job]:
        """
        Scan all enabled watch folders and create jobs for stable files.

        This is the main entry point for watch folder processing.
        Call this method periodically (e.g., every 15-30 seconds) to
        detect and ingest new files.

        Returns:
            List of newly created jobs (may be empty)

        Warn-and-continue semantics: Individual folder failures do not
        block processing of other folders.
        """
        created_jobs = []

        for watch_folder in self.watch_folder_registry.list_enabled_folders():
            try:
                jobs = self.scan_folder(watch_folder)
                created_jobs.extend(jobs)
            except WatchFolderError as e:
                logger.warning(
                    f"Watch folder scan failed for '{watch_folder.id}': {e}"
                )
                # Continue to next folder (warn-and-continue)
                continue
            except Exception as e:
                logger.error(
                    f"Unexpected error scanning watch folder '{watch_folder.id}': {e}"
                )
                # Continue to next folder (warn-and-continue)
                continue

        return created_jobs

    def scan_folder(self, watch_folder: WatchFolder) -> List[Job]:
        """
        Scan a single watch folder and create jobs for stable files.

        Process:
        1. Scan filesystem for candidate files
        2. Check stability for each file
        3. Skip already-processed files
        4. Create one job per stable file

        Returns:
            List of newly created jobs (may be empty)

        Raises:
            WatchFolderError: If watch folder path is inaccessible
        """
        # Verify watch folder still exists
        folder_path = Path(watch_folder.path)
        if not folder_path.exists():
            raise WatchFolderError(
                f"Watch folder path does not exist: {watch_folder.path}"
            )

        if not folder_path.is_dir():
            raise WatchFolderError(
                f"Watch folder path is not a directory: {watch_folder.path}"
            )

        # Scan for candidate files
        candidate_files = self.scanner.scan(watch_folder)
        logger.debug(
            f"Watch folder '{watch_folder.id}': Found {len(candidate_files)} candidate file(s)"
        )

        # Check stability and create jobs
        created_jobs = []

        for file_path in candidate_files:
            file_path_str = str(file_path)

            # Skip if already processed
            if file_path_str in self._processed_files:
                logger.debug(f"Skipping already-processed file: {file_path_str}")
                continue

            # Check stability
            stability = self.stability_checker.check_stability(file_path)

            if stability.is_stable:
                # File is stable - create job
                try:
                    job = self._create_job_for_file(file_path, watch_folder)
                    created_jobs.append(job)

                    # Mark as processed
                    self._processed_files.add(file_path_str)

                    # Reset stability tracking (file successfully ingested)
                    self.stability_checker.reset_tracking(file_path)

                    logger.info(
                        f"Created job {job.id} for file: {file_path.name} (watch folder: {watch_folder.id})"
                    )

                except Exception as e:
                    logger.error(
                        f"Failed to create job for file {file_path_str}: {e}"
                    )
                    # Continue to next file (warn-and-continue)
                    continue
            else:
                # File not yet stable
                logger.debug(
                    f"File not stable: {file_path.name} - {stability.reason}"
                )

        return created_jobs

    def _create_job_for_file(
        self, file_path: Path, watch_folder: WatchFolder
    ) -> Job:
        """
        Create a PENDING job for a single file.

        Phase 10 behavior:
        - One job per file
        - NO preset application (presets deferred to Phase 11)
        - Job left in PENDING state (no auto-execution)

        Args:
            file_path: Absolute path to stable file
            watch_folder: Watch folder configuration

        Returns:
            New job in PENDING state
        """
        # Create job with single source file
        job = self.job_engine.create_job(source_paths=[str(file_path)])

        # Job is already in PENDING state (default from create_job)
        # No preset is applied
        # No execution is triggered

        return job

    def mark_file_as_processed(self, file_path: str) -> None:
        """
        Manually mark a file as processed.

        Used for manual intervention or recovery scenarios.

        Args:
            file_path: Absolute path to mark as processed
        """
        self._processed_files.add(file_path)

    def clear_processed_files(self) -> None:
        """
        Clear all processed file tracking.

        Used primarily for testing or when resetting watch folder state.
        WARNING: This will allow files to be re-ingested.
        """
        self._processed_files.clear()
        self.stability_checker.clear_all_tracking()

    def get_processed_files(self) -> Set[str]:
        """
        Get set of all processed file paths.

        Returns:
            Set of absolute paths that have been ingested
        """
        return self._processed_files.copy()
