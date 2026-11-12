import argparse
import json
from pathlib import Path

from training.data import (
    DEFAULT_DATA_DIR,
    INPUT_SIZE,
    LABELS,
    fit_standardization,
    load_dataset,
    stratified_split,
)


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train a three-class Signara landmark classifier with scikit-learn."
    )
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent / "models")
    parser.add_argument("--validation-fraction", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = _arguments()
    try:
        import joblib
        import numpy as np
        from sklearn.decomposition import PCA
        from sklearn.metrics import accuracy_score, classification_report
        from sklearn.model_selection import train_test_split
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.svm import SVC
    except ImportError as exc:
        raise SystemExit(
            "The scikit-learn training dependencies are missing. Install them with "
            "`python -m pip install -r backend/training-requirements.txt`."
        ) from exc

    from training.sklearn_features import (
        FEATURE_METHOD,
        TEMPORAL_SEGMENTS,
        extract_temporal_features,
    )

    recordings, errors = load_dataset(args.data_dir)
    for error in errors:
        print(f"Skipping unusable recording: {error}")
    counts = {label: sum(record.label == label for record in recordings) for label in LABELS}
    print(f"Dataset directory: {args.data_dir}")
    print(f"Usable recordings: {counts}")
    if errors:
        print(f"Invalid or missing recordings: {len(errors)}")
    if any(count < 2 for count in counts.values()):
        raise SystemExit("At least two usable recordings per class are required.")

    labels = [recording.label for recording in recordings]
    train_records, validation_records = train_test_split(
        recordings,
        test_size=args.validation_fraction,
        random_state=args.seed,
        stratify=labels,
    )
    train_labels = [recording.label for recording in train_records]
    validation_labels = [recording.label for recording in validation_records]
    train_counts = {
        label: train_labels.count(label)
        for label in LABELS
    }
    validation_counts = {
        label: validation_labels.count(label)
        for label in LABELS
    }
    print(f"Training split: {train_counts}")
    print(f"Validation split: {validation_counts}")

    means, stds = fit_standardization(train_records)
    x_train = np.stack(
        [extract_temporal_features(record, means, stds) for record in train_records]
    )
    x_validation = np.stack(
        [extract_temporal_features(record, means, stds) for record in validation_records]
    )
    y_train = np.asarray(train_labels)
    y_validation = np.asarray(validation_labels)
    class_mapping = {label: index for index, label in enumerate(LABELS)}

    model = Pipeline(
        steps=[
            ("scale", StandardScaler()),
            ("pca", PCA(n_components=min(20, len(train_records) - 1), random_state=args.seed)),
            (
                "classifier",
                SVC(
                    kernel="rbf",
                    C=1.0,
                    class_weight="balanced",
                    probability=True,
                    random_state=args.seed,
                ),
            ),
        ]
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_validation)
    accuracy = accuracy_score(y_validation, predictions)

    print(f"Validation accuracy: {accuracy:.4f} ({accuracy:.1%})")
    print(
        "Classification report:\n"
        + classification_report(
            y_validation,
            predictions,
            labels=list(LABELS),
            target_names=list(LABELS),
            zero_division=0,
            digits=4,
        )
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = args.output_dir / "signara_model.joblib"
    mapping_path = args.output_dir / "class_to_idx.json"
    config_path = args.output_dir / "preprocessing_config.json"
    history_path = args.output_dir / "training_history.json"
    config = {
        "model_type": "sklearn.pipeline.Pipeline(StandardScaler, PCA, SVC)",
        "input_feature_size_per_frame": INPUT_SIZE,
        "feature_size": int(x_train.shape[1]),
        "feature_method": FEATURE_METHOD,
        "temporal_segments": TEMPORAL_SEGMENTS,
        "temporal_segment_statistics": ["mean", "standard_deviation"],
        "missing_values": "zero-filled coordinates/statistics plus existing presence-mask channels",
        "normalization": "existing training-split landmark channel means and standard deviations",
        "landmark_means": means,
        "landmark_stds": stds,
        "class_to_idx": class_mapping,
        "validation_fraction": args.validation_fraction,
        "random_seed": args.seed,
    }
    bundle = {
        "model": model,
        "class_to_idx": class_mapping,
        "preprocessing": config,
    }
    joblib.dump(bundle, checkpoint_path)
    mapping_path.write_text(json.dumps(class_mapping, indent=2) + "\n", encoding="utf-8")
    config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    history = {
        "validation_accuracy": float(accuracy),
        "train_counts": train_counts,
        "validation_counts": validation_counts,
        "classification_report": classification_report(
            y_validation,
            predictions,
            labels=list(LABELS),
            target_names=list(LABELS),
            zero_division=0,
            output_dict=True,
        ),
    }
    history_path.write_text(json.dumps(history, indent=2) + "\n", encoding="utf-8")
    print(f"Model checkpoint: {checkpoint_path}")
    print(f"Class mapping: {mapping_path}")
    print(f"Preprocessing configuration: {config_path}")
    print(f"Validation history: {history_path}")


if __name__ == "__main__":
    main()
