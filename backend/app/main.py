"""
Proxx backend service — Operator control + monitoring
"""

from fastapi import FastAPI
from app.routes import health
from app.routes import control
from app.monitoring import server as monitoring
from app.jobs.registry import JobRegistry
from app.jobs.bindings import JobPresetBindingRegistry
from app.jobs.engine import JobEngine
from app.presets.registry import PresetRegistry
from app.persistence.manager import PersistenceManager

app = FastAPI(title="Proxx Backend", version="0.1.0")

# Initialize persistence (Phase 12)
persistence = PersistenceManager(db_path="./proxx.db")

# Initialize registries (Phase 4-13)
app.state.job_registry = JobRegistry(persistence_manager=persistence)
app.state.binding_registry = JobPresetBindingRegistry(persistence_manager=persistence)
app.state.preset_registry = PresetRegistry()
app.state.job_engine = JobEngine(
    job_registry=app.state.job_registry,
    binding_registry=app.state.binding_registry
)

# Load persisted state
app.state.job_registry.load_all_jobs()
app.state.binding_registry.load_all_bindings()

# Include routers
app.include_router(health.router)
app.include_router(monitoring.router)
app.include_router(control.router)  # Phase 14


@app.get("/")
async def root():
    return {"service": "proxx-backend", "status": "running"}
