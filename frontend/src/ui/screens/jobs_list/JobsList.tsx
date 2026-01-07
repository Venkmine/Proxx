/**
 * Jobs List Screen
 * 
 * Read-only view of all jobs from Fabric.
 * 
 * CONSTRAINTS:
 * - No execution buttons
 * - No retry logic
 * - No derived logic
 * - Data rendered verbatim
 * - Errors displayed exactly as received
 */

import React, { useEffect, useState } from "react";
import { fetchJobsView, DataAdapterError } from "../../data_adapter";
import type { JobView } from "../../data_adapter/types";
import type { JobsListProps, JobRowProps } from "./JobsList.types";
import { formatJobStatus, getStatusIcon } from "../../../ui_utils/statusMessages";
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
 */
function JobRow({ job, onClick }: JobRowProps) {
  const fields = getJobDisplayFields(job);
  const status = fields.final_status.toLowerCase();
  const isHighPriority = status === "running" || status === "failed" || status === "blocked";
  const isComplete = status === "completed";
  const isQueued = status === "queued" || status === "pending";
  
  const handleClick = () => {
    onClick(job.job_id);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(job.job_id);
    }
  };
  
  // Compact status badge (just icon + state name)
  const statusBadgeText = fields.final_status.toUpperCase();
  
  return (
    <tr
      className={`job-row job-row--${status} ${isHighPriority ? "job-row--priority" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View job ${fields.job_id}`}
      data-job-id={fields.job_id}
    >
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
    </tr>
  );
}

/**
 * Jobs List component.
 * Fetches and displays all jobs in a table.
 */
export function JobsList({ onJobClick, className = "" }: JobsListProps) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
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
  
  const handleJobClick = (jobId: string) => {
    if (onJobClick) {
      onJobClick(jobId);
    }
  };
  
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
    <div className={`jobs-list ${className}`}>
      <table className="jobs-table">
        <thead>
          <tr>
            <th className="jobs-table__header jobs-table__header--id">ID</th>
            <th className="jobs-table__header jobs-table__header--status">State</th>
            <th className="jobs-table__header jobs-table__header--engine">Engine</th>
            <th className="jobs-table__header jobs-table__header--profile">Profile</th>
            <th className="jobs-table__header jobs-table__header--annotations">Notes</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <JobRow key={job.job_id} job={job} onClick={handleJobClick} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default JobsList;
