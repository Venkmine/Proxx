/**
 * Why This Happened Component Types
 */

/**
 * Props for WhyThisHappened component.
 */
export interface WhyThisHappenedProps {
  /**
   * Final job status
   */
  finalStatus: string;

  /**
   * Engine that was used ("ffmpeg" | "resolve" | null)
   */
  engineUsed: string | null;

  /**
   * Detected Resolve edition
   */
  resolveEdition: string | null;

  /**
   * Detected Resolve version
   */
  resolveVersion: string | null;

  /**
   * Source file extensions
   */
  sourceExtensions: string[];

  /**
   * Validation error message if any
   */
  validationError: string | null;

  /**
   * Optional CSS class name
   */
  className?: string;
}
