"""
Proxx backend service — FastAPI scaffolding only
"""

from fastapi import FastAPI
from app.routes import health

app = FastAPI(title="Proxx Backend", version="0.1.0")

app.include_router(health.router)


@app.get("/")
async def root():
    return {"service": "proxx-backend", "status": "running"}
