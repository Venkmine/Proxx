"use client"

import type { Job, JobStatus } from "./proxx-app"

interface JobListViewProps {
  jobs: Job[]
  onSelectJob: (job: Job) => void
}

function StatusIndicator({ status }: { status: JobStatus }) {
  const configs: Record<JobStatus, { color: string; bgColor: string; label: string; glow: string }> = {
    PENDING: {
      color: "text-slate-400",
      bgColor: "bg-slate-800/60",
      label: "PENDING",
      glow: "",
    },
    RUNNING: {
      color: "text-blue-400",
      bgColor: "bg-blue-950/40",
      label: "RUNNING",
      glow: "shadow-[0_0_4px_rgba(59,130,246,0.2)]",
    },
    RECOVERY_REQUIRED: {
      color: "text-amber-400",
      bgColor: "bg-amber-950/35",
      label: "RECOVERY REQUIRED",
      glow: "shadow-[0_0_4px_rgba(245,158,11,0.25)]",
    },
    COMPLETED: {
      color: "text-emerald-500",
      bgColor: "bg-emerald-950/25",
      label: "COMPLETED",
      glow: "shadow-[0_0_4px_rgba(16,185,129,0.15)]",
    },
    FAILED: {
      color: "text-red-400",
      bgColor: "bg-red-950/35",
      label: "FAILED",
      glow: "shadow-[0_0_4px_rgba(239,68,68,0.25)]",
    },
    CANCELLED: {
      color: "text-slate-500",
      bgColor: "bg-slate-800/40",
      label: "CANCELLED",
      glow: "",
    },
  }

  const config = configs[status]

  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded font-mono text-xs tracking-wide ${config.color} ${config.bgColor} ${config.glow}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === "RUNNING"
            ? "bg-blue-400 animate-pulse"
            : status === "RECOVERY_REQUIRED"
              ? "bg-amber-400"
              : status === "FAILED"
                ? "bg-red-400"
                : status === "COMPLETED"
                  ? "bg-emerald-500"
                  : "bg-slate-500"
        }`}
      />
      {config.label}
    </span>
  )
}

function ProgressSummary({ job }: { job: Job }) {
  return (
    <div className="flex items-center gap-4 text-xs font-mono">
      <span className="text-slate-400">
        {job.completedClips} / {job.totalClips}
      </span>
      {job.failedClips > 0 && <span className="text-red-400 font-medium">{job.failedClips} FAILED</span>}
    </div>
  )
}

export function JobListView({ jobs, onSelectJob }: JobListViewProps) {
  const requiresAttention = jobs.filter((j) => j.status === "RECOVERY_REQUIRED" || j.status === "FAILED")
  const otherJobs = jobs.filter((j) => j.status !== "RECOVERY_REQUIRED" && j.status !== "FAILED")

  return (
    <div className="px-8 py-8">
      <div className="mb-8 p-6 rounded-lg bg-[#14161a]/90 border border-slate-700/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <h2 className="text-sm font-mono font-semibold text-slate-400 uppercase tracking-wider mb-1">Job Queue</h2>
        <p className="text-xs font-mono text-slate-500 leading-relaxed">
          {jobs.length} jobs · {jobs.filter((j) => j.status === "RUNNING").length} running · {requiresAttention.length}{" "}
          require attention
        </p>
      </div>

      {/* Attention Required Section */}
      {requiresAttention.length > 0 && (
        <div className="mb-10 p-4 -mx-4 rounded-lg bg-amber-500/[0.03]">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-amber-900/30 px-4">
            <div className="w-1 h-4 bg-amber-500 rounded-full" />
            <h3 className="text-xs font-mono font-semibold text-amber-400 uppercase tracking-wider">
              Operator Attention Required
            </h3>
            <span className="text-xs font-mono text-amber-500/70 ml-auto">
              {requiresAttention.length} {requiresAttention.length === 1 ? "job" : "jobs"}
            </span>
          </div>
          <div className="space-y-2 px-4">
            {requiresAttention.map((job) => (
              <JobRow key={job.id} job={job} onSelect={() => onSelectJob(job)} highlighted />
            ))}
          </div>
        </div>
      )}

      {/* All Other Jobs */}
      <div>
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-800">
          <h3 className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider">All Jobs</h3>
        </div>
        <div className="space-y-2">
          {otherJobs.map((job) => (
            <JobRow key={job.id} job={job} onSelect={() => onSelectJob(job)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function JobRow({
  job,
  onSelect,
  highlighted = false,
}: {
  job: Job
  onSelect: () => void
  highlighted?: boolean
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-5 py-4 rounded-lg border transition-colors ${
        highlighted
          ? "bg-[#1a1612]/70 border-amber-900/40 shadow-[0_0_12px_rgba(245,158,11,0.04),inset_0_1px_0_rgba(245,158,11,0.05)] hover:bg-[#1e1a15]/80 hover:border-amber-800/50"
          : "bg-[#101214]/60 border-slate-800/50 hover:bg-[#141618]/70 hover:border-slate-700/60"
      }`}
    >
      <div className="flex items-center justify-between gap-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-4 mb-2">
            <span className="text-xs font-mono text-slate-500">{job.id}</span>
            <StatusIndicator status={job.status} />
          </div>
          <h4 className="font-mono text-sm font-medium text-slate-200 truncate mb-1">{job.name}</h4>
          <p className="text-xs font-mono text-slate-400 truncate leading-relaxed">
            {job.preset} → {job.outputDirectory}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <ProgressSummary job={job} />
          <p className="text-xs font-mono text-slate-500 mt-1">
            {new Date(job.createdAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </p>
        </div>
      </div>
    </button>
  )
}
