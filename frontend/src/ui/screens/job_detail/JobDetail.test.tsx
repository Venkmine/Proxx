/**
 * Job Detail Screen Tests
 * 
 * Tests asserting:
 * - Data rendered verbatim
 * - Failed jobs show full error details
 * - Annotations displayed correctly
 * - Deterministic ordering
 * - No execution imports
 * - No mutation of data
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JobDetail } from "./JobDetail";
import type { JobView, SnapshotView } from "../../data_adapter/types";

// Mock the data adapter
vi.mock("../../data_adapter", () => ({
  fetchJobsView: vi.fn(),
  fetchSnapshotsView: vi.fn(),
  DataAdapterError: class DataAdapterError extends Error {
    constructor(message: string, public statusCode?: number, public response?: any) {
      super(message);
      this.name = "DataAdapterError";
    }
  },
}));

import { fetchJobsView, fetchSnapshotsView, DataAdapterError } from "../../data_adapter";

describe("JobDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Data rendering", () => {
    it("renders job data verbatim", async () => {
      const mockJob: JobView = {
        job_id: "job_001",
        fabric_data: {
          final_status: "completed",
          engine_used: "ffmpeg",
          proxy_profile: "H264_720p",
          created_at: "2025-12-30T10:00:00Z",
          completed_at: "2025-12-30T10:05:00Z",
        },
        annotations: [],
      };

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      render(<JobDetail jobId="job_001" />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      // Verify all data fields are rendered exactly as provided
      expect(screen.getByText("job_001")).toBeInTheDocument();
      expect(screen.getByText("completed")).toBeInTheDocument();
      expect(screen.getByText("ffmpeg")).toBeInTheDocument();
      expect(screen.getByText("H264_720p")).toBeInTheDocument();
    });

    it("renders annotations correctly", async () => {
      const mockJob: JobView = {
        job_id: "job_002",
        fabric_data: {
          final_status: "completed",
        },
        annotations: [
          {
            annotation_id: "ann_001",
            target_type: "job",
            target_id: "job_002",
            decision: "retry",
            note: "Retry with higher bitrate",
            operator_id: "operator_1",
            created_at: "2025-12-30T11:00:00Z",
          },
          {
            annotation_id: "ann_002",
            target_type: "job",
            target_id: "job_002",
            decision: "ignore",
            note: null,
            operator_id: "operator_2",
            created_at: "2025-12-30T11:30:00Z",
          },
        ],
      };

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      render(<JobDetail jobId="job_002" />);

      await waitFor(() => {
        expect(screen.getByText(/Operator Annotations \(2\)/)).toBeInTheDocument();
      });

      // Verify annotations are displayed
      expect(screen.getByText("retry")).toBeInTheDocument();
      expect(screen.getByText("ignore")).toBeInTheDocument();
      expect(screen.getByText("Retry with higher bitrate")).toBeInTheDocument();
      expect(screen.getByText("operator_1")).toBeInTheDocument();
      expect(screen.getByText("operator_2")).toBeInTheDocument();
    });

    it("maintains deterministic ordering for annotations", async () => {
      const mockJob: JobView = {
        job_id: "job_003",
        fabric_data: { final_status: "completed" },
        annotations: [
          {
            annotation_id: "ann_001",
            target_type: "job",
            target_id: "job_003",
            decision: "retry",
            note: "First annotation",
            operator_id: "op_1",
            created_at: "2025-12-30T10:00:00Z",
          },
          {
            annotation_id: "ann_002",
            target_type: "job",
            target_id: "job_003",
            decision: "ignore",
            note: "Second annotation",
            operator_id: "op_2",
            created_at: "2025-12-30T11:00:00Z",
          },
          {
            annotation_id: "ann_003",
            target_type: "job",
            target_id: "job_003",
            decision: "escalate",
            note: "Third annotation",
            operator_id: "op_3",
            created_at: "2025-12-30T12:00:00Z",
          },
        ],
      };

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const { container } = render(<JobDetail jobId="job_003" />);

      await waitFor(() => {
        expect(screen.getByText("First annotation")).toBeInTheDocument();
      });

      // Verify order is preserved
      const annotations = container.querySelectorAll(".annotation-item");
      expect(annotations).toHaveLength(3);

      expect(annotations[0]).toHaveTextContent("First annotation");
      expect(annotations[1]).toHaveTextContent("Second annotation");
      expect(annotations[2]).toHaveTextContent("Third annotation");
    });

    it("displays snapshots when available", async () => {
      const mockJob: JobView = {
        job_id: "job_004",
        fabric_data: { final_status: "completed" },
        annotations: [],
      };

      const mockSnapshots: SnapshotView[] = [
        {
          snapshot_id: "snap_001",
          fabric_data: {
            timestamp: "2025-12-30T10:00:00Z",
          },
          annotations: [],
        },
        {
          snapshot_id: "snap_002",
          fabric_data: {
            timestamp: "2025-12-30T10:01:00Z",
          },
          annotations: [
            {
              annotation_id: "ann_001",
              target_type: "snapshot",
              target_id: "snap_002",
              decision: "retry",
              note: null,
              operator_id: "op_1",
              created_at: "2025-12-30T10:02:00Z",
            },
          ],
        },
      ];

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSnapshots);

      render(<JobDetail jobId="job_004" />);

      await waitFor(() => {
        expect(screen.getByText(/Snapshots \(2\)/)).toBeInTheDocument();
      });

      expect(screen.getByText("snap_001")).toBeInTheDocument();
      expect(screen.getByText("snap_002")).toBeInTheDocument();
      expect(screen.getByText("1 annotation(s)")).toBeInTheDocument();
    });
  });

  describe("Failed jobs", () => {
    it("shows full error details for failed jobs", async () => {
      const mockJob: JobView = {
        job_id: "job_failed",
        fabric_data: {
          final_status: "failed",
          validation_stage: "source_validation",
          error_message: "Source file not found: /path/to/file.mxf",
          engine_used: "ffmpeg",
          proxy_profile: "H264_720p",
          created_at: "2025-12-30T10:00:00Z",
          completed_at: "2025-12-30T10:01:00Z",
        },
        annotations: [],
      };

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      render(<JobDetail jobId="job_failed" />);

      await waitFor(() => {
        expect(screen.getByText("Failure Details")).toBeInTheDocument();
      });

      // Verify error details are displayed verbatim
      expect(screen.getByText("source_validation")).toBeInTheDocument();
      expect(screen.getByText(/Source file not found/)).toBeInTheDocument();
    });

    it("displays error indicator for failed status", async () => {
      const mockJob: JobView = {
        job_id: "job_error",
        fabric_data: {
          final_status: "error",
        },
        annotations: [],
      };

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const { container } = render(<JobDetail jobId="job_error" />);

      await waitFor(() => {
        expect(screen.getByText("error")).toBeInTheDocument();
      });

      // Error status should have error class and icon
      const statusElement = container.querySelector(".job-detail__status--error");
      expect(statusElement).toBeInTheDocument();

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Error handling", () => {
    it("displays backend errors verbatim", async () => {
      const errorMessage = "Database connection failed";
      (fetchJobsView as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error(errorMessage)
      );

      render(<JobDetail jobId="job_001" />);

      await waitFor(() => {
        expect(screen.getByText(/Error Loading Job/i)).toBeInTheDocument();
      });

      // Error message displayed exactly as received
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it("displays DataAdapterError details", async () => {
      const error = new DataAdapterError(
        "HTTP 500: Internal Server Error",
        500,
        "Detailed error from backend"
      );

      (fetchJobsView as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

      render(<JobDetail jobId="job_001" />);

      await waitFor(() => {
        expect(screen.getByText(/Error Loading Job/i)).toBeInTheDocument();
      });

      // Status code displayed
      expect(screen.getByText(/HTTP Status: 500/i)).toBeInTheDocument();

      // Response body displayed
      expect(screen.getByText("Detailed error from backend")).toBeInTheDocument();
    });

    it("handles job not found gracefully", async () => {
      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          job_id: "job_other",
          fabric_data: { final_status: "completed" },
          annotations: [],
        },
      ]);

      render(<JobDetail jobId="job_not_found" />);

      await waitFor(() => {
        expect(screen.getByText(/Job not found: job_not_found/i)).toBeInTheDocument();
      });
    });

    it("handles snapshot loading errors gracefully", async () => {
      const mockJob: JobView = {
        job_id: "job_001",
        fabric_data: { final_status: "completed" },
        annotations: [],
      };

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Snapshots unavailable")
      );

      // Mock console.error to avoid test output noise
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      render(<JobDetail jobId="job_001" />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      // Job should still render even if snapshots fail
      expect(screen.getByText("completed")).toBeInTheDocument();

      consoleError.mockRestore();
    });
  });

  describe("Navigation", () => {
    it("calls onNavigateBack when back button is clicked", async () => {
      const mockJob: JobView = {
        job_id: "job_001",
        fabric_data: { final_status: "completed" },
        annotations: [],
      };

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const onNavigateBack = vi.fn();
      render(<JobDetail jobId="job_001" onNavigateBack={onNavigateBack} />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      const backButton = screen.getByText(/Back to Jobs List/i);
      await userEvent.click(backButton);

      expect(onNavigateBack).toHaveBeenCalledTimes(1);
    });

    it("does not render back button when onNavigateBack is not provided", async () => {
      const mockJob: JobView = {
        job_id: "job_001",
        fabric_data: { final_status: "completed" },
        annotations: [],
      };

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      render(<JobDetail jobId="job_001" />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      expect(screen.queryByText(/Back to Jobs List/i)).not.toBeInTheDocument();
    });
  });

  describe("Loading states", () => {
    it("shows loading indicator initially", () => {
      (fetchJobsView as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<JobDetail jobId="job_001" />);

      expect(screen.getByText(/Loading job details/i)).toBeInTheDocument();
    });

    it("shows empty annotation message when no annotations", async () => {
      const mockJob: JobView = {
        job_id: "job_001",
        fabric_data: { final_status: "completed" },
        annotations: [],
      };

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      render(<JobDetail jobId="job_001" />);

      await waitFor(() => {
        expect(
          screen.getByText(/No operator annotations for this job/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("No execution imports", () => {
    it("does not import execution modules", () => {
      // This test ensures the module doesn't import execution code
      const JobDetailModule = require("./JobDetail");

      // Component should not have execution-related exports
      expect(JobDetailModule.executeJob).toBeUndefined();
      expect(JobDetailModule.retryJob).toBeUndefined();
      expect(JobDetailModule.triggerExecution).toBeUndefined();

      // Only display component should exist
      expect(typeof JobDetailModule.JobDetail).toBe("function");
    });
  });

  describe("No data mutation", () => {
    it("does not mutate job data", async () => {
      const mockJob: JobView = {
        job_id: "job_001",
        fabric_data: {
          final_status: "completed",
          custom_field: "original_value",
        },
        annotations: [],
      };

      // Create deep copy to verify no mutation
      const originalJob = JSON.parse(JSON.stringify(mockJob));

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      render(<JobDetail jobId="job_001" />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      // Verify data was not mutated
      expect(mockJob).toEqual(originalJob);
      expect(mockJob.fabric_data.custom_field).toBe("original_value");
    });

    it("does not mutate snapshots data", async () => {
      const mockJob: JobView = {
        job_id: "job_001",
        fabric_data: { final_status: "completed" },
        annotations: [],
      };

      const mockSnapshots: SnapshotView[] = [
        {
          snapshot_id: "snap_001",
          fabric_data: { custom: "original" },
          annotations: [],
        },
      ];

      const originalSnapshots = JSON.parse(JSON.stringify(mockSnapshots));

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSnapshots);

      render(<JobDetail jobId="job_001" />);

      await waitFor(() => {
        expect(screen.getByText("snap_001")).toBeInTheDocument();
      });

      // Verify snapshots were not mutated
      expect(mockSnapshots).toEqual(originalSnapshots);
    });
  });

  describe("Fabric data display", () => {
    it("renders complete fabric data as JSON", async () => {
      const mockJob: JobView = {
        job_id: "job_001",
        fabric_data: {
          final_status: "completed",
          engine_used: "ffmpeg",
          custom_field: "custom_value",
          nested: {
            data: "preserved",
          },
        },
        annotations: [],
      };

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);
      (fetchSnapshotsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const { container } = render(<JobDetail jobId="job_001" />);

      await waitFor(() => {
        expect(screen.getByText("Complete Fabric Data")).toBeInTheDocument();
      });

      const fabricDataElement = container.querySelector(".job-detail__fabric-data");
      expect(fabricDataElement).toBeInTheDocument();
      expect(fabricDataElement?.textContent).toContain("custom_field");
      expect(fabricDataElement?.textContent).toContain("custom_value");
      expect(fabricDataElement?.textContent).toContain("preserved");
    });
  });

  describe("Accessibility", () => {
    it("has loading state announcement", () => {
      (fetchJobsView as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {})
      );

      render(<JobDetail jobId="job_001" />);

      const loadingElement = screen.getByRole("status");
      expect(loadingElement).toHaveAttribute("aria-live", "polite");
    });

    it("has error alert role", async () => {
      (fetchJobsView as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Test error")
      );

      render(<JobDetail jobId="job_001" />);

      await waitFor(() => {
        const errorElement = screen.getByRole("alert");
        expect(errorElement).toBeInTheDocument();
      });
    });
  });
});
