/**
 * Job Detail Screen Types
 * 
 * UI-specific types for the Job Detail screen.
 * Reuses shared types from ui/data_adapter/types.ts.
 * 
 * CONSTRAINTS:
 * - No business logic
 * - No derived fields
 * - Props only
 */

import type { JobView, SnapshotView } from "../../data_adapter/types";

/**
 * Props for JobDetail component.
 */
export interface JobDetailProps {
  /**
   * Job ID to display details for.
   */
  jobId: string;
  
  /**
   * Optional callback to navigate back to jobs list.
   */
  onNavigateBack?: () => void;
  
  /**
   * Optional CSS class name for styling.
   */
  className?: string;
}

/**
 * State of the JobDetail component.
 */
export interface JobDetailState {
  /**
   * Current loading state for job data.
   */
  loadingJob: boolean;
  
  /**
   * Current loading state for snapshots data.
   */
  loadingSnapshots: boolean;
  
  /**
   * Job data fetched from backend.
   * Null if not yet loaded.
   */
  job: JobView | null;
  
  /**
   * Snapshots for this job.
   * Null if not yet loaded.
   */
  snapshots: SnapshotView[] | null;
  
  /**
   * Error from backend, if any.
   * Stored verbatim.
   */
  error: Error | null;
}

/**
 * Props for AnnotationsList component.
 */
export interface AnnotationsListProps {
  /**
   * Job view containing annotations.
   */
  job: JobView;
}
