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
 * 
 * Phase 9A: Extended with multi-select and execution control support.
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
  
  /**
   * Phase 9A: Enable multi-select mode.
   * When true, supports Shift+click and Cmd/Ctrl+click for selection.
   */
  multiSelect?: boolean;
  
  /**
   * Phase 9A: Callback when selection changes.
   * Receives array of selected job IDs.
   */
  onSelectionChange?: (selectedIds: string[]) => void;
  
  /**
   * Phase 9A: Render execution controls in each row.
   * If provided, this function renders controls for a job.
   */
  renderJobControls?: (jobId: string, status: string) => React.ReactNode;
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
  onClick: (jobId: string, event: React.MouseEvent) => void;
  
  /**
   * Phase 9A: Whether this row is selected.
   */
  isSelected?: boolean;
  
  /**
   * Phase 9A: Whether multi-select mode is enabled.
   */
  multiSelect?: boolean;
  
  /**
   * Phase 9A: Render controls for this job.
   */
  renderControls?: () => React.ReactNode;
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
