# PROXX — ARCHITECTURE OVERVIEW

This document describes the current technical structure of Proxx.
It is descriptive, not aspirational.

## High-Level Overview

Proxx is a desktop application composed of:

- An Electron-based desktop shell
- A React frontend
- A local Python backend service
- Local IPC over HTTP (localhost)

Resolve is not yet integrated at this stage.

## Components

### Frontend

- Electron provides the desktop runtime
- React renders the UI
- Frontend communicates with backend via HTTP
- No stateful business logic exists in the frontend yet

Location:
frontend/

markdown
Copy code

### Backend

- Python FastAPI service
- Exposes minimal HTTP endpoints
- No persistent state
- No background workers
- No job engine

Location:
backend/

markdown
Copy code

### IPC

- Localhost HTTP calls
- No authentication
- No WebSockets
- No streaming

This is sufficient for early development and scaffolding.

## Data & State

- No database
- No persistent state
- No job tracking

All logic is currently stateless.

## Execution Model

- Frontend launches backend separately
- Backend runs independently
- No lifecycle coupling beyond manual startup

## Out of Scope (Current)

The following systems are intentionally not implemented yet:

- Resolve integration
- Preset system
- Metadata extraction
- Job engine
- Watch folders
- Monitoring server
- Multi-node execution

These will be documented when they exist.

## Update Policy

This document should be updated:
- When a new subsystem is added
- When execution model changes
- When IPC model changes

It should not be updated for minor refactors.