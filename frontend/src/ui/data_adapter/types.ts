/**
 * UI Data Adapter Types
 * 
 * These types mirror backend exports exactly.
 * They represent read-only views from Fabric.
 * 
 * CONSTRAINTS:
 * - No derived fields
 * - No computed properties
 * - No transformation logic
 * - Types must match backend exports precisely
 */

/**
 * Operator annotation decision types.
 * Must match backend OperatorAnnotation.decision field.
 */
export type AnnotationDecision = "retry" | "ignore" | "escalate";

/**
 * Annotation target types.
 * Must match backend OperatorAnnotation.target_type field.
 */
export type AnnotationTargetType = "job" | "snapshot";

/**
 * Operator annotation.
 * Mirrors backend OperatorAnnotation model from fabric.operator_annotations.models.
 */
export interface Annotation {
  annotation_id: string;  // UUID string
  target_type: AnnotationTargetType;
  target_id: string;
  decision: AnnotationDecision;
  note: string | null;
  operator_id: string;
  created_at: string;  // ISO 8601 datetime string (UTC)
}

/**
 * Job view with annotations.
 * Mirrors backend JobWithAnnotations from fabric.views.views.
 */
export interface JobView {
  job_id: string;
  fabric_data: Record<string, any>;  // Complete Fabric job data (unchanged)
  annotations: Annotation[];  // Sorted by created_at, then annotation_id
}

/**
 * Snapshot view with annotations.
 * Mirrors backend SnapshotWithAnnotations from fabric.views.views.
 */
export interface SnapshotView {
  snapshot_id: string;
  fabric_data: Record<string, any>;  // Complete Fabric snapshot data (unchanged)
  annotations: Annotation[];  // Sorted by created_at, then annotation_id
}

/**
 * Response from jobs view endpoint.
 */
export interface JobsViewResponse {
  jobs: JobView[];
}

/**
 * Response from snapshots view endpoint.
 */
export interface SnapshotsViewResponse {
  snapshots: SnapshotView[];
}

/**
 * Response from annotations list endpoint.
 */
export interface AnnotationsResponse {
  annotations: Annotation[];
}
