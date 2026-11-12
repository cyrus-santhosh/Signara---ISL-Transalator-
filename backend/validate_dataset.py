import argparse
from pathlib import Path

from training.data import DEFAULT_DATA_DIR, LABELS, load_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate saved Signara landmark recordings.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()

    recordings, errors = load_dataset(args.data_dir)
    print(f"Dataset directory: {args.data_dir}")
    total_files = 0
    for label in LABELS:
        label_dir = args.data_dir / label
        files = sorted(label_dir.glob("*.json")) if label_dir.is_dir() else []
        total_files += len(files)
        usable = sum(recording.label == label for recording in recordings)
        print(f"{label}: {usable}/{len(files)} usable JSON recordings")

    print(f"Total: {len(recordings)}/{total_files} usable JSON recordings")
    if errors:
        print(f"Invalid recordings or directories: {len(errors)}")
        for error in errors:
            print(f"  {error}")
        raise SystemExit(1)
    print("All recordings passed schema, feature, frame-order, and non-empty-sequence validation.")


if __name__ == "__main__":
    main()
