import argparse
from pathlib import Path

from training.data import LABELS, load_recording


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Predict the class of a saved Signara landmark recording."
    )
    parser.add_argument("recording", type=Path, help="Path to one landmark recording JSON.")
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path(__file__).resolve().parent / "models" / "signara_model.joblib",
    )
    args = parser.parse_args()
    if not args.checkpoint.is_file():
        raise SystemExit(f"Model checkpoint not found: {args.checkpoint}")

    try:
        import joblib
    except ImportError as exc:
        raise SystemExit(
            "Prediction dependencies are missing. Install them with "
            "`python -m pip install -r backend/training-requirements.txt`."
        ) from exc

    from training.sklearn_features import extract_temporal_features

    recording = load_recording(args.recording)
    bundle = joblib.load(args.checkpoint)
    class_to_idx = bundle.get("class_to_idx")
    config = bundle.get("preprocessing")
    model = bundle.get("model")
    if (
        not isinstance(class_to_idx, dict)
        or not class_to_idx
        or any(label not in LABELS for label in class_to_idx)
        or any(
            isinstance(index, bool) or not isinstance(index, int)
            for index in class_to_idx.values()
        )
        or set(class_to_idx.values()) != set(range(len(class_to_idx)))
    ):
        raise SystemExit("Checkpoint class mapping is missing or incompatible.")
    if not isinstance(config, dict) or model is None:
        raise SystemExit("Checkpoint is missing model or preprocessing metadata.")
    classifier_classes = set(str(label) for label in model.named_steps["classifier"].classes_)
    if classifier_classes != set(class_to_idx):
        raise SystemExit("Checkpoint output classes do not match its saved class mapping.")
    features = extract_temporal_features(
        recording,
        config["landmark_means"],
        config["landmark_stds"],
    ).reshape(1, -1)
    prediction = str(model.predict(features)[0])
    print(f"Recording: {args.recording}")
    print(f"Actual label: {recording.label or 'unknown'}")
    print(f"Predicted class: {prediction}")
    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(features)[0]
        classes = model.named_steps["classifier"].classes_
        print("Probability scores (classifier outputs; not calibrated confidence):")
        for label, probability in sorted(
            zip(classes, probabilities), key=lambda item: class_to_idx[str(item[0])]
        ):
            print(f"  {label}: {float(probability):.6f}")
    else:
        print("This classifier does not provide probability scores.")


if __name__ == "__main__":
    main()
