"""GradeGuide AI - FastAPI application entry point.

Start (from the backend folder, with the virtual environment active):
    uvicorn main:app --reload --port 8000
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from database.seed import init_db
from routers import assessment, professor, student, system

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
log = logging.getLogger("gradeguide")
BASE = Path(__file__).resolve().parent
FRONTEND_DIST = BASE.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    log.info("GradeGuide AI ready - AI mode: %s", "LIVE (OpenAI %s)" % settings.OPENAI_MODEL
             if settings.live_ai_available else "SIMULATED (no OpenAI key - offline rule-based simulator)")
    yield


app = FastAPI(title="GradeGuide AI", version="1.0.0", lifespan=lifespan,
              description="Rubric-based formative feedback with integrity safeguards.")
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(Exception)
async def unhandled(_request: Request, exc: Exception):
    log.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on the server. Please try again."})


app.include_router(system.router)
app.include_router(student.router)
app.include_router(assessment.router)
app.include_router(professor.router)
app.mount("/api/templates", StaticFiles(directory=BASE / "static" / "templates"), name="templates")

# Optional: serve the production build of the frontend from the same port (after `npm run build`).
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        target = FRONTEND_DIST / path
        if path and target.is_file() and FRONTEND_DIST in target.resolve().parents:
            return FileResponse(target)
        return FileResponse(FRONTEND_DIST / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
