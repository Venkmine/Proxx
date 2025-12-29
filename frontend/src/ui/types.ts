/**
 * V2 UI Types - Minimal boundary types for job creation.
 *
 * These types define the EXACT interface between UI and backend.
 * They are INTENTIONALLY minimal to enforce UX boundary discipline.
 *
 * Part of V2 IMPLEMENTATION SLICE 5
 */

/**
 * User Proxy Profile - User-friendly intent specification.
 *
 * CRITICAL: This is a POLICY LAYER type only.
 * UI treats this as opaque intent, not execution configuration.
 */
export interface UserProxyProfile {
  /** Schema version (currently "1.0") */
  user_profile_version: string;

  /** Human-readable profile name */
  name: string;

  /** Constraint specifications (opaque to UI) */
  constraints: Record<string, any>;

  /** Optional human-readable description */
  notes?: string;
}

/**
 * Job Creation Success Result.
 *
 * Contains ONLY the opaque JobSpec.
 * UI MUST NOT inspect or modify the JobSpec.
 */
export interface JobCreationSuccess {
  /** Opaque JobSpec (UI must not inspect internals) */
  jobspec: any; // Deliberately 'any' - UI treats as opaque
}

/**
 * Job Creation Failure Result.
 *
 * Contains explicit error information.
 * UI displays error verbatim, NO transformations.
 */
export interface JobCreationFailure {
  /** Error classification */
  error_type: "compilation" | "validation" | "deprecated" | "schema" | "unexpected";

  /** Explicit error message (display verbatim) */
  error_message: string;

  /** User profile name (for context) */
  user_profile_name?: string;
}

/**
 * Job Creation Result (discriminated union).
 */
export type JobCreationResult = JobCreationSuccess | JobCreationFailure;

/**
 * Type guard for success result.
 */
export function isJobCreationSuccess(result: JobCreationResult): result is JobCreationSuccess {
  return "jobspec" in result;
}

/**
 * Type guard for failure result.
 */
export function isJobCreationFailure(result: JobCreationResult): result is JobCreationFailure {
  return "error_type" in result;
}
