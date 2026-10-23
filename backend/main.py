"""
TeleThread Cloud Core - Main FastAPI Application Entrypoint

Wires together:
- Permissive CORS Middleware (allow_origins=["*"])
- Startup Database initialization and demo case seeding (init_db)
- REST API Cases Router (/api/cases/*)
- WebRTC WebSocket Signalling Router (/ws/consult/{case_id}/{role})
- /health Health Check Endpoint
"""

import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Auto-load .env file from backend or root directory if present
for _env_candidate in [Path(".env"), Path("backend/.env"), Path(__file__).parent / ".env", Path(__file__).parent.parent / ".env"]:
    if _env_candidate.is_file():
        try:
            with open(_env_candidate, "r", encoding="utf-8") as _f:
                for _line in _f:
                    _line = _line.strip()
                    if _line and not _line.startswith("#") and "=" in _line:
                        _k, _v = _line.split("=", 1)
                        _k = _k.strip()
                        _v = _v.strip().strip('"').strip("'")
                        if _k and _k not in os.environ:
                            os.environ[_k] = _v
        except Exception:
            pass

try:
    from .database import init_db
    from .routes_cases import router as cases_router
    from .signalling import router as signalling_router
    from .routes_agent import router as agent_router
except ImportError:
    from database import init_db
    from routes_cases import router as cases_router
    from signalling import router as signalling_router
    from routes_agent import router as agent_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables and seed baseline demo cases if empty
    init_db()
    yield


app = FastAPI(
    title="TeleThread Cloud Core",
    description="Sub-District 4-Tier Adaptive Telemedicine Engine with Offline Store-and-Forward Outbox",
    version="1.0.0",
    lifespan=lifespan,
)

# Permissive CORS for local Vite development and multi-origin deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Mount REST API routes and WebSocket signalling routes
app.include_router(cases_router)
app.include_router(signalling_router)
app.include_router(agent_router)


@app.get("/health")
def health_check():
    """Health check endpoint for Render / monitoring services."""
    return {"status": "ok", "service": "TeleThread Cloud Core"}


@app.get("/")
def root_redirect():
    """Root metadata response."""
    return {
        "service": "TeleThread Cloud Core",
        "health": "/health",
        "api_cases": "/api/cases",
        "api_agent": "/api/agent",
        "docs": "/docs",
    }
