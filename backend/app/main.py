import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

load_dotenv()

from . import auth, db
from .graph import PipelineError, run_pipeline
from .recognizer import recognize_keypoints, validate_keypoints
from .tts import SpeechGenerationError, audio_directory


def _cors_origins() -> list[str]:
    configured_origins = os.getenv("CORS_ORIGINS", "")
    if configured_origins.strip():
        return [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8443",
        "http://127.0.0.1:8443",
    ]


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.initialize_database()
    audio_directory()
    yield


app = FastAPI(
    title="ISL Recognition and Dialogue System",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


async def _json_object(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object.")
    return payload


def _required_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail=f"{key} must be a string.")
    return value


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "isl-recognition-dialogue"}


@app.post("/api/chat")
async def chat(request: Request) -> dict[str, str]:
    payload = await _json_object(request)
    glosses = payload.get("glosses")
    if not isinstance(glosses, list):
        raise HTTPException(status_code=400, detail="glosses must be a list of strings.")
    if len(glosses) > 100 or any(
        not isinstance(gloss, str) or not gloss.strip() or len(gloss) > 100
        for gloss in glosses
    ):
        raise HTTPException(
            status_code=400,
            detail="glosses must contain 1–100 non-empty strings of at most 100 characters.",
        )
    target_lang = payload.get("target_lang", "hi")
    if not isinstance(target_lang, str):
        raise HTTPException(status_code=400, detail="target_lang must be a string.")

    try:
        result = await run_in_threadpool(run_pipeline, glosses, target_lang)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PipelineError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except SpeechGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "sentence": result["sentence"],
        "replyText": result["translated_reply"],
        "replyOriginal": result["reply"],
        "audioUrl": f"/api/audio/{Path(result['audio_path']).name}",
    }


@app.post("/api/auth/register")
async def register(request: Request) -> dict[str, Any]:
    payload = await _json_object(request)
    email = _required_string(payload, "email")
    password = _required_string(payload, "password")
    try:
        return await run_in_threadpool(auth.register, email, password)
    except auth.AuthenticationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@app.post("/api/auth/login")
async def login(request: Request) -> dict[str, Any]:
    payload = await _json_object(request)
    email = _required_string(payload, "email")
    password = _required_string(payload, "password")
    try:
        return await run_in_threadpool(auth.login, email, password)
    except auth.AuthenticationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@app.get("/api/audio/{filename}")
def get_audio(filename: str) -> FileResponse:
    if Path(filename).name != filename or not filename.endswith(".mp3"):
        raise HTTPException(status_code=404, detail="Audio file not found.")
    path = (audio_directory() / filename).resolve()
    if path.parent != audio_directory().resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found.")
    return FileResponse(path, media_type="audio/mpeg")


@app.websocket("/ws/sign")
async def sign_websocket(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin and origin not in _cors_origins():
        await websocket.close(code=1008, reason="Origin is not allowed.")
        return

    await websocket.accept()
    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except ValueError:
                await websocket.send_json({"error": "Message must be valid JSON."})
                continue
            if not isinstance(payload, dict) or payload.get("type") != "keypoints":
                await websocket.send_json({"error": 'Expected {"type":"keypoints","keypoints": [...]}.'})
                continue

            keypoints = validate_keypoints(payload.get("keypoints"))
            if keypoints is None:
                await websocket.send_json({"error": "keypoints must be a valid coordinate list."})
                continue
            await websocket.send_json(recognize_keypoints(keypoints))
    except WebSocketDisconnect:
        return
