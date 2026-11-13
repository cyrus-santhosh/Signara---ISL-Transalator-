import asyncio
import logging
import os
import json
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

from . import auth, db
from .graph import PipelineError, groq_is_configured, run_pipeline, run_translation
from .model_service import LiveRecognitionSession, recognition_model
from .recognizer import validate_keypoint_message
from .tts import (
    SpeechGenerationError,
    audio_directory,
    cleanup_expired_audio_files,
    generate_speech,
)

logger = logging.getLogger(__name__)
_translation_tasks: dict[str, asyncio.Task[dict[str, Any]]] = {}
_translation_tasks_lock = asyncio.Lock()
TARGET_LANGUAGES = {"en", "hi", "kn"}

DATASET_LABELS = {
    "hello_how_are_you",
    "i_need_help",
    "i_need_to_meet_the_doctor",
    "no_sign",
}
MAX_RECORDING_FRAMES = 60
MIN_RECORDING_SPAN_MS = 2_500
MAX_RECORDING_SPAN_MS = 5_000


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
    cleanup_expired_audio_files()
    recognition_model.load()
    if groq_is_configured():
        logger.info("Groq API key is configured.")
    else:
        logger.warning(
            "Groq API key is missing. Conversation requests will return a configuration error."
        )
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


@app.get("/api/recognition/model-status")
def recognition_model_status() -> dict[str, Any]:
    return recognition_model.status()


def _dataset_directory() -> Path:
    return Path(__file__).resolve().parents[1] / "dataset"


def _dataset_counts() -> dict[str, int]:
    root = _dataset_directory()
    return {
        label: sum(1 for _ in (root / label).glob("*.json"))
        for label in sorted(DATASET_LABELS)
    }


@app.get("/api/dataset/counts")
def dataset_counts() -> dict[str, int]:
    return _dataset_counts()


@app.post("/api/dataset/recording")
async def save_dataset_recording(request: Request) -> dict[str, Any]:
    payload = await _json_object(request)
    label = payload.get("label")
    if not isinstance(label, str) or label not in DATASET_LABELS:
        raise HTTPException(
            status_code=400,
            detail=(
                "label must be hello_how_are_you, i_need_help, "
                "i_need_to_meet_the_doctor, or no_sign."
            ),
        )

    recording_id_value = payload.get("recording_id")
    if not isinstance(recording_id_value, str):
        raise HTTPException(status_code=400, detail="recording_id must be a UUID.")
    try:
        recording_id = str(UUID(recording_id_value))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="recording_id must be a UUID.") from exc

    timestamp = payload.get("timestamp")
    frame_count = payload.get("frame_count")
    sequence = payload.get("sequence")
    if (
        not isinstance(timestamp, int)
        or isinstance(timestamp, bool)
        or timestamp <= 0
    ):
        raise HTTPException(status_code=400, detail="timestamp must be a positive integer.")
    if not isinstance(sequence, list) or not sequence:
        raise HTTPException(status_code=400, detail="Recording sequence must not be empty.")
    if (
        not isinstance(frame_count, int)
        or isinstance(frame_count, bool)
        or frame_count != len(sequence)
        or frame_count > MAX_RECORDING_FRAMES
    ):
        raise HTTPException(
            status_code=400,
            detail=f"frame_count must match a sequence of 1–{MAX_RECORDING_FRAMES} frames.",
        )

    validated_sequence = []
    previous_frame_number = -1
    previous_frame_timestamp = timestamp
    for frame_payload in sequence:
        frame = validate_keypoint_message(frame_payload)
        if frame is None:
            raise HTTPException(
                status_code=400,
                detail="Every sequence item must be a valid keypoints frame.",
            )
        if (
            frame["frameNumber"] <= previous_frame_number
            or frame["timestamp"] < previous_frame_timestamp
        ):
            raise HTTPException(
                status_code=400,
                detail="Sequence frame numbers and timestamps must be ordered.",
            )
        validated_sequence.append(frame)
        previous_frame_number = frame["frameNumber"]
        previous_frame_timestamp = frame["timestamp"]

    recording_span = (
        validated_sequence[-1]["timestamp"] - validated_sequence[0]["timestamp"]
    )
    if not MIN_RECORDING_SPAN_MS <= recording_span <= MAX_RECORDING_SPAN_MS:
        raise HTTPException(
            status_code=400,
            detail="Recording must contain landmark frames spanning approximately 3-5 seconds.",
        )

    directory = _dataset_directory() / label
    destination = directory / f"{recording_id}.json"
    created_destination = False
    try:
        directory.mkdir(parents=True, exist_ok=True)
        recording = {
            "label": label,
            "timestamp": timestamp,
            "frame_count": frame_count,
            "sequence": validated_sequence,
        }
        with destination.open("x", encoding="utf-8") as output:
            created_destination = True
            json.dump(recording, output, separators=(",", ":"), allow_nan=False)
    except FileExistsError:
        try:
            with destination.open("r", encoding="utf-8") as existing_file:
                existing_recording = json.load(existing_file)
        except (OSError, ValueError) as exc:
            raise HTTPException(
                status_code=409,
                detail="This recording ID already exists and could not be verified.",
            ) from exc
        if existing_recording != recording:
            raise HTTPException(
                status_code=409,
                detail="This recording ID was already used for a different sample.",
            )
    except (OSError, TypeError, ValueError) as exc:
        if created_destination:
            try:
                destination.unlink(missing_ok=True)
            except OSError:
                logger.exception("Could not remove incomplete dataset recording %s", destination)
        raise HTTPException(status_code=500, detail="Could not save the dataset recording.") from exc

    return {
        "saved": True,
        "label": label,
        "filename": destination.name,
        "counts": _dataset_counts(),
    }


@app.get("/api/dataset/export.zip")
def export_dataset() -> FileResponse:
    root = _dataset_directory()
    archive_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(prefix="signara-dataset-", suffix=".zip", delete=False) as archive:
            archive_path = archive.name
        with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
            for label in sorted(DATASET_LABELS):
                for recording in sorted((root / label).glob("*.json")):
                    archive.write(recording, f"dataset/{label}/{recording.name}")
    except OSError as exc:
        if archive_path and os.path.exists(archive_path):
            os.unlink(archive_path)
        raise HTTPException(status_code=500, detail="Could not export the dataset.") from exc

    return FileResponse(
        archive_path,
        media_type="application/zip",
        filename="signara-dataset.zip",
        background=BackgroundTask(os.unlink, archive_path),
    )


@app.post("/api/chat")
async def chat(request: Request) -> dict[str, Any]:
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
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.error_code, "message": str(exc)},
        ) from exc
    except SpeechGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    audio_path = result.get("audio_path")
    audio_file = Path(audio_path) if audio_path else None
    audio_url = (
        f"/api/audio/{audio_file.name}"
        if audio_file and audio_file.is_file() and audio_file.stat().st_size > 0
        else None
    )
    return {
        "original_text": " ".join(gloss.strip() for gloss in glosses),
        "translated_text": result["translated_text"],
        "target_language": target_lang,
        "audio_url": audio_url,
        "audio_error": result["audio_error"],
    }


async def _cached_translation(
    event_id: str,
    original_text: str,
    target_language: str,
    generate_audio: bool,
) -> dict[str, Any]:
    async with _translation_tasks_lock:
        task = _translation_tasks.get(event_id)
        if task is None:
            task = asyncio.create_task(
                run_in_threadpool(
                    run_translation,
                    original_text,
                    target_language,
                    generate_audio,
                )
            )
            _translation_tasks[event_id] = task
    try:
        result = await asyncio.shield(task)
    except Exception:
        async with _translation_tasks_lock:
            if _translation_tasks.get(event_id) is task:
                _translation_tasks.pop(event_id, None)
        raise

    async with _translation_tasks_lock:
        while len(_translation_tasks) > 256:
            oldest_id, oldest_task = next(iter(_translation_tasks.items()))
            if not oldest_task.done():
                break
            _translation_tasks.pop(oldest_id, None)
    return result


@app.get("/api/conversation/status")
def conversation_status() -> dict[str, Any]:
    return {
        "groq_configured": groq_is_configured(),
        "model": os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
        "mode": "translation_only",
    }


@app.post("/api/conversation")
async def translate_recognition(request: Request) -> dict[str, Any]:
    payload = await _json_object(request)
    original_text = payload.get("original_text")
    target_language = payload.get("target_language", "en")
    event_id = payload.get("event_id")
    recognition_label = payload.get("recognition_label")
    generate_audio_value = payload.get("generate_audio", False)

    if recognition_label is not None and recognition_label not in DATASET_LABELS:
        raise HTTPException(status_code=400, detail="recognition_label is not a supported phrase class.")
    normalized_text = (
        original_text.strip().lower().replace(" ", "_").replace("-", "_")
        if isinstance(original_text, str)
        else ""
    )
    if recognition_label == "no_sign" or normalized_text == "no_sign":
        raise HTTPException(status_code=422, detail="A no_sign recognition cannot be translated.")
    if (
        not isinstance(original_text, str)
        or not original_text.strip()
        or len(original_text) > 500
    ):
        raise HTTPException(status_code=400, detail="original_text must be a non-empty string of at most 500 characters.")
    if not isinstance(target_language, str) or target_language not in TARGET_LANGUAGES:
        raise HTTPException(status_code=400, detail="target_language must be one of: en, hi, kn.")
    if not isinstance(event_id, str) or not event_id.strip() or len(event_id) > 100:
        raise HTTPException(status_code=400, detail="event_id must be a non-empty string of at most 100 characters.")
    if not isinstance(generate_audio_value, bool):
        raise HTTPException(status_code=400, detail="generate_audio must be a boolean.")

    try:
        result = await _cached_translation(
            event_id.strip(),
            original_text.strip(),
            target_language,
            generate_audio_value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PipelineError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.error_code, "message": str(exc)},
        ) from exc

    audio_path = result.get("audio_path")
    audio_url = None
    if audio_path:
        audio_file = Path(audio_path)
        if audio_file.is_file() and audio_file.stat().st_size > 0:
            audio_url = f"/api/audio/{audio_file.name}"
    return {
        "original_text": result["original_text"],
        "translated_text": result["translated_text"],
        "target_language": result["target_language"],
        "audio_url": audio_url,
        "audio_error": result["audio_error"],
    }


@app.post("/api/speech")
async def speech(request: Request) -> dict[str, str]:
    payload = await _json_object(request)
    text = payload.get("text")
    target_language = payload.get("target_language")
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=400, detail="text must be a non-empty string.")
    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="text must be at most 1000 characters.")
    if not isinstance(target_language, str) or target_language not in TARGET_LANGUAGES:
        raise HTTPException(status_code=400, detail="target_language must be one of: en, hi, kn.")
    try:
        audio_path = await run_in_threadpool(generate_speech, text.strip(), target_language)
    except (SpeechGenerationError, OSError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    audio_file = Path(audio_path)
    if not audio_file.is_file() or audio_file.stat().st_size == 0:
        raise HTTPException(status_code=502, detail="Speech generation returned no audio file.")
    return {"audio_url": f"/api/audio/{audio_file.name}"}


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
    recognition_session = LiveRecognitionSession(recognition_model)
    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except ValueError:
                await websocket.send_json(
                    {
                        "type": "error",
                        "status": "invalid_message",
                        "message": "Message must be valid JSON.",
                    }
                )
                continue
            frame = validate_keypoint_message(payload)
            if frame is None:
                await websocket.send_json(
                    {
                        "type": "error",
                        "status": "invalid_message",
                        "message": "Expected a keypoints message with a valid timestamp, frame number, and landmark sets.",
                    }
                )
                continue
            await websocket.send_json(recognition_session.process(frame))
    except WebSocketDisconnect:
        return
