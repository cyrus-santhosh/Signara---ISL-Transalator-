import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict a phrase from a recorded landmark JSON file.")
    parser.add_argument("recording", type=Path, help="Path to one saved recording JSON file.")
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path(__file__).resolve().parent / "models" / "isl_phrase_lstm.pt",
    )
    args = parser.parse_args()

    try:
        import torch
    except (ImportError, OSError) as exc:
        raise SystemExit(
            "PyTorch could not be loaded. Install the optional training dependency in a "
            f"supported Python environment and check Windows DLL/Application Control policy. Details: {exc}"
        ) from exc

    from training.data import INPUT_SIZE, load_recording, normalize_recording
    from training.model import PhraseLSTM

    if not args.checkpoint.is_file():
        raise SystemExit(f"Checkpoint not found: {args.checkpoint}. Train a model first.")
    recording = load_recording(args.recording)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    checkpoint = torch.load(args.checkpoint, map_location=device, weights_only=True)
    class_to_idx = checkpoint.get("class_to_idx")
    if not isinstance(class_to_idx, dict) or not class_to_idx:
        raise SystemExit("Checkpoint does not contain a valid class-to-index mapping.")
    idx_to_class = {index: label for label, index in class_to_idx.items()}
    if checkpoint.get("input_size") != INPUT_SIZE:
        raise SystemExit(
            f"Checkpoint feature size {checkpoint.get('input_size')} does not match {INPUT_SIZE}."
        )

    model = PhraseLSTM(
        INPUT_SIZE, checkpoint["hidden_size"], len(class_to_idx)
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    sequence = torch.tensor(
        normalize_recording(recording, checkpoint["means"], checkpoint["stds"]),
        dtype=torch.float32,
        device=device,
    ).unsqueeze(0)
    lengths = torch.tensor([sequence.shape[1]], dtype=torch.long, device=device)
    with torch.no_grad():
        probabilities = torch.softmax(model(sequence, lengths), dim=1)[0]
    predicted_index = int(probabilities.argmax().item())
    print(f"Recording: {args.recording}")
    print(f"Predicted phrase: {idx_to_class[predicted_index]}")
    print("Model softmax scores (not calibrated confidence or accuracy):")
    for index, label in sorted(idx_to_class.items()):
        print(f"  {label}: {probabilities[index].item():.4f}")


if __name__ == "__main__":
    main()
