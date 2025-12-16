"""
Proxx backend service — FastAPI scaffolding only
"""

from fastapi import FastAPI
from app.routes import health
from app.monitoring import server as monitoring
from app.jobs.registry import JobRegistry

app = FastAPI(title="Proxx Backend", version="0.1.0")

# Initialize job registry for monitoring access
app.state.job_registry = JobRegistry()

# Include routers
app.include_router(health.router)
app.include_router(monitoring.router)


@app.get("/")
async def root():
    return {"service": "proxx-backend", "status": "running"}
