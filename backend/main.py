"""FastAPI application entrypoint for the fitness tracker backend."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    assessments,
    auth,
    exercises,
    profile,
    templates,
    weight,
    workouts,
)

app = FastAPI(title="Fitness Tracker API", version="0.1.0")

# The HttpOnly session cookie is sent on cross-origin requests from the
# frontend (e.g. GET /api/auth/me with credentials), so CORS must allow
# credentials. Credentialed CORS forbids the "*" wildcard origin, so the
# allowed origins are listed explicitly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://fitness-tracker-production-54a4.up.railway.app",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(workouts.router)
app.include_router(assessments.router)
app.include_router(weight.router)
app.include_router(templates.router)
app.include_router(exercises.router)


@app.get("/health")
def health():
    return {"status": "ok"}
