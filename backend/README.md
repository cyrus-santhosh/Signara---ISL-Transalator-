# ISL Recognition and Dialogue System

## Run locally

From the project root, copy `.env.example` to `.env`, add a Groq API key, and set
`AUTH_SECRET_KEY` to a random value of at least 32 characters. Then run:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

The React/Vite development server proxies `/api` and `/ws` to `http://127.0.0.1:8000`.
Set `VITE_BACKEND_URL` in the environment or `.env` to override that destination.
For a frontend hosted elsewhere, configure `CORS_ORIGINS` and proxy the same paths
to the backend in the production web server.

## API

- `GET /api/health` — liveness check.
- `GET /api/recognition/model-status` — reports the loaded model path, type, and load error.
- `GET /api/conversation/status` — reports Groq configuration status and the configured model.
- `POST /api/conversation` — translation-only endpoint. Accepts a recognized English phrase,
  language code (`en`, `hi`, or `kn`), and event ID; returns the original phrase and translation.
  Speech is generated separately from the translated text when requested.
- `POST /api/speech` — generate or replay speech for translated text.
- `GET /api/dataset/counts` — sample counts for each phrase and the optional neutral class.
- `POST /api/dataset/recording` — validate and save a captured landmark sequence.
- `GET /api/dataset/export.zip` — download the collected dataset as a ZIP archive.
- `POST /api/chat` — legacy-compatible translation-only route accepting
  `{"glosses":["HELLO"],"target_lang":"hi"}`.
- `POST /api/auth/register` and `POST /api/auth/login` — create an account or
  authenticate with email and password.
- `GET /api/audio/{filename}` — serve generated MP3 speech.
- `WS /ws/sign` — accepts timestamped keypoint frames. Each frame has a numeric
  millisecond `timestamp`, an increasing integer `frameNumber`, and a `landmarks`
  object containing `leftHand`, `rightHand`, and `pose`. Each set is either `null`
  or a list of `{x,y,z,visibility,presence}` points (21 per hand, 33 for pose);
  visibility/presence are `null` when unavailable. The backend loads the trained
  scikit-learn checkpoint once at startup and aggregates a rolling 4-second
  sequence with the shared training feature extractor. Stable predictions return
  a phrase in `gloss`; stable `no_sign` predictions never return a phrase.
  Confidence is the model's SVC probability estimate, which is not calibrated.
  MediaPipe extracts landmarks; the separate classifier performs phrase recognition.

## Recognition model preparation

The current frontend sends a maximum of approximately 10 frames per second. Each
frame contains up to 75 landmarks (21 left hand, 21 right hand, 33 pose). Every
point contains normalized `x`, `y`, `z` plus nullable `visibility` and `presence`,
so a fully populated frame has 375 scalar feature slots, with missing landmark
sets represented as `null`. The message also carries a millisecond timestamp and
an increasing frame number. Face landmarks are not currently sent.

The WebSocket processes live frames in memory. The live-session recorder saves
separate phrase-labeled sequences, but the JSON does not contain signer/session
identifiers or continuous frame-level gloss alignment. Preserve timestamps and
missing-landmark representation; collect signer/session identifiers and use
signer-held-out evaluation before claiming generalization.

For a small continuous-sign vocabulary, a practical first model is a compact
bidirectional GRU over normalized landmark sequences with a CTC output layer and
a blank/no-sign label. CTC can learn variable timing and gloss boundaries from
sequence transcripts without requiring frame-by-frame alignment. Before training,
normalize coordinates relative to a stable pose anchor and scale, and handle
missing hands consistently. A fixed-window GRU classifier is simpler for
isolated, pre-segmented signs, but does not by itself solve continuous sequence
decoding.

The SQLite database and generated audio are stored under `backend/data/` by default.
Persist that directory when running the Docker image. Configure `GROQ_API_KEY`,
`GROQ_MODEL` (defaults to `openai/gpt-oss-20b`), and optionally
`GROQ_TIMEOUT_SECONDS` in the root `.env`. Groq and gTTS calls need outbound network
access; translation requests return a clear service error if Groq is not configured.
Dataset recordings are stored under `backend/dataset/<label>/` as individual JSON
files. Allowed labels are `hello_how_are_you`, `i_need_help`,
`i_need_to_meet_the_doctor`, and `no_sign`. The new doctor phrase can be recorded
there; the checked-in recognition model remains unchanged until it is explicitly
retrained to include that class.
Each sample includes its label, recording timestamp, frame count, and ordered
validated keypoint frames. The session recorder captures approximately four
seconds at the existing MediaPipe processing rate and does not create a second
camera stream or detector. Treat recordings as biometric-like personal data:
collect them with the signer’s consent and restrict access to the dataset/export
endpoints in any deployment where the API is reachable by untrusted users.
The browser loads the pinned MediaPipe Holistic script and model assets from jsDelivr,
so the browser also needs network access to that CDN. Camera access requires HTTPS or
localhost. The frontend processes frames locally and sends only the landmark message,
at a maximum of approximately 10 frames per second; raw video is not transmitted.

## scikit-learn recognition model

The current offline prototype reads all three saved classes:
`hello_how_are_you`, `i_need_help`, and `no_sign`. It reuses the recording loader
and 450-value per-frame landmark representation. Each variable-length sequence
is split into four ordered temporal segments; each segment contributes per
feature mean and standard deviation, preserving coarse movement over time. A
training-split standardization and PCA + RBF SVC classifier are used by both the
offline prediction script and the live WebSocket recognizer.

Run dataset validation, install only the scikit-learn dependencies, and train:

```powershell
python backend/validate_dataset.py
python -m pip install -r backend/training-requirements.txt
python backend/train_sklearn.py
```

Training uses a stratified 80/20 recording split and prints validation accuracy
and a per-class report. The joblib model, class mapping, and preprocessing
configuration are saved under `backend/models/`. To test one JSON recording:

```powershell
python backend/predict_sklearn.py backend/dataset/hello_how_are_you/<recording-id>.json
```

The live recognizer loads `backend/models/signara_model.joblib` at API startup.
The stable-prediction probability threshold defaults to `0.65` and can be
overridden with `SIGNARA_PREDICTION_THRESHOLD` in the backend environment.

The recording-level split may place samples from the same signer/session in both
sets because signer/session IDs are not stored. The dataset is small and metrics
are only a prototype estimate; collect more diverse signers and evaluate with
signer-held-out data before claiming real-world accuracy. SVC probability
outputs are estimates, not calibrated confidence.
