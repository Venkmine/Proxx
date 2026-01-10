/**
 * Jobs List Screen
 * 
 * Read-only view of all jobs from Fabric.
 * 
 * CONSTRAINTS:
 * - No execution buttons (execution controls are injected via props)
 * - No retry logic
 * - No derived logic
 * - Data rendered verbatim
 * - Errors displayed exactly as received
 * 
 * Phase 9A: Added multi-select support for batch operations.
 * - Single click selects (or opens if multiSelect disabled)
 * - Shift+click for range selection
 * - Cmd/Ctrl+click for toggle selection
 * - Selection state managed via useMultiSelect hook
 */

import React, { useEffect, useState, useCallback } from "react";
import { fetchJobsView, DataAdapterError } from "../../data_adapter";
import type { JobView } from "../../data_adapter/types";
import type { JobsListProps, JobRowProps } from "./JobsList.types";
import { formatJobStatus, getStatusIcon } from "../../../ui_utils/statusMessages";
import { useMultiSelect } from "../../../hooks/useMultiSelect";
import "./JobsList.css";

/**
 * Extract display fields from job fabric_data.
 * No transformation - just safe access with fallbacks.
 */
function getJobDisplayFields(job: JobView) {
  const finalStatus = job.fabric_data?.final_status ?? "(unknown)";
  const engineUsed = job.fabric_data?._metadata?.engine_used ?? job.fabric_data?.engine_used ?? null;
  const resolveEdition = job.fabric_data?._metadata?.resolve_edition_detected ?? null;
  const resolveVersion = job.fabric_data?._metadata?.resolve_version_detected ?? null;
  const validationError = job.fabric_data?._metadata?.validation_error ?? null;

  return {
    job_id: job.job_id,
    final_status: finalStatus,
    final_status_formatted: formatJobStatus(finalStatus, {
      engineUsed,
      resolveEdition,
      resolveVersion,
      validationError,
    }),
    status_icon: getStatusIcon(finalStatus),
    proxy_profile: job.fabric_data?.proxy_profile ?? "(none)",
    engine_used: engineUsed ?? "(none)",
    created_at: job.fabric_data?.created_at ?? "(unknown)",
    annotation_count: job.annotations.length,
  };
}

/**
 * Individual job row component.
 * Phase 9A: Added selection state and optional controls.
 */
function JobRow({ job, onClick, isSelected = false, multiSelect = false, renderControls }: JobRowProps) {
  const fields = getJobDisplayFields(job);
  const status = fields.final_status.toLowerCase();
  const isHighPriority = status === "running" || status === "failed" || status === "blocked";
  const isComplete = status === "completed";
  const isQueued = status === "queued" || status === "pending";
  
  const handleClick = (e: React.MouseEvent) => {
    onClick(job.job_id, e);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      // Create a synthetic mouse event for keyboard activation
      onClick(job.job_id, { shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey } as React.MouseEvent);
    }
  };
  
  // Handle checkbox click separately to avoid nested interactive elements
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Toggle selection via synthetic mouse event with ctrl key to toggle
    onClick(job.job_id, { shiftKey: false, metaKey: true, ctrlKey: true } as React.MouseEvent);
  };
  
  // Compact status badge (just icon + state name)
  const statusBadgeText = fields.final_status.toUpperCase();
  
  // Build CSS classes
  const rowClasses = [
    "job-row",
    `job-row--${status}`,
    isHighPriority ? "job-row--priority" : "",
    isSelected ? "job-row--selected" : "",
    multiSelect ? "job-row--multiselect" : "",
  ].filter(Boolean).join(" ");
  
  // Use role="row" for table rows, aria-selected is valid for role="row" in a grid
  return (
    <tr
      className={rowClasses}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label={`Job ${fields.job_id}`}
      data-selected={isSelected || undefined}
      data-job-id={fields.job_id}
    >
      {/* Phase 9A: Selection checkbox when multiSelect enabled */}
      {multiSelect && (
        <td className="job-cell job-cell--checkbox">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            aria-label={`Select job ${fields.job_id}`}
            tabIndex={-1} // Row handles keyboard, checkbox is just visual
          />
        </td>
      )}
      <td className="job-cell job-cell--id" title={fields.job_id}>{fields.job_id}</td>
      <td className="job-cell job-cell--status" data-testid="job-status">
        <span className={`status-badge status-badge--${status}`}>
          <span className="status-badge__icon">{fields.status_icon}</span>
          <span className="status-badge__text">{statusBadgeText}</span>
        </span>
      </td>
      <td className="job-cell job-cell--engine" title={fields.engine_used}>
        {fields.engine_used !== "(none)" ? fields.engine_used : "—"}
      </td>
      <td className="job-cell job-cell--profile" title={fields.proxy_profile}>
        {fields.proxy_profile !== "(none)" ? fields.proxy_profile : "—"}
      </td>
      <td className="job-cell job-cell--annotations">{fields.annotation_count}</td>
      {/* Phase 9A: Per-row controls - always visible, never hover-only */}
      {renderControls && (
        <td className="job-cell job-cell--controls">
          {renderControls()}
        </td>
      )}
    </tr>
  );
}

/**
 * Jobs List component.
 * Fetches and displays all jobs in a table.
 * Phase 9A: Added multi-select and execution controls support.
 */
export function JobsList({ 
  onJobClick, 
  className = "", 
  multiSelect = false,
  onSelectionChange,
  renderJobControls,
}: JobsListProps) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  // Phase 9A: Multi-select state
  const {
    isSelected,
    handleClick: handleSelectionClick,
    selectedCount,
    selectAll,
    deselectAll,
    getSelectedIds,
    allSelected,
    hasSelection,
  } = useMultiSelect({
    items: jobs ?? [],
    getItemId: (job) => job.job_id,
  });
  
  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange && multiSelect) {
      onSelectionChange(getSelectedIds());
    }
  }, [getSelectedIds, onSelectionChange, multiSelect]);
  
  useEffect(() => {
    let cancelled = false;
    
    async function loadJobs() {
      try {
        setLoading(true);
        setError(null);
        
        const fetchedJobs = await fetchJobsView();
        
        if (!cancelled) {
          setJobs(fetchedJobs);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          // Surface error verbatim
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      }
    }
    
    loadJobs();
    
    return () => {
      cancelled = true;
    };
  }, []);
  
  const handleJobClick = useCallback((jobId: string, event: React.MouseEvent) => {
    if (multiSelect) {
      // In multi-select mode, handle selection
      handleSelectionClick(jobId, event);
    } else if (onJobClick) {
      // Otherwise navigate to job details
      onJobClick(jobId);
    }
  }, [multiSelect, handleSelectionClick, onJobClick]);
  
  // Loading state
  if (loading) {
    return (
      <div className={`jobs-list ${className}`}>
        <div className="jobs-list__loading" role="status" aria-live="polite">
          Loading jobs...
        </div>
      </div>
    );
  }
  
  // Error state - display error verbatim
  if (error) {
    return (
      <div className={`jobs-list ${className}`}>
        <div className="jobs-list__error" role="alert">
          <h3>Error Loading Jobs</h3>
          <p>{error.message}</p>
          {error instanceof DataAdapterError && error.statusCode && (
            <p className="error-details">HTTP Status: {error.statusCode}</p>
          )}
          {error instanceof DataAdapterError && error.response && (
            <pre className="error-response">{error.response}</pre>
          )}
        </div>
      </div>
    );
  }
  
  // Empty state
  if (!jobs || jobs.length === 0) {
    return (
      <div className={`jobs-list ${className}`}>
        <div className="jobs-list__empty">No jobs found</div>
      </div>
    );
  }
  
  // Table view
  return (
    <div className={`jobs-list ${className} ${multiSelect ? "jobs-list--multiselect" : ""}`}>
      {/* Phase 9A: Selection toolbar */}
      {multiSelect && (
        <div className="jobs-list__toolbar">
          <div className="jobs-list__selection-info">
            {hasSelection ? (
              <span>{selectedCount} job{selectedCount !== 1 ? 's' : ''} selected</span>
            ) : (
              <span>No jobs selected</span>
            )}
          </div>
          <div className="jobs-list__selection-actions">
            <button 
              type="button" 
              className="jobs-list__btn jobs-list__btn--select-all"
              onClick={selectAll}
              disabled={allSelected || !jobs?.length}
            >
              Select All
            </button>
            <button 
              type="button" 
              className="jobs-list__btn jobs-list__btn--deselect"
              onClick={deselectAll}
              disabled={!hasSelection}
            >
              Deselect All
            </button>
          </div>
        </div>
      )}
      <table className="jobs-table" data-multiselect={multiSelect || undefined}>
        <thead>
          <tr>
            {/* Phase 9A: Checkbox column header */}
            {multiSelect && (
              <th className="jobs-table__header jobs-table__header--checkbox">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => allSelected ? deselectAll() : selectAll()}
                  aria-label="Select all jobs"
                />
              </th>
            )}
            <th className="jobs-table__header jobs-table__header--id">ID</th>
            <th className="jobs-table__header jobs-table__header--status">State</th>
            <th className="jobs-table__header jobs-table__header--engine">Engine</th>
            <th className="jobs-table__header jobs-table__header--profile">Profile</th>
            <th className="jobs-table__header jobs-table__header--annotations">Notes</th>
            {/* Phase 9A: Controls column header */}
            {renderJobControls && (
              <th className="jobs-table__header jobs-table__header--controls">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const status = (job.fabric_data?.final_status ?? "(unknown)").toLowerCase();
            return (
              <JobRow 
                key={job.job_id} 
                job={job} 
                onClick={handleJobClick}
                isSelected={isSelected(job.job_id)}
                multiSelect={multiSelect}
                renderControls={renderJobControls ? () => renderJobControls(job.job_id, status) : undefined}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default JobsList;
