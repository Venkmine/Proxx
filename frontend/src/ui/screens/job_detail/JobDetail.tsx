/**
 * Job Detail Screen
 * 
 * Read-only view of a single job's details from Fabric.
 * 
 * CONSTRAINTS:
 * - No execution buttons
 * - No retry logic
 * - No derived logic
 * - Data rendered verbatim
 * - Errors displayed exactly as received
 */

import React, { useEffect, useState } from "react";
import {
  fetchJobsView,
  fetchSnapshotsView,
  DataAdapterError,
} from "../../data_adapter";
import type { JobView, SnapshotView, Annotation } from "../../data_adapter/types";
import type { JobDetailProps, AnnotationsListProps } from "./JobDetail.types";
import { AddAnnotation } from "../../components/annotations/AddAnnotation";
import "./JobDetail.css";

/**
 * Format a date string for display.
 * No transformation - just safe formatting.
 */
function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "(not set)";
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr; // Return as-is if parsing fails
  }
}

/**
 * Annotations list component.
 * Displays operator annotations in read-only mode.
 */
function AnnotationsList({ job }: AnnotationsListProps) {
  if (job.annotations.length === 0) {
    return (
      <div className="annotations-list__empty">
        No operator annotations for this job.
      </div>
    );
  }

  return (
    <div className="annotations-list">
      {job.annotations.map((annotation: Annotation, index: number) => (
        <div key={annotation.annotation_id} className="annotation-item">
          <div className="annotation-item__header">
            <span className="annotation-item__number">#{index + 1}</span>
            <span className={`annotation-item__decision annotation-item__decision--${annotation.decision}`}>
              {annotation.decision}
            </span>
          </div>
          <div className="annotation-item__meta">
            <span>Operator: {annotation.operator_id}</span>
            <span>Created: {formatDate(annotation.created_at)}</span>
          </div>
          {annotation.note && (
            <div className="annotation-item__note">
              <strong>Note:</strong> {annotation.note}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Job Detail component.
 * Fetches and displays detailed information about a specific job.
 */
export function JobDetail({ jobId, onNavigateBack, className = "" }: JobDetailProps) {
  const [loadingJob, setLoadingJob] = useState(true);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);
  const [job, setJob] = useState<JobView | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotView[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadJobData() {
      try {
        setLoadingJob(true);
        setError(null);

        // Fetch all jobs and find the one we need
        // Note: In production, we'd have a dedicated endpoint for single job
        const jobs = await fetchJobsView();
        const foundJob = jobs.find((j) => j.job_id === jobId);

        if (!cancelled) {
          if (!foundJob) {
            setError(new Error(`Job not found: ${jobId}`));
            setLoadingJob(false);
            return;
          }

          setJob(foundJob);
          setLoadingJob(false);

          // Load snapshots
          setLoadingSnapshots(true);
          try {
            const jobSnapshots = await fetchSnapshotsView(jobId);
            if (!cancelled) {
              setSnapshots(jobSnapshots);
              setLoadingSnapshots(false);
            }
          } catch (snapshotError) {
            if (!cancelled) {
              // Snapshots are optional - don't fail the whole view
              console.error("Failed to load snapshots:", snapshotError);
              setSnapshots([]);
              setLoadingSnapshots(false);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          // Surface error verbatim
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoadingJob(false);
          setLoadingSnapshots(false);
        }
      }
    }

    loadJobData();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  /**
   * Refresh annotations list after successful annotation creation.
   * Re-fetches the job to get updated annotations.
   */
  const handleAnnotationCreated = async () => {
    try {
      // Re-fetch jobs to get updated annotations
      const jobs = await fetchJobsView();
      const foundJob = jobs.find((j) => j.job_id === jobId);
      
      if (foundJob) {
        setJob(foundJob);
      }
    } catch (err) {
      // Log error but don't fail the whole view
      console.error("Failed to refresh annotations:", err);
    }
  };

  // Loading state
  if (loadingJob) {
    return (
      <div className={`job-detail ${className}`}>
        <div className="job-detail__loading" role="status" aria-live="polite">
          Loading job details...
        </div>
      </div>
    );
  }

  // Error state - display error verbatim
  if (error) {
    return (
      <div className={`job-detail ${className}`}>
        {onNavigateBack && (
          <button className="job-detail__back-button" onClick={onNavigateBack}>
            ← Back to Jobs List
          </button>
        )}
        <div className="job-detail__error" role="alert">
          <h3>Error Loading Job</h3>
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

  // No job found
  if (!job) {
    return (
      <div className={`job-detail ${className}`}>
        {onNavigateBack && (
          <button className="job-detail__back-button" onClick={onNavigateBack}>
            ← Back to Jobs List
          </button>
        )}
        <div className="job-detail__empty">Job not found: {jobId}</div>
      </div>
    );
  }

  // Extract display fields
  const finalStatus = job.fabric_data?.final_status ?? "(unknown)";
  const engineUsed = job.fabric_data?.engine_used ?? "(none)";
  const proxyProfileUsed = job.fabric_data?.proxy_profile ?? "(none)";
  const createdAt = job.fabric_data?.created_at;
  const completedAt = job.fabric_data?.completed_at;
  const validationStage = job.fabric_data?.validation_stage;
  const errorMessage = job.fabric_data?.error_message;

  const isFailed = finalStatus === "failed" || finalStatus === "error";

  return (
    <div className={`job-detail ${className}`}>
      {onNavigateBack && (
        <button className="job-detail__back-button" onClick={onNavigateBack}>
          ← Back to Jobs List
        </button>
      )}

      <div className="job-detail__header">
        <h1 className="job-detail__title">Job Details</h1>
        <div className={`job-detail__status job-detail__status--${finalStatus}`}>
          {isFailed && <span className="status-icon">⚠️</span>}
          {finalStatus}
        </div>
      </div>

      <div className="job-detail__content">
        <section className="job-detail__section">
          <h2 className="job-detail__section-title">Job Information</h2>
          <dl className="job-detail__info-list">
            <dt>Job ID</dt>
            <dd className="job-detail__job-id">{job.job_id}</dd>

            <dt>Status</dt>
            <dd>{finalStatus}</dd>

            <dt>Engine Used</dt>
            <dd>{engineUsed}</dd>

            <dt>Proxy Profile</dt>
            <dd>{proxyProfileUsed}</dd>

            <dt>Created At</dt>
            <dd>{formatDate(createdAt)}</dd>

            <dt>Completed At</dt>
            <dd>{formatDate(completedAt)}</dd>
          </dl>
        </section>

        {isFailed && (
          <section className="job-detail__section job-detail__section--error">
            <h2 className="job-detail__section-title">Failure Details</h2>
            <dl className="job-detail__info-list">
              {validationStage && (
                <>
                  <dt>Validation Stage</dt>
                  <dd className="job-detail__validation-stage">{validationStage}</dd>
                </>
              )}

              {errorMessage && (
                <>
                  <dt>Error Message</dt>
                  <dd className="job-detail__error-message">
                    <pre>{errorMessage}</pre>
                  </dd>
                </>
              )}
            </dl>
          </section>
        )}

        <section className="job-detail__section">
          <h2 className="job-detail__section-title">
            Operator Annotations ({job.annotations.length})
          </h2>
          <AnnotationsList job={job} />
          <AddAnnotation
            target_type="job"
            target_id={job.job_id}
            onAnnotationCreated={handleAnnotationCreated}
          />
        </section>

        {snapshots !== null && (
          <section className="job-detail__section">
            <h2 className="job-detail__section-title">
              Snapshots ({snapshots.length})
            </h2>
            {loadingSnapshots ? (
              <div className="job-detail__loading-inline">Loading snapshots...</div>
            ) : snapshots.length === 0 ? (
              <div className="job-detail__empty-inline">No snapshots for this job.</div>
            ) : (
              <div className="snapshots-list">
                {snapshots.map((snapshot) => (
                  <div key={snapshot.snapshot_id} className="snapshot-item">
                    <div className="snapshot-item__header">
                      <span className="snapshot-item__id">{snapshot.snapshot_id}</span>
                      <span className="snapshot-item__annotations">
                        {snapshot.annotations.length} annotation(s)
                      </span>
                    </div>
                    {snapshot.fabric_data?.timestamp && (
                      <div className="snapshot-item__meta">
                        {formatDate(snapshot.fabric_data.timestamp)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="job-detail__section">
          <h2 className="job-detail__section-title">Complete Fabric Data</h2>
          <pre className="job-detail__fabric-data">
            {JSON.stringify(job.fabric_data, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}

export default JobDetail;
