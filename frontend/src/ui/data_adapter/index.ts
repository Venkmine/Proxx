/**
 * UI Data Adapter Module
 * 
 * Read-only data adapter for V2 UI.
 * Consumer-only layer with no execution authority.
 * 
 * See UI_DATA_CONTRACT.md for detailed usage and constraints.
 */

export {
  fetchJobsView,
  fetchSnapshotsView,
  fetchAnnotations,
  fetchAnnotationsForTarget,
  DataAdapterError,
} from "./api";

export type {
  JobView,
  SnapshotView,
  Annotation,
  AnnotationDecision,
  AnnotationTargetType,
  JobsViewResponse,
  SnapshotsViewResponse,
  AnnotationsResponse,
} from "./types";
