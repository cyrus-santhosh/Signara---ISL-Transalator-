import argparse
import json
import random
from pathlib import Path

from training.data import (
    DEFAULT_DATA_DIR,
    INPUT_SIZE,
    LABELS,
    fit_standardization,
    load_dataset,
    normalize_recording,
    stratified_split,
)


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train an offline ISL phrase and neutral LSTM.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent / "models")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--hidden-size", type=int, default=64)
    parser.add_argument("--patience", type=int, default=15)
    parser.add_argument("--validation-fraction", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = _arguments()
    if not 1 <= args.epochs <= 50:
        raise SystemExit("epochs must be between 1 and 50.")
    if min(args.batch_size, args.hidden_size, args.patience) < 1:
        raise SystemExit("batch-size, hidden-size, and patience must be positive.")
    random.seed(args.seed)

    recordings, errors = load_dataset(args.data_dir)
    for error in errors:
        print(f"Skipping unusable recording: {error}")
    counts = {label: sum(item.label == label for item in recordings) for label in LABELS}
    print(f"Dataset directory: {args.data_dir}")
    print(f"Usable recordings: {counts}")
    if any(count < 2 for count in counts.values()):
        raise SystemExit("At least two usable recordings per phrase are required to split and train.")
    if min(counts.values()) < 50:
        print(
            "WARNING: This is a small prototype dataset. Validation metrics are highly uncertain "
            "and do not establish reliable recognition."
        )

    train_records, validation_records = stratified_split(
        recordings, args.validation_fraction, args.seed
    )
    train_counts = {label: sum(item.label == label for item in train_records) for label in LABELS}
    validation_counts = {
        label: sum(item.label == label for item in validation_records) for label in LABELS
    }
    print(f"Training split: {train_counts}; validation split: {validation_counts}")

    means, stds = fit_standardization(train_records)
    class_to_idx = {label: index for index, label in enumerate(LABELS)}

    try:
        import torch
        from torch import nn
        from torch.nn.utils.rnn import pad_sequence
        from torch.utils.data import DataLoader
    except (ImportError, OSError) as exc:
        raise SystemExit(
            "PyTorch could not be loaded. Install the optional training dependency in a "
            f"supported Python environment and check Windows DLL/Application Control policy. Details: {exc}"
        ) from exc

    from training.model import PhraseLSTM

    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    def make_item(recording):
        if recording.label not in class_to_idx:
            raise ValueError(f"Recording has no supported training label: {recording.path}")
        sequence = torch.tensor(
            normalize_recording(recording, means, stds), dtype=torch.float32
        )
        return sequence, len(recording.features), class_to_idx[recording.label]

    def collate(batch):
        sequences, lengths, labels = zip(*batch)
        return (
            pad_sequence(sequences, batch_first=True),
            torch.tensor(lengths, dtype=torch.long),
            torch.tensor(labels, dtype=torch.long),
        )

    train_loader = DataLoader(
        [make_item(recording) for recording in train_records],
        batch_size=args.batch_size,
        shuffle=True,
        collate_fn=collate,
    )
    validation_loader = DataLoader(
        [make_item(recording) for recording in validation_records],
        batch_size=args.batch_size,
        shuffle=False,
        collate_fn=collate,
    )

    model = PhraseLSTM(INPUT_SIZE, args.hidden_size, len(LABELS)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    criterion = nn.CrossEntropyLoss()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = args.output_dir / "isl_phrase_lstm.pt"
    mapping_path = args.output_dir / "class_to_idx.json"
    history_path = args.output_dir / "training_history.json"
    best_loss = float("inf")
    epochs_without_improvement = 0
    history = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss_total = 0.0
        train_samples = 0
        for sequences, lengths, targets in train_loader:
            sequences, lengths, targets = sequences.to(device), lengths.to(device), targets.to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(sequences, lengths), targets)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_loss_total += loss.item() * targets.size(0)
            train_samples += targets.size(0)

        model.eval()
        validation_loss_total = 0.0
        validation_correct = 0
        validation_samples = 0
        with torch.no_grad():
            for sequences, lengths, targets in validation_loader:
                sequences, lengths, targets = (
                    sequences.to(device),
                    lengths.to(device),
                    targets.to(device),
                )
                logits = model(sequences, lengths)
                validation_loss_total += criterion(logits, targets).item() * targets.size(0)
                validation_correct += (logits.argmax(dim=1) == targets).sum().item()
                validation_samples += targets.size(0)

        train_loss = train_loss_total / train_samples
        validation_loss = validation_loss_total / validation_samples
        validation_accuracy = validation_correct / validation_samples
        print(
            f"Epoch {epoch:03d} | train_loss={train_loss:.4f} "
            f"| validation_loss={validation_loss:.4f} "
            f"| validation_accuracy={validation_accuracy:.3f}"
        )
        history.append(
            {
                "epoch": epoch,
                "train_loss": train_loss,
                "validation_loss": validation_loss,
                "validation_accuracy": validation_accuracy,
            }
        )
        history_temporary_path = history_path.with_suffix(".json.tmp")
        history_temporary_path.write_text(
            json.dumps(history, indent=2) + "\n", encoding="utf-8"
        )
        history_temporary_path.replace(history_path)

        if validation_loss < best_loss:
            best_loss = validation_loss
            epochs_without_improvement = 0
            checkpoint = {
                "model_state_dict": model.state_dict(),
                "class_to_idx": class_to_idx,
                "input_size": INPUT_SIZE,
                "hidden_size": args.hidden_size,
                "means": means,
                "stds": stds,
                "label_counts": counts,
                "train_counts": train_counts,
                "validation_counts": validation_counts,
                "seed": args.seed,
                "architecture": "bidirectional_lstm_last_hidden",
            }
            temporary_path = checkpoint_path.with_suffix(".pt.tmp")
            torch.save(checkpoint, temporary_path)
            temporary_path.replace(checkpoint_path)
            mapping_path.write_text(
                json.dumps(class_to_idx, indent=2) + "\n", encoding="utf-8"
            )
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= args.patience:
                print(f"Early stopping after {args.patience} epochs without validation loss improvement.")
                break

    print(f"Best checkpoint: {checkpoint_path}")
    print(f"Class mapping: {mapping_path}")
    print(f"Training history: {history_path}")
    print(f"Training device: {device}")


if __name__ == "__main__":
    main()
