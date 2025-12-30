/**
 * Pre-flight Compatibility Panel Types
 * 
 * Type definitions for the compatibility panel.
 */

/**
 * Compatibility status for a format.
 */
export interface FormatCompatibilityStatus {
  /**
   * Status: RUN, SKIP, or BLOCK
   */
  status: "RUN" | "SKIP" | "BLOCK";

  /**
   * Human-readable explanation
   */
  reason: string;
}

/**
 * Props for PreflightCompatibilityPanel component.
 */
export interface PreflightCompatibilityPanelProps {
  /**
   * Detected Resolve edition ("free" | "studio" | null)
   */
  resolveEdition: string | null;

  /**
   * Detected Resolve version (e.g., "19.0.3" | null)
   */
  resolveVersion: string | null;

  /**
   * List of source file extensions (e.g., [".braw", ".r3d"])
   */
  sourceExtensions: string[];

  /**
   * Engine that will be/was used ("ffmpeg" | "resolve")
   */
  engineUsed: string | null;

  /**
   * Optional CSS class name
   */
  className?: string;
}
