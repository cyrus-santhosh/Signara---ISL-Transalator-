import logging
import os
import time
import uuid
from pathlib import Path

import requests
from gtts import gTTS
from gtts.tts import gTTSError


logger = logging.getLogger(__name__)
BACKEND_DIR = Path(__file__).resolve().parents[1]
AUDIO_RETENTION_SECONDS = 24 * 60 * 60
SUPPORTED_LANGUAGES = {
    "hi": "hi",
    "hindi": "hi",
    "kn": "kn",
    "kannada": "kn",
    "ta": "ta",
    "tamil": "ta",
    "en": "en",
    "english": "en",
}


class SpeechGenerationError(Exception):
    pass


def audio_directory() -> Path:
    configured_path = os.getenv("TTS_OUTPUT_DIR", "data/audio")
    path = Path(configured_path).expanduser()
    if not path.is_absolute():
        path = BACKEND_DIR / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def cleanup_expired_audio_files() -> None:
    directory = audio_directory().resolve()
    cutoff = time.time() - AUDIO_RETENTION_SECONDS
    for path in directory.iterdir():
        try:
            if path.suffix.lower() != ".mp3" or path.is_symlink() or not path.is_file():
                continue
            if path.stat().st_mtime < cutoff and path.resolve().parent == directory:
                path.unlink()
        except OSError as exc:
            logger.warning("Could not clean up expired audio file %s: %s", path.name, exc)


def generate_speech(text: str, target_lang: str = "hi") -> str:
    language = SUPPORTED_LANGUAGES.get(target_lang.lower())
    if language is None:
        raise ValueError(f"Unsupported speech language: {target_lang}")
    if not text.strip():
        raise ValueError("Speech text cannot be empty.")

    output_path = audio_directory() / f"{uuid.uuid4().hex}.mp3"
    try:
        gTTS(text=text, lang=language, slow=False).save(str(output_path))
    except (gTTSError, OSError, requests.RequestException) as exc:
        output_path.unlink(missing_ok=True)
        raise SpeechGenerationError("The speech service could not generate audio.") from exc

    if not output_path.is_file() or output_path.stat().st_size == 0:
        output_path.unlink(missing_ok=True)
        raise SpeechGenerationError("The speech service returned an empty audio file.")
    return str(output_path)
