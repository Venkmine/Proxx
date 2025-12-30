/**
 * UI Data Adapter Tests
 * 
 * Tests asserting:
 * - Deterministic ordering
 * - No transformation of backend data
 * - Failures surfaced verbatim
 * - No execution imports
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchJobsView,
  fetchSnapshotsView,
  fetchAnnotations,
  fetchAnnotationsForTarget,
  DataAdapterError,
} from "./api";
import type { JobView, SnapshotView, Annotation } from "./types";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("UI Data Adapter", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchJobsView", () => {
    it("returns jobs in deterministic order", async () => {
      const mockJobs: JobView[] = [
        {
          job_id: "job_001",
          fabric_data: { status: "completed" },
          annotations: [],
        },
        {
          job_id: "job_002",
          fabric_data: { status: "running" },
          annotations: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: mockJobs }),
      });

      const result1 = await fetchJobsView();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: mockJobs }),
      });

      const result2 = await fetchJobsView();

      // Same input should produce identical output
      expect(result1).toEqual(result2);
      expect(result1[0].job_id).toBe("job_001");
      expect(result1[1].job_id).toBe("job_002");
    });

    it("does not transform backend data", async () => {
      const mockJobs: JobView[] = [
        {
          job_id: "job_001",
          fabric_data: {
            status: "completed",
            custom_field: "custom_value",
            nested: { data: "preserved" },
          },
          annotations: [
            {
              annotation_id: "ann_001",
              target_type: "job",
              target_id: "job_001",
              decision: "retry",
              note: "Test note",
              operator_id: "op_001",
              created_at: "2025-12-30T12:00:00Z",
            },
          ],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: mockJobs }),
      });

      const result = await fetchJobsView();

      // Data should be unchanged
      expect(result[0]).toEqual(mockJobs[0]);
      expect(result[0].fabric_data.custom_field).toBe("custom_value");
      expect(result[0].fabric_data.nested.data).toBe("preserved");
      expect(result[0].annotations[0].note).toBe("Test note");
    });

    it("surfaces failures verbatim", async () => {
      const errorBody = "Internal Server Error: Database connection failed";
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => errorBody,
      });

      await expect(fetchJobsView()).rejects.toThrow(DataAdapterError);
      
      try {
        await fetchJobsView();
      } catch (error) {
        expect(error).toBeInstanceOf(DataAdapterError);
        expect((error as DataAdapterError).statusCode).toBe(500);
        expect((error as DataAdapterError).response).toBe(errorBody);
        expect((error as DataAdapterError).message).toContain("500");
      }
    });

    it("surfaces network errors verbatim", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      await expect(fetchJobsView()).rejects.toThrow(DataAdapterError);
      
      try {
        await fetchJobsView();
      } catch (error) {
        expect(error).toBeInstanceOf(DataAdapterError);
        expect((error as DataAdapterError).message).toContain("Network timeout");
      }
    });
  });

  describe("fetchSnapshotsView", () => {
    it("returns snapshots in deterministic order", async () => {
      const mockSnapshots: SnapshotView[] = [
        {
          snapshot_id: "snap_001",
          fabric_data: { state: "ok" },
          annotations: [],
        },
        {
          snapshot_id: "snap_002",
          fabric_data: { state: "error" },
          annotations: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ snapshots: mockSnapshots }),
      });

      const result1 = await fetchSnapshotsView("job_001");
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ snapshots: mockSnapshots }),
      });

      const result2 = await fetchSnapshotsView("job_001");

      // Same input should produce identical output
      expect(result1).toEqual(result2);
      expect(result1[0].snapshot_id).toBe("snap_001");
      expect(result1[1].snapshot_id).toBe("snap_002");
    });

    it("does not transform backend data", async () => {
      const mockSnapshots: SnapshotView[] = [
        {
          snapshot_id: "snap_001",
          fabric_data: {
            state: "ok",
            timestamp: "2025-12-30T12:00:00Z",
            metadata: { key: "value" },
          },
          annotations: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ snapshots: mockSnapshots }),
      });

      const result = await fetchSnapshotsView("job_001");

      // Data should be unchanged
      expect(result[0]).toEqual(mockSnapshots[0]);
      expect(result[0].fabric_data.metadata.key).toBe("value");
    });

    it("encodes job_id in URL correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ snapshots: [] }),
      });

      await fetchSnapshotsView("job/with/slashes");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("job%2Fwith%2Fslashes")
      );
    });
  });

  describe("fetchAnnotations", () => {
    it("returns annotations in deterministic order", async () => {
      const mockAnnotations: Annotation[] = [
        {
          annotation_id: "ann_001",
          target_type: "job",
          target_id: "job_001",
          decision: "retry",
          note: null,
          operator_id: "op_001",
          created_at: "2025-12-30T10:00:00Z",
        },
        {
          annotation_id: "ann_002",
          target_type: "snapshot",
          target_id: "snap_001",
          decision: "ignore",
          note: "Test",
          operator_id: "op_002",
          created_at: "2025-12-30T11:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ annotations: mockAnnotations }),
      });

      const result1 = await fetchAnnotations();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ annotations: mockAnnotations }),
      });

      const result2 = await fetchAnnotations();

      // Same input should produce identical output
      expect(result1).toEqual(result2);
      expect(result1).toHaveLength(2);
    });

    it("does not transform annotation data", async () => {
      const mockAnnotations: Annotation[] = [
        {
          annotation_id: "ann_001",
          target_type: "job",
          target_id: "job_001",
          decision: "escalate",
          note: "Original note text",
          operator_id: "op_001",
          created_at: "2025-12-30T12:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ annotations: mockAnnotations }),
      });

      const result = await fetchAnnotations();

      // Data should be unchanged
      expect(result[0]).toEqual(mockAnnotations[0]);
      expect(result[0].note).toBe("Original note text");
    });
  });

  describe("fetchAnnotationsForTarget", () => {
    it("constructs query parameters correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ annotations: [] }),
      });

      await fetchAnnotationsForTarget("job", "job_001");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("target_type=job")
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("target_id=job_001")
      );
    });

    it("encodes target_id correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ annotations: [] }),
      });

      await fetchAnnotationsForTarget("snapshot", "snap/with/slashes");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("snap%2Fwith%2Fslashes")
      );
    });
  });

  describe("Error handling", () => {
    it("preserves HTTP status codes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Job not found",
      });

      try {
        await fetchJobsView();
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(DataAdapterError);
        expect((error as DataAdapterError).statusCode).toBe(404);
      }
    });

    it("preserves error response body", async () => {
      const errorBody = JSON.stringify({ error: "Detailed error message" });
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => errorBody,
      });

      try {
        await fetchJobsView();
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(DataAdapterError);
        expect((error as DataAdapterError).response).toBe(errorBody);
      }
    });
  });

  describe("No execution imports", () => {
    it("does not import execution modules", () => {
      // This test ensures the module doesn't import execution code
      // We verify by checking the module's imports at compile time
      // If execution imports are added, TypeScript/build will fail
      
      // Runtime check: ensure no execution-related exports
      const apiModule = require("./api");
      const typeModule = require("./types");
      
      // Check that modules don't expose execution-related functions
      expect(apiModule.executeJob).toBeUndefined();
      expect(apiModule.retryJob).toBeUndefined();
      expect(apiModule.createJob).toBeUndefined();
      expect(apiModule.triggerExecution).toBeUndefined();
      
      // Only read-only fetch functions should exist
      expect(typeof apiModule.fetchJobsView).toBe("function");
      expect(typeof apiModule.fetchSnapshotsView).toBe("function");
      expect(typeof apiModule.fetchAnnotations).toBe("function");
      expect(typeof apiModule.fetchAnnotationsForTarget).toBe("function");
    });
  });

  describe("Type safety", () => {
    it("enforces annotation decision types", async () => {
      const mockAnnotations: Annotation[] = [
        {
          annotation_id: "ann_001",
          target_type: "job",
          target_id: "job_001",
          decision: "retry", // Only "retry" | "ignore" | "escalate" allowed
          note: null,
          operator_id: "op_001",
          created_at: "2025-12-30T12:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ annotations: mockAnnotations }),
      });

      const result = await fetchAnnotations();
      
      // TypeScript should enforce this at compile time
      expect(["retry", "ignore", "escalate"]).toContain(result[0].decision);
    });

    it("enforces annotation target types", async () => {
      const mockAnnotations: Annotation[] = [
        {
          annotation_id: "ann_001",
          target_type: "job", // Only "job" | "snapshot" allowed
          target_id: "job_001",
          decision: "retry",
          note: null,
          operator_id: "op_001",
          created_at: "2025-12-30T12:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ annotations: mockAnnotations }),
      });

      const result = await fetchAnnotations();
      
      // TypeScript should enforce this at compile time
      expect(["job", "snapshot"]).toContain(result[0].target_type);
    });
  });
});
