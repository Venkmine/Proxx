"use client"

import type React from "react"

import { useState } from "react"
import type { Job } from "./proxx-app"

interface OperatorActionPanelProps {
  job: Job
  onClose: () => void
}

type ActionType = "resume" | "retry" | "cancel" | "rebind" | null

function getActionAccent(action: Exclude<ActionType, null>): string {
  switch (action) {
    case "resume":
      return "border-l-amber-500"
    case "retry":
      return "border-l-orange-500"
    case "cancel":
      return "border-l-red-500"
    case "rebind":
      return "border-l-blue-500"
  }
}

export function OperatorActionPanel({ job, onClose }: OperatorActionPanelProps) {
  const [confirmingAction, setConfirmingAction] = useState<ActionType>(null)

  const canResume = job.status === "RECOVERY_REQUIRED"
  const canRetry = job.failedClips > 0
  const canCancel = job.status === "RUNNING" || job.status === "PENDING" || job.status === "RECOVERY_REQUIRED"
  const canRebind = job.status !== "RUNNING"

  const handleAction = (action: ActionType) => {
    setConfirmingAction(action)
  }

  const confirmAction = () => {
    // In a real implementation, this would trigger the actual action
    console.log(`Executing action: ${confirmingAction} on job ${job.id}`)
    setConfirmingAction(null)
    onClose()
  }

  const actionLabels: Record<
    Exclude<ActionType, null>,
    { title: string; description: string; destructive: boolean }
  > = {
    resume: {
      title: "Resume Job",
      description: `This will resume processing of ${job.totalClips - job.completedClips - job.failedClips} remaining clips. The job will continue from where it stopped.`,
      destructive: false,
    },
    retry: {
      title: "Retry Failed Clips",
      description: `This will retry ${job.failedClips} failed clips. Existing successful outputs will not be affected.`,
      destructive: false,
    },
    cancel: {
      title: "Cancel Job",
      description:
        "This will stop all processing immediately. Completed clips will be preserved. This action cannot be undone.",
      destructive: true,
    },
    rebind: {
      title: "Rebind Preset",
      description:
        "This will change the encoding preset for this job. The job must be restarted to apply the new preset.",
      destructive: false,
    },
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
      <div className="w-full max-w-xl bg-[#0a0c0e] border border-neutral-800 rounded-lg shadow-2xl">
        <div className="px-6 py-5 border-b border-neutral-800 bg-[#08090b] rounded-t-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-mono font-semibold text-neutral-100 uppercase tracking-wider">
                Operator Actions
              </h2>
              <p className="text-xs font-mono text-neutral-500 mt-1">{job.id}</p>
            </div>
            <button onClick={onClose} className="p-2 text-neutral-500 hover:text-neutral-300 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Actions or Confirmation */}
        {confirmingAction ? (
          <div className="p-6">
            <div
              className={`p-5 rounded-lg border ${
                actionLabels[confirmingAction].destructive
                  ? "bg-red-950/20 border-red-900/50"
                  : "bg-neutral-900/50 border-neutral-700"
              }`}
            >
              <h3
                className={`text-sm font-mono font-semibold mb-3 ${
                  actionLabels[confirmingAction].destructive ? "text-red-400" : "text-neutral-200"
                }`}
              >
                Confirm: {actionLabels[confirmingAction].title}
              </h3>
              <p className="text-xs font-mono text-neutral-400 leading-relaxed mb-6">
                {actionLabels[confirmingAction].description}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmingAction(null)}
                  className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-xs font-mono text-neutral-300 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={confirmAction}
                  className={`flex-1 px-4 py-2.5 rounded text-xs font-mono font-semibold transition-colors ${
                    actionLabels[confirmingAction].destructive
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                >
                  CONFIRM {actionLabels[confirmingAction].title.toUpperCase()}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-3">
            <ActionButton
              actionType="resume"
              label="Resume Job"
              description="Continue processing remaining clips"
              disabled={!canResume}
              onClick={() => handleAction("resume")}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                  />
                </svg>
              }
            />
            <ActionButton
              actionType="retry"
              label="Retry Failed Clips"
              description={`Reprocess ${job.failedClips} failed clips`}
              disabled={!canRetry}
              onClick={() => handleAction("retry")}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
              }
            />
            <ActionButton
              actionType="rebind"
              label="Rebind Preset"
              description="Change encoding preset for this job"
              disabled={!canRebind}
              onClick={() => handleAction("rebind")}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
            <div className="pt-3 mt-3 border-t border-neutral-800">
              <ActionButton
                actionType="cancel"
                label="Cancel Job"
                description="Stop all processing immediately"
                disabled={!canCancel}
                onClick={() => handleAction("cancel")}
                destructive
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                }
              />
            </div>
          </div>
        )}

        {/* Footer Note */}
        <div className="px-6 py-4 bg-[#08090b] border-t border-neutral-800 rounded-b-lg">
          <p className="text-xs font-mono text-neutral-600 text-center leading-relaxed">
            All actions are logged and require explicit confirmation
          </p>
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  actionType,
  label,
  description,
  disabled,
  destructive = false,
  onClick,
  icon,
}: {
  actionType: Exclude<ActionType, null>
  label: string
  description: string
  disabled: boolean
  destructive?: boolean
  onClick: () => void
  icon: React.ReactNode
}) {
  const accentClass = getActionAccent(actionType)

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-5 rounded-lg border-l-4 border transition-all ${
        disabled
          ? "opacity-40 cursor-not-allowed bg-neutral-900/30 border-neutral-800 border-l-neutral-700"
          : destructive
            ? `bg-red-950/10 border-red-900/30 hover:bg-red-950/20 hover:border-red-800/50 ${accentClass}`
            : `bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 ${accentClass}`
      }`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex-shrink-0 ${
            disabled ? "text-neutral-600" : destructive ? "text-red-400" : "text-neutral-400"
          }`}
        >
          {icon}
        </div>
        <div>
          <p
            className={`text-sm font-mono font-semibold ${
              disabled ? "text-neutral-500 line-through" : destructive ? "text-red-400" : "text-neutral-200"
            }`}
          >
            {label}
          </p>
          <p className="text-xs font-mono text-neutral-500 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
    </button>
  )
}
