"""
Awaire Proxy backend service — Operator control + monitoring
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import health
from app.routes import control
from app.routes import preview
from app.routes import filesystem
from app.routes import v2_execute  # V2 Step 3: Thin Client JobSpec execution
from app.routes import readiness  # V2 Slice 6: First-run readiness check
from app.routes import playback  # Deterministic playback capability probe
from app.monitoring import server as monitoring
from app.jobs.registry import JobRegistry
from app.jobs.bindings import JobPresetBindingRegistry
from app.jobs.engine import JobEngine
from app.presets.registry import PresetRegistry
from app.persistence.manager import PersistenceManager
from app.execution.engine_registry import get_engine_registry
from app.services.ingestion import IngestionService

app = FastAPI(title="Awaire Proxy Backend", version="1.0.0")

# CORS middleware for frontend access (Phase 14, backend now on 8085)
app.add_middleware(
    CORSMiddleware,
    # Allow both localhost and 127.0.0.1 forms used by different dev workflows
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize persistence (Phase 12)
persistence = PersistenceManager(db_path="./awaire_proxy.db")

# Initialize registries (Phase 4-13)
app.state.job_registry = JobRegistry(persistence_manager=persistence)
app.state.binding_registry = JobPresetBindingRegistry(persistence_manager=persistence)
app.state.preset_registry = PresetRegistry()

# Phase 16: Initialize engine registry
app.state.engine_registry = get_engine_registry()

# Phase 6: Initialize settings preset store (immutable snapshots)
from app.presets.settings_presets import SettingsPresetStore
import logging
_startup_logger = logging.getLogger(__name__)

app.state.settings_preset_store = SettingsPresetStore()

# Trust Stabilisation: Log loaded presets at startup for diagnostics
_loaded_presets = app.state.settings_preset_store.list_presets()
_startup_logger.info(f"Settings presets loaded: {len(_loaded_presets)} presets")
for _p in _loaded_presets:
    _startup_logger.info(f"  - {_p.name} (id={_p.id}, scope={_p.scope})")

# Initialize job engine with all registries
app.state.job_engine = JobEngine(
    binding_registry=app.state.binding_registry,
    engine_registry=app.state.engine_registry,
)

# Initialize canonical ingestion service (single entry point for all job creation)
app.state.ingestion_service = IngestionService(
    job_registry=app.state.job_registry,
    job_engine=app.state.job_engine,
    binding_registry=app.state.binding_registry,
    preset_registry=app.state.preset_registry,
    engine_registry=app.state.engine_registry,
    settings_preset_store=app.state.settings_preset_store,  # Phase 6
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
app.include_router(preview.router)  # Alpha: Preview video generation
app.include_router(filesystem.router)  # Phase 4A: Directory navigator
app.include_router(v2_execute.router)  # V2 Step 3: Thin Client JobSpec execution
app.include_router(readiness.router)  # V2 Slice 6: First-run readiness check
app.include_router(playback.router)  # Deterministic playback capability probe


@app.get("/")
async def root():
    return {"service": "awaire-proxy-backend", "status": "running"}
