/**
 * Add Annotation Component Types
 * 
 * Props and local state types for annotation creation UI.
 * 
 * CONSTRAINTS:
 * - Props only (no global state)
 * - Callback-based
 * - No execution logic
 * - No derived state
 */

import type { AnnotationDecision, AnnotationTargetType } from "../../data_adapter/types";

/**
 * Props for AddAnnotation component.
 */
export interface AddAnnotationProps {
  /**
   * Target type for the annotation.
   * "job" or "snapshot"
   */
  target_type: AnnotationTargetType;

  /**
   * Target ID (job_id or snapshot_id).
   */
  target_id: string;

  /**
   * Callback invoked after successful annotation creation.
   * Parent component should use this to refresh the annotations list.
   */
  onAnnotationCreated?: () => void;
}

/**
 * Local component state for form.
 */
export interface AddAnnotationFormState {
  decision: AnnotationDecision | "";
  note: string;
  isSubmitting: boolean;
  error: string | null;
}
