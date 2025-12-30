/**
 * Job Status Message Utilities
 * 
 * Convert enum-style status labels into human-readable sentences.
 * 
 * CONSTRAINTS:
 * - Read-only transformations
 * - No execution logic
 * - Uses existing backend data only
 */

/**
 * Format job status as a human-readable sentence.
 */
export function formatJobStatus(
  status: string,
  metadata?: {
    resolveEdition?: string | null;
    resolveVersion?: string | null;
    engineUsed?: string | null;
    validationError?: string | null;
  }
): string {
  const normalizedStatus = status.toUpperCase();

  switch (normalizedStatus) {
    case "COMPLETED":
      if (metadata?.engineUsed === "resolve") {
        return `COMPLETED — Rendered successfully by DaVinci Resolve`;
      }
      return "COMPLETED — All clips rendered successfully";

    case "FAILED":
      if (metadata?.validationError) {
        return `FAILED — ${metadata.validationError}`;
      }
      return "FAILED — One or more clips failed to render";

    case "SKIPPED":
      if (metadata?.resolveEdition === "free") {
        return "SKIPPED — Requires DaVinci Resolve Studio";
      }
      if (!metadata?.resolveEdition || !metadata?.resolveVersion) {
        return "SKIPPED — DaVinci Resolve is not installed";
      }
      if (metadata?.resolveVersion) {
        return `SKIPPED — Requires Resolve Studio 20.3.1+ (detected: ${metadata.resolveVersion})`;
      }
      return "SKIPPED — Environment requirements not met";

    case "RUNNING":
      if (metadata?.engineUsed === "resolve") {
        return "RUNNING — DaVinci Resolve is rendering";
      }
      return "RUNNING — Job is being processed";

    case "PENDING":
      return "PENDING — Waiting to start";

    case "QUEUED":
      return "QUEUED — In processing queue";

    case "PARTIAL":
      return "PARTIAL — Some clips completed before job stopped";

    default:
      return status;
  }
}

/**
 * Format clip/task status as a human-readable sentence.
 */
export function formatClipStatus(
  status: string,
  metadata?: {
    engineUsed?: string | null;
    failureReason?: string | null;
  }
): string {
  const normalizedStatus = status.toUpperCase();

  switch (normalizedStatus) {
    case "COMPLETED":
      if (metadata?.engineUsed === "resolve") {
        return "COMPLETED — Rendered by Resolve";
      }
      return "COMPLETED — Rendered successfully";

    case "FAILED":
      if (metadata?.failureReason) {
        return `FAILED — ${metadata.failureReason}`;
      }
      return "FAILED — Render failed";

    case "SKIPPED":
      return "SKIPPED — Not processed";

    case "RUNNING":
      return "RUNNING — Rendering in progress";

    case "QUEUED":
      return "QUEUED — Waiting to render";

    default:
      return status;
  }
}

/**
 * Get status icon for display.
 */
export function getStatusIcon(status: string): string {
  const normalizedStatus = status.toUpperCase();

  switch (normalizedStatus) {
    case "COMPLETED":
      return "✓";
    case "FAILED":
      return "✗";
    case "SKIPPED":
      return "⊘";
    case "RUNNING":
      return "▶";
    case "PENDING":
      return "○";
    case "QUEUED":
      return "⋯";
    case "PARTIAL":
      return "◐";
    default:
      return "?";
  }
}
