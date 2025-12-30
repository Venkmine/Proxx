/**
 * UI Data Adapter - Read-Only API
 * 
 * Functions to fetch data from backend Fabric view exports.
 * This is a CONSUMER-ONLY layer.
 * 
 * CONSTRAINTS:
 * - Read-only HTTP/local adapter
 * - No mutation logic
 * - No business logic
 * - No execution imports
 * - No smart defaults
 * - No derived logic
 * - Failures surfaced verbatim
 */

import type {
  JobView,
  SnapshotView,
  Annotation,
  JobsViewResponse,
  SnapshotsViewResponse,
  AnnotationsResponse,
} from "./types";

/**
 * Base URL for API endpoints.
 * Can be configured via environment variable.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * Fetch error class.
 * Surfaces backend errors verbatim without interpretation.
 */
export class DataAdapterError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: any
  ) {
    super(message);
    this.name = "DataAdapterError";
  }
}

/**
 * Generic fetch wrapper.
 * Throws DataAdapterError on failure with original response.
 */
async function fetchData<T>(endpoint: string): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);
    
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new DataAdapterError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorBody
      );
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof DataAdapterError) {
      throw error;
    }
    throw new DataAdapterError(
      `Network error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Fetch jobs view from Fabric exports.
 * Returns all jobs with their annotations in deterministic order.
 * 
 * @returns JobsViewResponse containing array of JobView
 * @throws DataAdapterError on failure (surfaced verbatim)
 */
export async function fetchJobsView(): Promise<JobView[]> {
  const response = await fetchData<JobsViewResponse>("/api/v2/fabric/jobs");
  return response.jobs;
}

/**
 * Fetch snapshots view for a specific job.
 * Returns all snapshots for the job with their annotations in deterministic order.
 * 
 * @param jobId - The job ID to fetch snapshots for
 * @returns Array of SnapshotView
 * @throws DataAdapterError on failure (surfaced verbatim)
 */
export async function fetchSnapshotsView(jobId: string): Promise<SnapshotView[]> {
  const response = await fetchData<SnapshotsViewResponse>(
    `/api/v2/fabric/jobs/${encodeURIComponent(jobId)}/snapshots`
  );
  return response.snapshots;
}

/**
 * Fetch all annotations.
 * Returns all operator annotations in deterministic order.
 * 
 * @returns Array of Annotation
 * @throws DataAdapterError on failure (surfaced verbatim)
 */
export async function fetchAnnotations(): Promise<Annotation[]> {
  const response = await fetchData<AnnotationsResponse>("/api/v2/fabric/annotations");
  return response.annotations;
}

/**
 * Fetch annotations for a specific target.
 * Returns annotations filtered by target_type and target_id.
 * 
 * @param targetType - "job" or "snapshot"
 * @param targetId - The target ID
 * @returns Array of Annotation
 * @throws DataAdapterError on failure (surfaced verbatim)
 */
export async function fetchAnnotationsForTarget(
  targetType: "job" | "snapshot",
  targetId: string
): Promise<Annotation[]> {
  const response = await fetchData<AnnotationsResponse>(
    `/api/v2/fabric/annotations?target_type=${targetType}&target_id=${encodeURIComponent(targetId)}`
  );
  return response.annotations;
}
