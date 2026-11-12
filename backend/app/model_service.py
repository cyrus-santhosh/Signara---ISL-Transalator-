import json
import logging
import os
import sys
from collections import deque
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from training.data import INPUT_SIZE, LABELS, recording_from_keypoint_frames
from training.sklearn_features import TEMPORAL_SEGMENTS, extract_temporal_features

LOGGER = logging.getLogger("uvicorn.error")
MODEL_PATH = BACKEND_DIR / "models" / "signara_model.joblib"
CLASS_MAPPING_PATH = BACKEND_DIR / "models" / "class_to_idx.json"
PREPROCESSING_PATH = BACKEND_DIR / "models" / "preprocessing_config.json"
MODEL_TYPE = "scikit-learn StandardScaler + PCA + RBF SVC"
WINDOW_MS = 4_000
MIN_SEQUENCE_MS = 2_500
MIN_SEQUENCE_FRAMES = 16
INFERENCE_EVERY_FRAMES = 2
SMOOTHING_WINDOW = 3
SMOOTHING_VOTES = 2
LABEL_TO_PHRASE = {
    "hello_how_are_you": "Hello, how are you?",
    "i_need_help": "I need help",
    "no_sign": None,
}


def _probability_threshold() -> float:
    value = os.getenv("SIGNARA_PREDICTION_THRESHOLD", "0.65")
    try:
        threshold = float(value)
    except ValueError as exc:
        raise ValueError("SIGNARA_PREDICTION_THRESHOLD must be a number from 0 to 1.") from exc
    if not 0.0 <= threshold <= 1.0:
        raise ValueError("SIGNARA_PREDICTION_THRESHOLD must be between 0 and 1.")
    return threshold


class RecognitionModel:
    def __init__(self) -> None:
        self.model: Any = None
        self.class_to_idx: dict[str, int] = {}
        self.means: list[float] = []
        self.stds: list[float] = []
        self.load_error: str | None = None
        self.threshold = _probability_threshold()

    def load(self) -> None:
        self.model = None
        self.class_to_idx = {}
        self.means = []
        self.stds = []
        self.load_error = None
        try:
            missing = [
                str(path)
                for path in (MODEL_PATH, CLASS_MAPPING_PATH, PREPROCESSING_PATH)
                if not path.is_file()
            ]
            if missing:
                raise FileNotFoundError("Required model files are missing: " + ", ".join(missing))

            import joblib

            with CLASS_MAPPING_PATH.open("r", encoding="utf-8") as mapping_file:
                class_to_idx = json.load(mapping_file)
            with PREPROCESSING_PATH.open("r", encoding="utf-8") as config_file:
                preprocessing = json.load(config_file)
            with MODEL_PATH.open("rb") as checkpoint_file:
                bundle = joblib.load(checkpoint_file)

            if not isinstance(class_to_idx, dict) or set(class_to_idx) != set(LABELS):
                raise ValueError("Saved class mapping does not match the three supported labels.")
            if (
                not isinstance(preprocessing, dict)
                or preprocessing.get("feature_size") != TEMPORAL_SEGMENTS * 2 * INPUT_SIZE
                or preprocessing.get("input_feature_size_per_frame") != INPUT_SIZE
                or preprocessing.get("temporal_segments") != TEMPORAL_SEGMENTS
                or preprocessing.get("feature_method")
                != "per-segment mean and standard deviation"
            ):
                raise ValueError("Saved preprocessing configuration is incompatible.")
            if not isinstance(bundle, dict) or not callable(getattr(bundle.get("model"), "predict", None)):
                raise ValueError("Checkpoint does not contain a usable sklearn model.")
            if not callable(getattr(bundle["model"], "predict_proba", None)):
                raise ValueError("Checkpoint model does not provide predict_proba.")
            if bundle.get("class_to_idx") != class_to_idx:
                raise ValueError("Checkpoint and saved class mappings do not match.")
            if bundle.get("preprocessing") != preprocessing:
                raise ValueError("Checkpoint and saved preprocessing configuration do not match.")

            means = preprocessing.get("landmark_means")
            stds = preprocessing.get("landmark_stds")
            if (
                not isinstance(means, list)
                or len(means) != 5
                or not isinstance(stds, list)
                or len(stds) != 5
                or any(not isinstance(value, (int, float)) for value in means + stds)
            ):
                raise ValueError("Saved landmark normalization values are malformed.")

            self.model = bundle["model"]
            self.class_to_idx = {label: int(index) for label, index in class_to_idx.items()}
            self.means = [float(value) for value in means]
            self.stds = [float(value) for value in stds]
            LOGGER.info("Loaded Signara recognition model from %s", MODEL_PATH)
        except Exception as exc:
            self.load_error = f"{type(exc).__name__}: {exc}"
            LOGGER.exception("Could not load Signara recognition model from %s", MODEL_PATH)

    def status(self) -> dict[str, Any]:
        return {
            "model_loaded": self.model is not None,
            "model_path": str(MODEL_PATH),
            "model_type": MODEL_TYPE,
            "load_error": self.load_error,
            "probability_threshold": self.threshold,
            "probability_note": "SVC probability estimates are not calibrated confidence.",
        }

    def predict_frames(self, frames: list[dict[str, Any]]) -> dict[str, Any]:
        if self.model is None:
            raise RuntimeError(self.load_error or "Recognition model is not loaded.")
        recording = recording_from_keypoint_frames(frames)
        feature_vector = extract_temporal_features(recording, self.means, self.stds)
        if feature_vector.shape != (TEMPORAL_SEGMENTS * 2 * INPUT_SIZE,):
            raise ValueError(f"Expected 3600 temporal features; got {feature_vector.shape}.")
        model_prediction = str(self.model.predict(feature_vector.reshape(1, -1))[0])
        raw_probabilities = self.model.predict_proba(feature_vector.reshape(1, -1))[0]
        classifier_classes = self.model.named_steps["classifier"].classes_
        probabilities = {
            str(label): float(probability)
            for label, probability in zip(classifier_classes, raw_probabilities)
        }
        if model_prediction not in self.class_to_idx or set(probabilities) != set(LABELS):
            raise ValueError("Model returned a class outside the saved mapping.")
        return {
            "label": model_prediction,
            "probability": probabilities[model_prediction],
            "probabilities": probabilities,
        }


class LiveRecognitionSession:
    def __init__(self, model: RecognitionModel) -> None:
        self.model = model
        self.frames: deque[dict[str, Any]] = deque()
        self.predictions: deque[dict[str, Any]] = deque(maxlen=SMOOTHING_WINDOW)
        self.last_frame_number = -1
        self.last_timestamp = -1
        self.frames_since_prediction = INFERENCE_EVERY_FRAMES
        self.emitted_label: str | None = None

    def process(self, frame: dict[str, Any]) -> dict[str, Any]:
        base = {
            "type": "recognition",
            "timestamp": frame["timestamp"],
            "frameNumber": frame["frameNumber"],
            "gloss": None,
            "label": None,
            "confidence": None,
            "probabilities": None,
        }
        if self.model.model is None:
            return {**base, "status": "model_not_loaded", "error": self.model.load_error}
        if (
            frame["frameNumber"] <= self.last_frame_number
            or frame["timestamp"] < self.last_timestamp
        ):
            return {**base, "status": "invalid_sequence"}

        self.last_frame_number = frame["frameNumber"]
        self.last_timestamp = frame["timestamp"]
        self.frames.append(frame)
        cutoff = frame["timestamp"] - WINDOW_MS
        while self.frames and self.frames[0]["timestamp"] < cutoff:
            self.frames.popleft()

        if (
            len(self.frames) < MIN_SEQUENCE_FRAMES
            or self.frames[-1]["timestamp"] - self.frames[0]["timestamp"] < MIN_SEQUENCE_MS
        ):
            return {**base, "status": "waiting_for_sign"}

        self.frames_since_prediction += 1
        if self.frames_since_prediction < INFERENCE_EVERY_FRAMES:
            return {**base, "status": "recognizing"}
        self.frames_since_prediction = 0

        try:
            prediction = self.model.predict_frames(list(self.frames))
        except Exception as exc:
            LOGGER.exception("Signara live recognition inference failed.")
            self.predictions.clear()
            return {
                **base,
                "status": "inference_error",
                "error": f"{type(exc).__name__}: {exc}",
            }

        self.predictions.append(prediction)
        base.update(
            label=prediction["label"],
            confidence=prediction["probability"],
            probabilities=prediction["probabilities"],
        )
        votes = [
            item
            for item in self.predictions
            if item["label"] == prediction["label"]
            and item["probability"] >= self.model.threshold
        ]
        if len(votes) < SMOOTHING_VOTES:
            return {**base, "status": "recognizing"}

        stable_label = prediction["label"]
        if stable_label == "no_sign":
            self.emitted_label = None
            return {**base, "status": "no_sign_detected"}

        if stable_label == self.emitted_label:
            return {**base, "status": "phrase_recognized"}

        self.emitted_label = stable_label
        return {
            **base,
            "status": "phrase_recognized",
            "gloss": LABEL_TO_PHRASE[stable_label],
        }


recognition_model = RecognitionModel()
