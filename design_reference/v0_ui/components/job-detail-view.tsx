"use client"

import { useState } from "react"
import type { Job, JobStatus, ClipStatus } from "./proxx-app"
import { OperatorActionPanel } from "./operator-action-panel"

interface JobDetailViewProps {
  job: Job
  onBack: () => void
}

function StatusBadge({ status }: { status: JobStatus }) {
  const configs: Record<JobStatus, { color: string; bgColor: string; borderColor: string }> = {
    PENDING: {
      color: "text-slate-400",
      bgColor: "bg-slate-900",
      borderColor: "border-slate-700",
    },
    RUNNING: {
      color: "text-blue-400",
      bgColor: "bg-blue-950/30",
      borderColor: "border-blue-800/50",
    },
    RECOVERY_REQUIRED: {
      color: "text-amber-400",
      bgColor: "bg-amber-950/30",
      borderColor: "border-amber-700/50",
    },
    COMPLETED: {
      color: "text-emerald-400",
      bgColor: "bg-emerald-950/20",
      borderColor: "border-emerald-800/30",
    },
    FAILED: {
      color: "text-red-400",
      bgColor: "bg-red-950/30",
      borderColor: "border-red-700/50",
    },
    CANCELLED: {
      color: "text-slate-500",
      bgColor: "bg-slate-900",
      borderColor: "border-slate-700",
    },
  }

  const config = configs[status]

  return (
    <span
      className={`inline-flex items-center gap-2.5 px-4 py-2 rounded border font-mono text-sm tracking-wide ${config.color} ${config.bgColor} ${config.borderColor}`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          status === "RUNNING"
            ? "bg-blue-400 animate-pulse"
            : status === "RECOVERY_REQUIRED"
              ? "bg-amber-400"
              : status === "FAILED"
                ? "bg-red-400"
                : status === "COMPLETED"
                  ? "bg-emerald-400"
                  : "bg-slate-500"
        }`}
      />
      {status.replace("_", " ")}
    </span>
  )
}

function ClipStatusBadge({ status }: { status: ClipStatus }) {
  const configs: Record<ClipStatus, { color: string }> = {
    PENDING: { color: "text-slate-500" },
    PROCESSING: { color: "text-blue-400" },
    COMPLETED: { color: "text-emerald-500" },
    FAILED: { color: "text-red-400" },
  }

  return <span className={`font-mono text-xs ${configs[status].color}`}>{status}</span>
}

export function JobDetailView({ job, onBack }: JobDetailViewProps) {
  const [showActions, setShowActions] = useState(false)

  return (
    <div className="px-8 py-8">
      {/* Back Navigation */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors mb-8"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        BACK TO JOB LIST
      </button>

      <div className="mb-10 p-6 rounded-lg bg-slate-900/40 border border-slate-800/80 border-t-slate-700/50">
        <div className="flex items-start justify-between gap-8">
          <div>
            <p className="text-xs font-mono text-slate-500 mb-2">{job.id}</p>
            <h1 className="text-xl font-mono font-semibold text-slate-100 mb-4">{job.name}</h1>
            <StatusBadge status={job.status} />
          </div>
          <button
            onClick={() => setShowActions(true)}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm font-mono text-slate-200 transition-colors"
          >
            OPERATOR ACTIONS
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6 mb-10 p-6 rounded-lg bg-slate-900/30 border border-slate-800/60 border-t-slate-700/40">
        <MetadataField label="Preset Binding" value={job.preset} />
        <MetadataField label="Output Directory" value={job.outputDirectory} mono />
        <MetadataField
          label="Created"
          value={new Date(job.createdAt).toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })}
        />
        <MetadataField
          label="Progress"
          value={`${job.completedClips} completed · ${job.failedClips} failed · ${job.totalClips - job.completedClips - job.failedClips} remaining`}
        />
      </div>

      {/* Reports */}
      {Object.keys(job.reports).length > 0 && (
        <div className="mb-10 p-5 bg-slate-900/40 rounded-lg border border-slate-800/80 border-t-slate-700/50">
          <h3 className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Generated Reports
          </h3>
          <div className="flex gap-4">
            {job.reports.csv && <ReportLink href={job.reports.csv} label="CSV" />}
            {job.reports.json && <ReportLink href={job.reports.json} label="JSON" />}
            {job.reports.txt && <ReportLink href={job.reports.txt} label="TXT" />}
          </div>
        </div>
      )}

      {/* Clip Table */}
      <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <h3 className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider">Clip Manifest</h3>
          <span className="text-xs font-mono text-slate-600">
            Showing {job.clips.length} of {job.totalClips} clips
          </span>
        </div>

        <div className="rounded-lg border border-slate-800/80 border-t-slate-700/50 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900/80 border-b border-slate-800">
                <th className="text-left px-5 py-3 text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider">
                  Source Path
                </th>
                <th className="text-left px-5 py-3 text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider w-32">
                  Status
                </th>
                <th className="text-left px-5 py-3 text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider">
                  Failure Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {job.clips.map((clip, index) => (
                <tr
                  key={clip.id}
                  className={`border-b border-slate-800/50 ${
                    clip.status === "FAILED" ? "bg-red-950/10" : ""
                  } ${index % 2 === 0 ? "bg-slate-900/20" : ""}`}
                >
                  <td className="px-5 py-3.5">
                    <code className="text-xs font-mono text-slate-300 leading-relaxed">{clip.sourcePath}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    <ClipStatusBadge status={clip.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    {clip.failureReason ? (
                      <span className="text-xs font-mono text-red-400/80 leading-relaxed">{clip.failureReason}</span>
                    ) : (
                      <span className="text-xs font-mono text-slate-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Operator Action Panel Modal */}
      {showActions && <OperatorActionPanel job={job} onClose={() => setShowActions(false)} />}
    </div>
  )
}

function MetadataField({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-sm ${mono ? "font-mono" : ""} text-slate-300 break-all leading-relaxed`}>{value}</p>
    </div>
  )
}

function ReportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs font-mono text-slate-300 transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      {label}
    </a>
  )
}
