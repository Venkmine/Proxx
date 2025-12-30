/**
 * Jobs List Screen Types
 * 
 * UI-specific types for the Jobs List screen.
 * Reuses shared types from ui/data_adapter/types.ts.
 * 
 * CONSTRAINTS:
 * - No business logic
 * - No derived fields
 * - Props only
 */

import type { JobView } from "../../data_adapter/types";

/**
 * Props for JobsList component.
 */
export interface JobsListProps {
  /**
   * Optional callback when a job row is clicked.
   * Receives the job_id of the clicked job.
   */
  onJobClick?: (jobId: string) => void;
  
  /**
   * Optional CSS class name for styling.
   */
  className?: string;
}

/**
 * Props for JobRow component.
 */
export interface JobRowProps {
  /**
   * Job data to render.
   */
  job: JobView;
  
  /**
   * Callback when row is clicked.
   */
  onClick: (jobId: string) => void;
}

/**
 * State of the JobsList component.
 */
export interface JobsListState {
  /**
   * Current loading state.
   */
  loading: boolean;
  
  /**
   * Jobs fetched from backend.
   * Null if not yet loaded.
   */
  jobs: JobView[] | null;
  
  /**
   * Error from backend, if any.
   * Stored verbatim.
   */
  error: Error | null;
}
