import itertools
import math
import threading


_MOCK_GLOSSES = itertools.cycle(("HELLO", "WATER", "HELP", "THANK YOU", "YES"))
_GLOSS_LOCK = threading.Lock()


def recognize_keypoints(keypoints: list[list[float]]) -> dict[str, str | float]:
    """Return a deterministic mock result until a trained ISL model is available."""
    if not keypoints:
        return {"gloss": "READY", "confidence": 0.0}

    with _GLOSS_LOCK:
        gloss = next(_MOCK_GLOSSES)
    return {"gloss": gloss, "confidence": 0.92}


def validate_keypoints(value: object) -> list[list[float]] | None:
    if not isinstance(value, list) or len(value) > 500:
        return None

    normalized: list[list[float]] = []
    for point in value:
        if not isinstance(point, list) or len(point) not in (2, 3, 4):
            return None
        numeric_point: list[float] = []
        for coordinate in point:
            if isinstance(coordinate, bool) or not isinstance(coordinate, (int, float)):
                return None
            try:
                number = float(coordinate)
            except OverflowError:
                return None
            if not math.isfinite(number):
                return None
            numeric_point.append(number)
        normalized.append(numeric_point)
    return normalized
