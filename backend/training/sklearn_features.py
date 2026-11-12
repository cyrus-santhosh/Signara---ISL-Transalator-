import numpy as np

from training.data import INPUT_SIZE, Recording, normalize_recording


TEMPORAL_SEGMENTS = 4
FEATURE_METHOD = "per-segment mean and standard deviation"


def extract_temporal_features(
    recording: Recording, means: list[float], stds: list[float]
) -> np.ndarray:
    frames = np.asarray(
        normalize_recording(recording, means, stds), dtype=np.float64
    )
    if frames.ndim != 2 or frames.shape[1] != INPUT_SIZE or frames.shape[0] == 0:
        raise ValueError(f"{recording.path}: invalid normalized frame sequence shape {frames.shape}.")

    segments = np.array_split(frames, TEMPORAL_SEGMENTS, axis=0)
    if any(segment.shape[0] == 0 for segment in segments):
        raise ValueError(
            f"{recording.path}: at least {TEMPORAL_SEGMENTS} frames are required."
        )

    features = np.concatenate(
        [
            statistic
            for segment in segments
            for statistic in (segment.mean(axis=0), segment.std(axis=0))
        ]
    )
    if features.shape != (TEMPORAL_SEGMENTS * 2 * INPUT_SIZE,):
        raise ValueError(f"{recording.path}: unexpected feature shape {features.shape}.")
    if not np.isfinite(features).all():
        raise ValueError(f"{recording.path}: temporal features contain non-finite values.")
    return features
