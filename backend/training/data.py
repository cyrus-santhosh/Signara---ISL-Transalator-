import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any


LABELS = ("hello_how_are_you", "i_need_help", "no_sign")
LANDMARK_GROUPS = (("leftHand", 21), ("rightHand", 21), ("pose", 33))
CHANNELS_PER_LANDMARK = 6
INPUT_SIZE = 75 * CHANNELS_PER_LANDMARK

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
DEFAULT_DATA_DIR = (
    BACKEND_DIR / "dataset"
    if (BACKEND_DIR / "dataset").exists()
    else PROJECT_DIR / "dataset"
)


@dataclass(frozen=True)
class Recording:
    path: Path
    label: str | None
    features: list[list[float]]
    valid_channels: list[list[bool]]


def _finite_number(value: Any, description: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{description} must be a finite number.")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{description} must be a finite number.")
    return number


def _frame_features(frame: Any, frame_index: int) -> tuple[list[float], list[bool]]:
    if not isinstance(frame, dict) or frame.get("type") != "keypoints":
        raise ValueError(f"Frame {frame_index} is not a keypoints frame.")
    _finite_number(frame.get("timestamp"), f"Frame {frame_index} timestamp")
    frame_number = frame.get("frameNumber")
    if isinstance(frame_number, bool) or not isinstance(frame_number, int) or frame_number < 0:
        raise ValueError(f"Frame {frame_index} frameNumber must be a non-negative integer.")

    landmarks = frame.get("landmarks")
    if not isinstance(landmarks, dict):
        raise ValueError(f"Frame {frame_index} landmarks must be an object.")

    values: list[float] = []
    valid: list[bool] = []
    for group_name, expected_count in LANDMARK_GROUPS:
        group = landmarks.get(group_name)
        if group is None:
            values.extend([0.0] * (expected_count * CHANNELS_PER_LANDMARK))
            valid.extend([False, False, False, False, False, True] * expected_count)
            continue
        if not isinstance(group, list) or len(group) != expected_count:
            raise ValueError(
                f"Frame {frame_index} {group_name} must be null or contain "
                f"exactly {expected_count} landmarks."
            )

        for point_index, point in enumerate(group):
            context = f"Frame {frame_index} {group_name}[{point_index}]"
            if not isinstance(point, dict):
                raise ValueError(f"{context} must be an object.")
            point_values: list[float] = []
            point_valid: list[bool] = []
            for coordinate in ("x", "y", "z"):
                point_values.append(_finite_number(point.get(coordinate), f"{context}.{coordinate}"))
                point_valid.append(True)
            for measure in ("visibility", "presence"):
                value = point.get(measure)
                if value is None:
                    point_values.append(0.0)
                    point_valid.append(False)
                else:
                    point_values.append(_finite_number(value, f"{context}.{measure}"))
                    point_valid.append(True)
            point_values.append(1.0)
            point_valid.append(True)
            values.extend(point_values)
            valid.extend(point_valid)

    if len(values) != INPUT_SIZE:
        raise ValueError(f"Frame {frame_index} has {len(values)} features; expected {INPUT_SIZE}.")
    return values, valid


def recording_from_keypoint_frames(frames: list[dict[str, Any]]) -> Recording:
    if not isinstance(frames, list) or not frames:
        raise ValueError("A live sequence must contain keypoint frames.")
    features: list[list[float]] = []
    valid_channels: list[list[bool]] = []
    previous_timestamp = -math.inf
    previous_frame_number = -1
    for index, frame in enumerate(frames):
        row, row_valid = _frame_features(frame, index)
        timestamp = float(frame["timestamp"])
        frame_number = frame["frameNumber"]
        if timestamp < previous_timestamp or frame_number <= previous_frame_number:
            raise ValueError("Live sequence timestamps and frame numbers must be ordered.")
        previous_timestamp = timestamp
        previous_frame_number = frame_number
        features.append(row)
        valid_channels.append(row_valid)
    return Recording(Path("<live-sequence>"), None, features, valid_channels)


def load_recording(path: Path, expected_label: str | None = None) -> Recording:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not read JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError("Recording root must be a JSON object.")

    label = payload.get("label")
    if expected_label is not None and label != expected_label:
        raise ValueError(f"Stored label {label!r} does not match directory label {expected_label!r}.")
    if label is not None and label not in LABELS:
        raise ValueError(f"Unsupported recording label {label!r}.")

    sequence = payload.get("sequence")
    if not isinstance(sequence, list) or not sequence:
        raise ValueError("Recording sequence must be a non-empty list.")
    frame_count = payload.get("frame_count")
    if frame_count is not None and frame_count != len(sequence):
        raise ValueError("Stored frame_count does not match sequence length.")

    features: list[list[float]] = []
    valid_channels: list[list[bool]] = []
    previous_timestamp = -math.inf
    previous_frame_number = -1
    for index, frame in enumerate(sequence):
        row, row_valid = _frame_features(frame, index)
        timestamp = float(frame["timestamp"])
        frame_number = frame["frameNumber"]
        if timestamp < previous_timestamp or frame_number <= previous_frame_number:
            raise ValueError("Frame timestamps and frame numbers must be ordered.")
        previous_timestamp = timestamp
        previous_frame_number = frame_number
        features.append(row)
        valid_channels.append(row_valid)

    return Recording(path, label, features, valid_channels)


def load_dataset(data_dir: Path = DEFAULT_DATA_DIR) -> tuple[list[Recording], list[str]]:
    recordings: list[Recording] = []
    errors: list[str] = []
    for label in LABELS:
        label_dir = data_dir / label
        if not label_dir.is_dir():
            errors.append(f"{label_dir}: directory is missing.")
            continue
        for path in sorted(label_dir.glob("*.json")):
            try:
                recordings.append(load_recording(path, expected_label=label))
            except ValueError as exc:
                errors.append(f"{path}: {exc}")
    return recordings, errors


def stratified_split(
    recordings: list[Recording], validation_fraction: float, seed: int
) -> tuple[list[Recording], list[Recording]]:
    import random

    if not 0.0 < validation_fraction < 1.0:
        raise ValueError("validation_fraction must be between 0 and 1.")
    randomizer = random.Random(seed)
    train: list[Recording] = []
    validation: list[Recording] = []
    for label in LABELS:
        group = [recording for recording in recordings if recording.label == label]
        if len(group) < 2:
            raise ValueError(f"At least two usable recordings are required for class {label!r}.")
        randomizer.shuffle(group)
        validation_count = max(1, round(len(group) * validation_fraction))
        validation_count = min(validation_count, len(group) - 1)
        validation.extend(group[:validation_count])
        train.extend(group[validation_count:])
    randomizer.shuffle(train)
    randomizer.shuffle(validation)
    return train, validation


def fit_standardization(
    recordings: list[Recording],
) -> tuple[list[float], list[float]]:
    sums = [0.0] * 5
    sums_squared = [0.0] * 5
    counts = [0] * 5
    for recording in recordings:
        for row, valid in zip(recording.features, recording.valid_channels):
            for channel in range(5):
                if valid[channel]:
                    value = row[channel]
                    sums[channel] += value
                    sums_squared[channel] += value * value
                    counts[channel] += 1
    means = [
        sums[channel] / counts[channel] if counts[channel] else 0.0
        for channel in range(5)
    ]
    stds = []
    for channel in range(5):
        if counts[channel] == 0:
            stds.append(1.0)
            continue
        variance = sums_squared[channel] / counts[channel] - means[channel] ** 2
        standard_deviation = math.sqrt(max(variance, 0.0))
        stds.append(max(standard_deviation, 0.01) if standard_deviation > 1e-6 else 1.0)
    return means, stds


def normalize_recording(
    recording: Recording, means: list[float], stds: list[float]
) -> list[list[float]]:
    normalized: list[list[float]] = []
    for row, valid in zip(recording.features, recording.valid_channels):
        output = [0.0] * INPUT_SIZE
        for offset in range(0, INPUT_SIZE, CHANNELS_PER_LANDMARK):
            for channel in range(5):
                index = offset + channel
                if valid[index]:
                    output[index] = (row[index] - means[channel]) / stds[channel]
            output[offset + 5] = row[offset + 5]
        normalized.append(output)
    return normalized
