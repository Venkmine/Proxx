"use client"

import { useState } from "react"
import { JobListView } from "./job-list-view"
import { JobDetailView } from "./job-detail-view"
import { ProxxHeader } from "./proxx-header"

export type JobStatus = "PENDING" | "RUNNING" | "RECOVERY_REQUIRED" | "COMPLETED" | "FAILED" | "CANCELLED"

export type ClipStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"

export interface Clip {
  id: string
  sourcePath: string
  status: ClipStatus
  failureReason?: string
}

export interface Job {
  id: string
  name: string
  status: JobStatus
  preset: string
  outputDirectory: string
  totalClips: number
  completedClips: number
  failedClips: number
  clips: Clip[]
  createdAt: string
  reports: {
    csv?: string
    json?: string
    txt?: string
  }
}

const mockJobs: Job[] = [
  {
    id: "JOB-2024-001847",
    name: "Netflix_S3E07_Final_Conform",
    status: "RUNNING",
    preset: "ProRes422HQ_UHD",
    outputDirectory: "/vol/renders/netflix/s3e07/",
    totalClips: 847,
    completedClips: 312,
    failedClips: 0,
    createdAt: "2024-12-15T23:14:00Z",
    clips: [
      { id: "c001", sourcePath: "/vol/source/netflix/s3e07/shot_001.exr", status: "COMPLETED" },
      { id: "c002", sourcePath: "/vol/source/netflix/s3e07/shot_002.exr", status: "COMPLETED" },
      { id: "c003", sourcePath: "/vol/source/netflix/s3e07/shot_003.exr", status: "PROCESSING" },
      { id: "c004", sourcePath: "/vol/source/netflix/s3e07/shot_004.exr", status: "PENDING" },
      { id: "c005", sourcePath: "/vol/source/netflix/s3e07/shot_005.exr", status: "PENDING" },
    ],
    reports: {},
  },
  {
    id: "JOB-2024-001846",
    name: "HBO_Documentary_Archive_Transcode",
    status: "RECOVERY_REQUIRED",
    preset: "DNxHR_SQ_1080p",
    outputDirectory: "/vol/renders/hbo/doc_archive/",
    totalClips: 2341,
    completedClips: 1847,
    failedClips: 12,
    createdAt: "2024-12-15T21:30:00Z",
    clips: [
      { id: "c101", sourcePath: "/vol/source/hbo/archive/reel_001.mxf", status: "COMPLETED" },
      { id: "c102", sourcePath: "/vol/source/hbo/archive/reel_002.mxf", status: "COMPLETED" },
      {
        id: "c103",
        sourcePath: "/vol/source/hbo/archive/reel_003.mxf",
        status: "FAILED",
        failureReason: "Source file corrupted at frame 4821",
      },
      {
        id: "c104",
        sourcePath: "/vol/source/hbo/archive/reel_004.mxf",
        status: "FAILED",
        failureReason: "Codec mismatch: expected XDCAM, found DNxHD",
      },
      { id: "c105", sourcePath: "/vol/source/hbo/archive/reel_005.mxf", status: "PENDING" },
    ],
    reports: {
      csv: "/reports/JOB-2024-001846_partial.csv",
      txt: "/reports/JOB-2024-001846_errors.txt",
    },
  },
  {
    id: "JOB-2024-001845",
    name: "Commercial_Toyota_V3_Proxies",
    status: "FAILED",
    preset: "H264_Proxy_720p",
    outputDirectory: "/vol/renders/toyota/v3_proxies/",
    totalClips: 156,
    completedClips: 89,
    failedClips: 67,
    createdAt: "2024-12-15T19:45:00Z",
    clips: [
      { id: "c201", sourcePath: "/vol/source/toyota/v3/A001_C001.R3D", status: "COMPLETED" },
      {
        id: "c202",
        sourcePath: "/vol/source/toyota/v3/A001_C002.R3D",
        status: "FAILED",
        failureReason: "RED SDK license expired",
      },
      {
        id: "c203",
        sourcePath: "/vol/source/toyota/v3/A001_C003.R3D",
        status: "FAILED",
        failureReason: "RED SDK license expired",
      },
      {
        id: "c204",
        sourcePath: "/vol/source/toyota/v3/A001_C004.R3D",
        status: "FAILED",
        failureReason: "RED SDK license expired",
      },
    ],
    reports: {
      csv: "/reports/JOB-2024-001845.csv",
      json: "/reports/JOB-2024-001845.json",
      txt: "/reports/JOB-2024-001845_errors.txt",
    },
  },
  {
    id: "JOB-2024-001844",
    name: "Feature_Film_DI_Dailies",
    status: "COMPLETED",
    preset: "ProRes4444_XQ_4K",
    outputDirectory: "/vol/renders/feature/dailies/day_47/",
    totalClips: 423,
    completedClips: 423,
    failedClips: 0,
    createdAt: "2024-12-15T02:00:00Z",
    clips: [
      { id: "c301", sourcePath: "/vol/source/feature/day47/A001_C001.ari", status: "COMPLETED" },
      { id: "c302", sourcePath: "/vol/source/feature/day47/A001_C002.ari", status: "COMPLETED" },
      { id: "c303", sourcePath: "/vol/source/feature/day47/A001_C003.ari", status: "COMPLETED" },
    ],
    reports: {
      csv: "/reports/JOB-2024-001844.csv",
      json: "/reports/JOB-2024-001844.json",
      txt: "/reports/JOB-2024-001844.txt",
    },
  },
  {
    id: "JOB-2024-001843",
    name: "Music_Video_BTS_Backup",
    status: "PENDING",
    preset: "H265_Archive_4K",
    outputDirectory: "/vol/renders/music/bts_backup/",
    totalClips: 89,
    completedClips: 0,
    failedClips: 0,
    createdAt: "2024-12-16T00:30:00Z",
    clips: [
      { id: "c401", sourcePath: "/vol/source/music/bts/cam_a_001.mov", status: "PENDING" },
      { id: "c402", sourcePath: "/vol/source/music/bts/cam_a_002.mov", status: "PENDING" },
      { id: "c403", sourcePath: "/vol/source/music/bts/cam_b_001.mov", status: "PENDING" },
    ],
    reports: {},
  },
  {
    id: "JOB-2024-001842",
    name: "Broadcast_News_Archive_Q4",
    status: "CANCELLED",
    preset: "XDCAM_HD422",
    outputDirectory: "/vol/renders/broadcast/archive_q4/",
    totalClips: 1200,
    completedClips: 456,
    failedClips: 0,
    createdAt: "2024-12-14T18:00:00Z",
    clips: [
      { id: "c501", sourcePath: "/vol/source/broadcast/q4/news_001.mxf", status: "COMPLETED" },
      { id: "c502", sourcePath: "/vol/source/broadcast/q4/news_002.mxf", status: "COMPLETED" },
    ],
    reports: {
      csv: "/reports/JOB-2024-001842_partial.csv",
    },
  },
]

export function ProxxApp() {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)

  return (
    <div className="min-h-screen text-neutral-100 relative">
      <div
        className="fixed inset-0 -z-20"
        style={{
          background: `
            linear-gradient(
              135deg, 
              #2a3444 0%, 
              #232b38 20%,
              #1c242f 40%, 
              #151c26 60%,
              #10161e 80%,
              #0c1118 100%
            )
          `,
        }}
      />
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 150% 120% at 50% 50%, transparent 50%, rgba(0,0,0,0.35) 100%)",
        }}
      />
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 120% 80% at 0% 0%, rgba(60,80,110,0.18) 0%, transparent 60%)",
        }}
      />
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 50% 40% at 100% 100%, rgba(0,0,0,0.25) 0%, transparent 50%)",
        }}
      />
      <ProxxHeader />
      <main className="max-w-[1600px] mx-auto relative">
        {selectedJob ? (
          <JobDetailView job={selectedJob} onBack={() => setSelectedJob(null)} />
        ) : (
          <JobListView jobs={mockJobs} onSelectJob={setSelectedJob} />
        )}
      </main>
    </div>
  )
}
