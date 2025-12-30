/**
 * Add Annotation Component
 * 
 * UI for creating operator annotations.
 * 
 * CONSTRAINTS:
 * - This is the ONLY write UI allowed
 * - No execution logic
 * - No status changes
 * - No inferred behaviour
 * - No retries
 * - Errors surfaced verbatim
 * - No mutation of job data
 */

import React, { useState } from "react";
import type { AddAnnotationProps, AddAnnotationFormState } from "./AddAnnotation.types";
import type { AnnotationDecision } from "../../data_adapter/types";
import "./AddAnnotation.css";

/**
 * Base URL for API endpoints.
 * Can be configured via environment variable.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * AddAnnotation component.
 * Provides form for creating operator annotations.
 */
export function AddAnnotation({ target_type, target_id, onAnnotationCreated }: AddAnnotationProps) {
  const [formState, setFormState] = useState<AddAnnotationFormState>({
    decision: "",
    note: "",
    isSubmitting: false,
    error: null,
  });

  /**
   * Handle decision selection change.
   */
  const handleDecisionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as AnnotationDecision | "";
    setFormState((prev) => ({ ...prev, decision: value, error: null }));
  };

  /**
   * Handle note input change.
   */
  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormState((prev) => ({ ...prev, note: e.target.value }));
  };

  /**
   * Clear form after successful submission.
   */
  const clearForm = () => {
    setFormState({
      decision: "",
      note: "",
      isSubmitting: false,
      error: null,
    });
  };

  /**
   * Handle form submission.
   * Calls operator annotation creation API.
   * No retries.
   * Shows errors verbatim.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation: decision is required
    if (!formState.decision) {
      setFormState((prev) => ({ ...prev, error: "Decision is required" }));
      return;
    }

    // Set submitting state
    setFormState((prev) => ({ ...prev, isSubmitting: true, error: null }));

    try {
      // Call annotation creation API
      const response = await fetch(`${API_BASE_URL}/api/v2/fabric/annotations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_type,
          target_id,
          decision: formState.decision,
          note: formState.note.trim() || null,
          operator_id: "operator_1", // TODO: Replace with actual operator ID from auth/session
        }),
      });

      if (!response.ok) {
        // Surface error verbatim
        const errorText = await response.text().catch(() => "");
        throw new Error(
          errorText || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      // Success - clear form and notify parent
      clearForm();
      if (onAnnotationCreated) {
        onAnnotationCreated();
      }
    } catch (error) {
      // Surface error verbatim (no retries)
      const errorMessage = error instanceof Error ? error.message : String(error);
      setFormState((prev) => ({
        ...prev,
        isSubmitting: false,
        error: errorMessage,
      }));
    }
  };

  return (
    <div className="add-annotation">
      <h3 className="add-annotation__title">Add Annotation</h3>
      
      <form className="add-annotation__form" onSubmit={handleSubmit}>
        <div className="add-annotation__field">
          <label htmlFor="decision-select" className="add-annotation__label">
            Decision *
          </label>
          <select
            id="decision-select"
            className="add-annotation__select"
            value={formState.decision}
            onChange={handleDecisionChange}
            disabled={formState.isSubmitting}
            required
          >
            <option value="">-- Select Decision --</option>
            <option value="retry">Retry</option>
            <option value="ignore">Ignore</option>
            <option value="escalate">Escalate</option>
          </select>
        </div>

        <div className="add-annotation__field">
          <label htmlFor="note-input" className="add-annotation__label">
            Note (optional)
          </label>
          <textarea
            id="note-input"
            className="add-annotation__textarea"
            value={formState.note}
            onChange={handleNoteChange}
            disabled={formState.isSubmitting}
            placeholder="Add optional note..."
            rows={3}
          />
        </div>

        {formState.error && (
          <div className="add-annotation__error" role="alert">
            {formState.error}
          </div>
        )}

        <button
          type="submit"
          className="add-annotation__submit"
          disabled={formState.isSubmitting || !formState.decision}
        >
          {formState.isSubmitting ? "Submitting..." : "Submit Annotation"}
        </button>
      </form>
    </div>
  );
}

export default AddAnnotation;
