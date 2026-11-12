import math
from typing import Any


LANDMARK_COUNTS = {"leftHand": 21, "rightHand": 21, "pose": 33}


def _finite_number(value: object) -> bool:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _validate_landmark_set(value: object, expected_count: int) -> list[dict[str, Any]] | None | bool:
    if value is None:
        return None
    if not isinstance(value, list) or len(value) != expected_count:
        return False

    normalized: list[dict[str, Any]] = []
    for landmark in value:
        if not isinstance(landmark, dict):
            return False
        if set(landmark) != {"x", "y", "z", "visibility", "presence"}:
            return False
        if any(not _finite_number(landmark[key]) for key in ("x", "y", "z")):
            return False
        for key in ("visibility", "presence"):
            measure = landmark[key]
            if measure is not None and (
                not _finite_number(measure) or not 0 <= measure <= 1
            ):
                return False
        normalized.append(
            {
                "x": float(landmark["x"]),
                "y": float(landmark["y"]),
                "z": float(landmark["z"]),
                "visibility": (
                    float(landmark["visibility"])
                    if landmark["visibility"] is not None
                    else None
                ),
                "presence": (
                    float(landmark["presence"])
                    if landmark["presence"] is not None
                    else None
                ),
            }
        )
    return normalized


def validate_keypoint_message(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict) or value.get("type") != "keypoints":
        return None

    timestamp = value.get("timestamp")
    frame_number = value.get("frameNumber")
    if (
        not isinstance(timestamp, int)
        or isinstance(timestamp, bool)
        or timestamp <= 0
        or not isinstance(frame_number, int)
        or isinstance(frame_number, bool)
        or frame_number < 0
    ):
        return None

    landmarks = value.get("landmarks")
    if not isinstance(landmarks, dict) or set(landmarks) != set(LANDMARK_COUNTS):
        return None

    validated_landmarks: dict[str, Any] = {}
    for name, count in LANDMARK_COUNTS.items():
        point_set = _validate_landmark_set(landmarks.get(name), count)
        if point_set is False:
            return None
        validated_landmarks[name] = point_set

    return {
        "type": "keypoints",
        "timestamp": timestamp,
        "frameNumber": frame_number,
        "landmarks": validated_landmarks,
    }
