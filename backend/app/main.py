"""
Proxx backend service — Operator control + monitoring
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import health
from app.routes import control
from app.monitoring import server as monitoring
from app.jobs.registry import JobRegistry
from app.jobs.bindings import JobPresetBindingRegistry
from app.jobs.engine import JobEngine
from app.presets.registry import PresetRegistry
from app.persistence.manager import PersistenceManager
from app.execution.engine_registry import get_engine_registry

app = FastAPI(title="Proxx Backend", version="0.1.0")

# CORS middleware for frontend access (Phase 14, backend now on 8085)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize persistence (Phase 12)
persistence = PersistenceManager(db_path="./proxx.db")

# Initialize registries (Phase 4-13)
app.state.job_registry = JobRegistry(persistence_manager=persistence)
app.state.binding_registry = JobPresetBindingRegistry(persistence_manager=persistence)
app.state.preset_registry = PresetRegistry()

# Phase 16: Initialize engine registry
app.state.engine_registry = get_engine_registry()

# Initialize job engine with all registries
app.state.job_engine = JobEngine(
    binding_registry=app.state.binding_registry,
    engine_registry=app.state.engine_registry,
)

# TEMPORARY: Add test preset for UI testing (Phase 15 stub)
# This allows the operator UI to create jobs without full preset infrastructure
from app.presets.models import CategoryPreset, GlobalPreset, PresetCategory

# Create minimal category presets for all required categories
test_category_presets = [
    CategoryPreset(id="test_codec", category=PresetCategory.CODEC, name="Test Codec"),
    CategoryPreset(id="test_scaling", category=PresetCategory.SCALING, name="Test Scaling"),
    CategoryPreset(id="test_watermark", category=PresetCategory.WATERMARK, name="Test Watermark"),
    CategoryPreset(id="test_naming", category=PresetCategory.NAMING, name="Test Naming"),
    CategoryPreset(id="test_folder", category=PresetCategory.FOLDER_OUTPUT, name="Test Folder"),
    CategoryPreset(id="test_exclusions", category=PresetCategory.EXCLUSIONS, name="Test Exclusions"),
    CategoryPreset(id="test_duplicates", category=PresetCategory.DUPLICATES, name="Test Duplicates"),
    CategoryPreset(id="test_queue", category=PresetCategory.QUEUE, name="Test Queue"),
    CategoryPreset(id="test_reporting", category=PresetCategory.REPORTING, name="Test Reporting"),
]

for preset in test_category_presets:
    app.state.preset_registry.add_category_preset(preset)

# Create a test global preset that references all test category presets
test_global_preset = GlobalPreset(
    id="test_preset_hd",
    name="Test Preset - HD Output",
    description="Temporary test preset for UI development",
    category_refs={
        PresetCategory.CODEC: "test_codec",
        PresetCategory.SCALING: "test_scaling",
        PresetCategory.WATERMARK: "test_watermark",
        PresetCategory.NAMING: "test_naming",
        PresetCategory.FOLDER_OUTPUT: "test_folder",
        PresetCategory.EXCLUSIONS: "test_exclusions",
        PresetCategory.DUPLICATES: "test_duplicates",
        PresetCategory.QUEUE: "test_queue",
        PresetCategory.REPORTING: "test_reporting",
    }
)

app.state.preset_registry.add_global_preset(test_global_preset)
# END TEMPORARY TEST PRESET

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
