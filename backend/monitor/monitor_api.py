"""
Forge Monitor - Read-Only HTTP API

Exposes job and worker state via HTTP endpoints.
This API is STRICTLY READ-ONLY.

No POST, PUT, PATCH, or DELETE endpoints are provided.
No job control, retry, or mutation capabilities exist.

Security Warning:
-----------------
By default, this API binds to localhost (127.0.0.1) only.
Exposing to LAN (0.0.0.0) carries security risks:
- Anyone on the network can view job data
- No authentication is implemented
- Sensitive paths may be exposed

Only expose to LAN on trusted networks.
"""

import os
from dataclasses import asdict
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .event_model import JobStatus
from .heartbeat import WorkerMonitor
from .state_store import StateStore, get_store

# Default binding configuration
DEFAULT_HOST = "127.0.0.1"  # Localhost only by default
DEFAULT_PORT = 9876

# Environment variable to enable LAN exposure (use with caution)
LAN_EXPOSURE_ENABLED = os.environ.get("FORGE_MONITOR_LAN", "false").lower() == "true"


def create_monitor_app(store: Optional[StateStore] = None) -> FastAPI:
    """
    Create the read-only monitoring API application.
    
    Args:
        store: State store to read from. Uses default if not provided.
        
    Returns:
        FastAPI application with read-only endpoints
    """
    store = store or get_store()
    worker_monitor = WorkerMonitor(store=store)
    
    app = FastAPI(
        title="Forge Monitor API",
        description=(
            "Read-only observability API for Forge job execution.\n\n"
            "**This API provides visibility only. No job control is possible.**\n\n"
            "- No POST endpoints\n"
            "- No PUT endpoints\n"
            "- No PATCH endpoints\n"
            "- No DELETE endpoints"
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )
    
    # CORS configuration for frontend access
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["GET"],  # Only GET allowed
        allow_headers=["*"],
    )
    
    # =========================================================================
    # READ-ONLY ENDPOINTS
    # =========================================================================
    
    @app.get("/")
    async def root():
        """API root with status information."""
        return {
            "service": "Forge Monitor",
            "version": "1.0.0",
            "mode": "read-only",
            "capabilities": [
                "View jobs",
                "View workers",
                "View events"
            ],
            "restrictions": [
                "No job creation",
                "No job modification",
                "No job deletion",
                "No retry capabilities"
            ]
        }
    
    @app.get("/health")
    async def health():
        """Health check endpoint."""
        return {"status": "ok", "mode": "read-only"}
    
    # -------------------------------------------------------------------------
    # JOB ENDPOINTS (Read-Only)
    # -------------------------------------------------------------------------
    
    @app.get("/jobs")
    async def list_jobs(
        status: Optional[str] = Query(None, description="Filter by status: queued, running, failed, completed"),
        worker_id: Optional[str] = Query(None, description="Filter by worker ID"),
        limit: int = Query(100, ge=1, le=1000, description="Maximum results")
    ):
        """
        List jobs with optional filtering.
        
        Returns job records in reverse chronological order.
        """
        try:
            status_filter = None
            if status:
                try:
                    status_filter = JobStatus(status)
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid status: {status}. Valid values: queued, running, failed, completed"
                    )
            
            jobs = store.get_jobs(
                status=status_filter,
                worker_id=worker_id,
                limit=limit
            )
            
            return {
                "count": len(jobs),
                "jobs": [job.to_dict() for job in jobs]
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/jobs/active")
    async def list_active_jobs():
        """List all currently active (non-terminal) jobs."""
        try:
            jobs = store.get_active_jobs()
            return {
                "count": len(jobs),
                "jobs": [job.to_dict() for job in jobs]
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/jobs/failed")
    async def list_failed_jobs(
        limit: int = Query(50, ge=1, le=500, description="Maximum results")
    ):
        """List failed jobs."""
        try:
            jobs = store.get_failed_jobs(limit=limit)
            return {
                "count": len(jobs),
                "jobs": [job.to_dict() for job in jobs]
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/jobs/completed")
    async def list_completed_jobs(
        limit: int = Query(50, ge=1, le=500, description="Maximum results")
    ):
        """List completed jobs."""
        try:
            jobs = store.get_completed_jobs(limit=limit)
            return {
                "count": len(jobs),
                "jobs": [job.to_dict() for job in jobs]
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/jobs/stats")
    async def job_statistics():
        """Get aggregate job statistics by status."""
        try:
            counts = store.get_job_counts()
            return {
                "queued": counts.get("queued", 0),
                "running": counts.get("running", 0),
                "failed": counts.get("failed", 0),
                "completed": counts.get("completed", 0),
                "total": sum(counts.values())
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/jobs/{job_id}")
    async def get_job(job_id: str):
        """
        Get details for a specific job.
        
        Returns the job record and its full event timeline.
        """
        try:
            job = store.get_job(job_id)
            if not job:
                raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
            
            events = store.get_events_for_job(job_id)
            
            return {
                "job": job.to_dict(),
                "events": [event.to_dict() for event in events],
                "event_count": len(events)
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    # -------------------------------------------------------------------------
    # WORKER ENDPOINTS (Read-Only)
    # -------------------------------------------------------------------------
    
    @app.get("/workers")
    async def list_workers():
        """
        List all known workers with current status.
        
        Worker status is derived from heartbeat timestamps:
        - idle: Online and not processing
        - busy: Online and processing a job
        - offline: No recent heartbeat
        """
        try:
            workers = worker_monitor.get_all_workers()
            
            # Group by status for convenience
            by_status = {
                "idle": [],
                "busy": [],
                "offline": []
            }
            
            for worker in workers:
                status = worker.status
                if status in by_status:
                    by_status[status].append(worker.to_dict())
                else:
                    by_status.setdefault(status, []).append(worker.to_dict())
            
            return {
                "count": len(workers),
                "by_status": by_status,
                "workers": [w.to_dict() for w in workers]
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/workers/{worker_id}")
    async def get_worker(worker_id: str):
        """Get details for a specific worker."""
        try:
            worker = worker_monitor.get_worker_status(worker_id)
            if not worker:
                raise HTTPException(status_code=404, detail=f"Worker not found: {worker_id}")
            
            return worker.to_dict()
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    # -------------------------------------------------------------------------
    # EVENT ENDPOINTS (Read-Only)
    # -------------------------------------------------------------------------
    
    @app.get("/events")
    async def list_events(
        job_id: Optional[str] = Query(None, description="Filter by job ID"),
        limit: int = Query(100, ge=1, le=1000, description="Maximum results")
    ):
        """
        List events, optionally filtered by job.
        
        Events are immutable records of what occurred.
        """
        try:
            if job_id:
                events = store.get_events_for_job(job_id)
            else:
                events = store.get_recent_events(limit=limit)
            
            return {
                "count": len(events),
                "events": [event.to_dict() for event in events]
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    return app


def get_bind_host() -> str:
    """
    Get the host to bind to based on configuration.
    
    Returns localhost by default. Set FORGE_MONITOR_LAN=true to expose to LAN.
    
    WARNING: LAN exposure has security implications.
    """
    if LAN_EXPOSURE_ENABLED:
        return "0.0.0.0"
    return DEFAULT_HOST


def run_monitor_server(
    host: Optional[str] = None,
    port: int = DEFAULT_PORT,
    store: Optional[StateStore] = None
) -> None:
    """
    Run the monitor API server.
    
    Args:
        host: Host to bind to. Defaults based on FORGE_MONITOR_LAN env var.
        port: Port to listen on.
        store: State store to use.
    """
    import uvicorn
    
    host = host or get_bind_host()
    app = create_monitor_app(store=store)
    
    print(f"Starting Forge Monitor API (read-only)")
    print(f"Binding to: {host}:{port}")
    
    if host == "0.0.0.0":
        print("")
        print("=" * 60)
        print("WARNING: LAN exposure is enabled.")
        print("Anyone on the network can view job data.")
        print("No authentication is configured.")
        print("=" * 60)
        print("")
    
    uvicorn.run(app, host=host, port=port)


# Convenience function to create app for ASGI servers
def create_app() -> FastAPI:
    """Create the monitor app for use with external ASGI servers."""
    return create_monitor_app()
