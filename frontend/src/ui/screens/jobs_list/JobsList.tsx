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
  const hasError = fields.final_status === "failed" || fields.final_status === "error";
  
  const handleClick = () => {
    onClick(job.job_id);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(job.job_id);
    }
  };
  
  return (
    <tr
      className={`job-row ${hasError ? "job-row--error" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View job ${fields.job_id}`}
    >
      <td className="job-cell job-cell--id">{fields.job_id}</td>
      <td className="job-cell job-cell--status">
        <span className="status-icon">{fields.status_icon}</span>
        {fields.final_status_formatted}
      </td>
      <td className="job-cell job-cell--profile">{fields.proxy_profile}</td>
      <td className="job-cell job-cell--engine">{fields.engine_used}</td>
      <td className="job-cell job-cell--created">{fields.created_at}</td>
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
            <th className="jobs-table__header">Job ID</th>
            <th className="jobs-table__header">Status</th>
            <th className="jobs-table__header">Proxy Profile</th>
            <th className="jobs-table__header">Engine</th>
            <th className="jobs-table__header">Created</th>
            <th className="jobs-table__header">Annotations</th>
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
