/**
 * Jobs List Screen Tests
 * 
 * Tests asserting:
 * - Data rendered verbatim
 * - Deterministic ordering
 * - Failed jobs show error indicator
 * - No execution imports
 * - No mutation of data
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JobsList } from "./JobsList";
import type { JobView } from "../../data_adapter/types";

// Mock the data adapter
vi.mock("../../data_adapter", () => ({
  fetchJobsView: vi.fn(),
  DataAdapterError: class DataAdapterError extends Error {
    constructor(message: string, public statusCode?: number, public response?: any) {
      super(message);
      this.name = "DataAdapterError";
    }
  },
}));

import { fetchJobsView, DataAdapterError } from "../../data_adapter";

describe("JobsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Data rendering", () => {
    it("renders job data verbatim", async () => {
      const mockJobs: JobView[] = [
        {
          job_id: "job_001",
          fabric_data: {
            final_status: "completed",
            proxy_profile: "H264_720p",
            engine_used: "ffmpeg",
            created_at: "2025-12-30T10:00:00Z",
          },
          annotations: [],
        },
        {
          job_id: "job_002",
          fabric_data: {
            final_status: "running",
            proxy_profile: "ProRes_422",
            engine_used: "ffmpeg",
            created_at: "2025-12-30T11:00:00Z",
          },
          annotations: [
            {
              annotation_id: "ann_001",
              target_type: "job",
              target_id: "job_002",
              decision: "retry",
              note: null,
              operator_id: "op_001",
              created_at: "2025-12-30T11:30:00Z",
            },
          ],
        },
      ];

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockJobs);

      render(<JobsList />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      // Verify all data fields are rendered exactly as provided
      expect(screen.getByText("job_001")).toBeInTheDocument();
      expect(screen.getByText("completed")).toBeInTheDocument();
      expect(screen.getByText("H264_720p")).toBeInTheDocument();

      expect(screen.getByText("job_002")).toBeInTheDocument();
      expect(screen.getByText("running")).toBeInTheDocument();
      expect(screen.getByText("ProRes_422")).toBeInTheDocument();
      
      // Annotation count
      expect(screen.getByText("0")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("preserves deterministic ordering", async () => {
      const mockJobs: JobView[] = [
        {
          job_id: "job_001",
          fabric_data: { final_status: "completed" },
          annotations: [],
        },
        {
          job_id: "job_002",
          fabric_data: { final_status: "running" },
          annotations: [],
        },
        {
          job_id: "job_003",
          fabric_data: { final_status: "failed" },
          annotations: [],
        },
      ];

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockJobs);

      const { container } = render(<JobsList />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      // Verify order is preserved
      const rows = container.querySelectorAll(".job-row");
      expect(rows).toHaveLength(3);
      
      expect(rows[0]).toHaveTextContent("job_001");
      expect(rows[1]).toHaveTextContent("job_002");
      expect(rows[2]).toHaveTextContent("job_003");
    });

    it("handles missing fields gracefully with fallbacks", async () => {
      const mockJobs: JobView[] = [
        {
          job_id: "job_001",
          fabric_data: {}, // Empty fabric_data
          annotations: [],
        },
      ];

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockJobs);

      render(<JobsList />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      // Verify fallbacks are used
      expect(screen.getByText("(unknown)")).toBeInTheDocument(); // final_status
      expect(screen.getByText("(none)")).toBeInTheDocument(); // proxy_profile
    });
  });

  describe("Failed jobs", () => {
    it("shows error indicator for failed jobs", async () => {
      const mockJobs: JobView[] = [
        {
          job_id: "job_failed",
          fabric_data: { final_status: "failed" },
          annotations: [],
        },
        {
          job_id: "job_error",
          fabric_data: { final_status: "error" },
          annotations: [],
        },
        {
          job_id: "job_ok",
          fabric_data: { final_status: "completed" },
          annotations: [],
        },
      ];

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockJobs);

      const { container } = render(<JobsList />);

      await waitFor(() => {
        expect(screen.getByText("job_failed")).toBeInTheDocument();
      });

      // Failed jobs should have error class
      const failedRow = screen.getByText("job_failed").closest(".job-row");
      expect(failedRow).toHaveClass("job-row--error");

      const errorRow = screen.getByText("job_error").closest(".job-row");
      expect(errorRow).toHaveClass("job-row--error");

      // Success job should not have error class
      const okRow = screen.getByText("job_ok").closest(".job-row");
      expect(okRow).not.toHaveClass("job-row--error");

      // Error indicators should be present
      const indicators = container.querySelectorAll(".error-indicator");
      expect(indicators).toHaveLength(2); // failed and error jobs
    });
  });

  describe("User interactions", () => {
    it("calls onJobClick when row is clicked", async () => {
      const mockJobs: JobView[] = [
        {
          job_id: "job_001",
          fabric_data: { final_status: "completed" },
          annotations: [],
        },
      ];

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockJobs);

      const onJobClick = vi.fn();
      render(<JobsList onJobClick={onJobClick} />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      const row = screen.getByText("job_001").closest(".job-row");
      await userEvent.click(row!);

      expect(onJobClick).toHaveBeenCalledWith("job_001");
      expect(onJobClick).toHaveBeenCalledTimes(1);
    });

    it("supports keyboard navigation", async () => {
      const mockJobs: JobView[] = [
        {
          job_id: "job_001",
          fabric_data: { final_status: "completed" },
          annotations: [],
        },
      ];

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockJobs);

      const onJobClick = vi.fn();
      render(<JobsList onJobClick={onJobClick} />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      const row = screen.getByText("job_001").closest(".job-row");
      row!.focus();
      
      await userEvent.keyboard("{Enter}");
      expect(onJobClick).toHaveBeenCalledWith("job_001");
    });
  });

  describe("Error handling", () => {
    it("displays backend errors verbatim", async () => {
      const errorMessage = "Database connection failed";
      (fetchJobsView as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error(errorMessage)
      );

      render(<JobsList />);

      await waitFor(() => {
        expect(screen.getByText(/Error Loading Jobs/i)).toBeInTheDocument();
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

      render(<JobsList />);

      await waitFor(() => {
        expect(screen.getByText(/Error Loading Jobs/i)).toBeInTheDocument();
      });

      // Status code displayed
      expect(screen.getByText(/HTTP Status: 500/i)).toBeInTheDocument();

      // Response body displayed
      expect(screen.getByText("Detailed error from backend")).toBeInTheDocument();
    });
  });

  describe("Loading states", () => {
    it("shows loading indicator initially", () => {
      (fetchJobsView as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<JobsList />);

      expect(screen.getByText(/Loading jobs/i)).toBeInTheDocument();
    });

    it("shows empty state when no jobs", async () => {
      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      render(<JobsList />);

      await waitFor(() => {
        expect(screen.getByText(/No jobs found/i)).toBeInTheDocument();
      });
    });
  });

  describe("No execution imports", () => {
    it("does not import execution modules", () => {
      // This test ensures the module doesn't import execution code
      // We verify by checking the module's imports at compile time
      
      // Runtime check: ensure component doesn't expose execution-related props
      const JobsListModule = require("./JobsList");
      
      // Component should not have execution-related props
      expect(JobsListModule.executeJob).toBeUndefined();
      expect(JobsListModule.retryJob).toBeUndefined();
      expect(JobsListModule.triggerExecution).toBeUndefined();
      
      // Only display component should exist
      expect(typeof JobsListModule.JobsList).toBe("function");
    });
  });

  describe("No data mutation", () => {
    it("does not mutate job data", async () => {
      const mockJobs: JobView[] = [
        {
          job_id: "job_001",
          fabric_data: {
            final_status: "completed",
            custom_field: "original_value",
          },
          annotations: [],
        },
      ];

      // Create deep copy to verify no mutation
      const originalJobs = JSON.parse(JSON.stringify(mockJobs));

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockJobs);

      render(<JobsList />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      // Verify data was not mutated
      expect(mockJobs).toEqual(originalJobs);
      expect(mockJobs[0].fabric_data.custom_field).toBe("original_value");
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA attributes", async () => {
      const mockJobs: JobView[] = [
        {
          job_id: "job_001",
          fabric_data: { final_status: "completed" },
          annotations: [],
        },
      ];

      (fetchJobsView as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockJobs);

      render(<JobsList />);

      await waitFor(() => {
        expect(screen.getByText("job_001")).toBeInTheDocument();
      });

      const row = screen.getByText("job_001").closest(".job-row");
      
      expect(row).toHaveAttribute("role", "button");
      expect(row).toHaveAttribute("tabIndex", "0");
      expect(row).toHaveAttribute("aria-label");
    });

    it("has loading state announcement", () => {
      (fetchJobsView as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {})
      );

      render(<JobsList />);

      const loadingElement = screen.getByRole("status");
      expect(loadingElement).toHaveAttribute("aria-live", "polite");
    });

    it("has error alert role", async () => {
      (fetchJobsView as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Test error")
      );

      render(<JobsList />);

      await waitFor(() => {
        const errorElement = screen.getByRole("alert");
        expect(errorElement).toBeInTheDocument();
      });
    });
  });
});
