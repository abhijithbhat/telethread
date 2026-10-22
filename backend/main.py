"""
TeleThread Cloud Core - Main FastAPI Application Entrypoint

Wires together:
- Permissive CORS Middleware (allow_origins=["*"])
- Startup Database initialization and demo case seeding (init_db)
- REST API Cases Router (/api/cases/*)
- WebRTC WebSocket Signalling Router (/ws/consult/{case_id}/{role})
- /health Health Check Endpoint
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from .database import init_db
    from .routes_cases import router as cases_router
    from .signalling import router as signalling_router
except ImportError:
    from database import init_db
    from routes_cases import router as cases_router
    from signalling import router as signalling_router


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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount REST API routes and WebSocket signalling routes
app.include_router(cases_router)
app.include_router(signalling_router)


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
        "docs": "/docs",
    }
