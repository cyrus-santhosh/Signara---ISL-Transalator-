import os
import uuid
from pathlib import Path

import requests
from gtts import gTTS
from gtts.tts import gTTSError


BACKEND_DIR = Path(__file__).resolve().parents[1]
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
