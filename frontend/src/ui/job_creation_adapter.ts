/**
 * V2 Job Creation Adapter - Minimal UX boundary for job creation.
 *
 * This module provides the FIRST user-facing UX boundary in V2.
 * It exposes INTENT ONLY and must not leak execution power.
 *
 * DESIGN PRINCIPLES:
 * ==================
 * 1. UI selects intent (UserProxyProfile) only
 * 2. UI provides sources + output location
 * 3. UI receives JobSpec OR explicit failure
 * 4. UI treats JobSpec as opaque (no inspection)
 * 5. UI treats canonical proxy profile as opaque (no inspection)
 * 6. UI displays errors verbatim (no transformation)
 * 7. UI does NOT retry, override, or infer alternatives
 *
 * FORBIDDEN UX ACTIONS:
 * =====================
 * ❌ Display codec/container details
 * ❌ Allow profile editing
 * ❌ Retry failures automatically
 * ❌ Infer alternatives
 * ❌ Modify JobSpec fields
 * ❌ Inspect execution metadata
 * ❌ Implement compilation logic
 * ❌ Implement validation logic
 * ❌ Select default profiles
 * ❌ Interpret canonical profile IDs
 *
 * If the UI "knows" how encoding works, it is WRONG.
 *
 * Part of V2 IMPLEMENTATION SLICE 5
 */

import {
  UserProxyProfile,
  JobCreationResult,
  JobCreationSuccess,
  JobCreationFailure,
  isJobCreationSuccess,
  isJobCreationFailure,
} from "./types";

/**
 * BACKEND BOUNDARY - Call backend job creation endpoint.
 *
 * This is the ONLY way UI creates jobs in V2.
 * NO other execution paths are permitted.
 *
 * @param userProfile - User proxy profile (intent specification)
 * @param sources - Source file paths
 * @param outputDirectory - Output directory path
 * @param namingTemplate - Naming template string
 * @returns JobCreationResult (success or explicit failure)
 */
export async function createJobFromUserProfile(
  userProfile: UserProxyProfile,
  sources: string[],
  outputDirectory: string,
  namingTemplate: string
): Promise<JobCreationResult> {
  try {
    const response = await fetch("/api/v2/create-job", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_profile: userProfile,
        sources,
        output_directory: outputDirectory,
        naming_template: namingTemplate,
      }),
    });

    if (!response.ok) {
      // HTTP error - treat as unexpected failure
      const errorText = await response.text();
      return {
        error_type: "unexpected",
        error_message: `HTTP ${response.status}: ${errorText}`,
      } as JobCreationFailure;
    }

    const result = await response.json();

    // Backend returns either success or failure
    // UI MUST NOT transform or interpret the result
    return result as JobCreationResult;
  } catch (error) {
    // Network or unexpected error
    return {
      error_type: "unexpected",
      error_message: `Failed to create job: ${error instanceof Error ? error.message : String(error)}`,
    } as JobCreationFailure;
  }
}

/**
 * List ACTIVE UserProxyProfiles.
 *
 * UI displays only ACTIVE profiles for job creation.
 * DEPRECATED and INVALID profiles are excluded.
 *
 * @returns Array of active UserProxyProfiles
 */
export async function listActiveUserProfiles(): Promise<UserProxyProfile[]> {
  try {
    const response = await fetch("/api/v2/user-profiles/active");

    if (!response.ok) {
      console.error(`Failed to list active profiles: HTTP ${response.status}`);
      return [];
    }

    const profiles = await response.json();
    return profiles as UserProxyProfile[];
  } catch (error) {
    console.error("Failed to list active profiles:", error);
    return [];
  }
}

/**
 * Display job creation result to user.
 *
 * This is a MINIMAL display function that enforces UX boundaries.
 * Real UI implementation should display this information appropriately.
 *
 * @param result - Job creation result
 * @returns Human-readable message
 */
export function displayJobCreationResult(result: JobCreationResult): string {
  if (isJobCreationSuccess(result)) {
    // Success - display confirmation
    // UI MUST NOT inspect JobSpec internals
    return "✓ Job created successfully";
  }

  if (isJobCreationFailure(result)) {
    // Failure - display error verbatim
    // UI MUST NOT transform or "improve" the error message
    const { error_type, error_message, user_profile_name } = result;

    switch (error_type) {
      case "compilation":
        return `✗ Compilation failed: ${error_message}`;

      case "validation":
        return `✗ Validation failed: ${error_message}`;

      case "deprecated":
        return `✗ Profile deprecated: ${error_message}`;

      case "schema":
        return `✗ Schema invalid: ${error_message}`;

      case "unexpected":
        return `✗ Unexpected error: ${error_message}`;

      default:
        return `✗ Error: ${error_message}`;
    }
  }

  return "✗ Unknown error occurred";
}

// =============================================================================
// FORBIDDEN PATTERNS (EXPLICITLY DOCUMENTED)
// =============================================================================
//
// The following patterns are FORBIDDEN in UI code:
//
// ❌ function inspectJobSpec(jobspec: any) { ... }
//    → UI must treat JobSpec as opaque
//
// ❌ function retryJobCreation(result: JobCreationFailure) { ... }
//    → UI must not retry automatically
//
// ❌ function modifyJobSpec(jobspec: any, changes: any) { ... }
//    → JobSpec is immutable
//
// ❌ function guessAlternativeProfile(error: string) { ... }
//    → UI must not infer alternatives
//
// ❌ function compileUserProfile(profile: UserProxyProfile) { ... }
//    → Compilation is backend responsibility
//
// ❌ function validateJobSpec(jobspec: any) { ... }
//    → Validation is backend responsibility
//
// ❌ function selectDefaultProfile() { ... }
//    → User must explicitly select profile
//
// ❌ function interpretCanonicalProfileId(id: string) { ... }
//    → Canonical profiles are opaque to UI
//
// ❌ function displayCodecDetails(jobspec: any) { ... }
//    → UI must not know about execution details
//
// ❌ function allowProfileEditing(profile: UserProxyProfile) { ... }
//    → Profiles are immutable, admin-managed
//
// If you are implementing any of the above, STOP.
// Read V2_PROFILE_SELECTION_AND_JOB_CREATION.md and
// V2_IMPLEMENTATION_MAPPING.md to understand why.
//
// =============================================================================
