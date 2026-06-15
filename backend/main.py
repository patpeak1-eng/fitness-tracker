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

# Allow all origins for now; lock this down to the deployed frontend in
# production. Bearer tokens travel in the Authorization header (not cookies),
# so credentialed CORS is not required and allow_credentials stays False —
# which is also what lets the "*" wildcard origin remain valid.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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
