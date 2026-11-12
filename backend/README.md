# ISL Recognition and Dialogue System

## Run locally

From the project root, copy `.env.example` to `.env`, add a Gemini API key, and set
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
- `POST /api/chat` — accepts `{"glosses":["HELLO"],"target_lang":"hi"}` and returns
  the interpreted sentence, translated reply, and an `/api/audio/...` URL.
- `POST /api/auth/register` and `POST /api/auth/login` — create an account or
  authenticate with email and password.
- `GET /api/audio/{filename}` — serve generated MP3 speech.
- `WS /ws/sign` — accepts
  `{"type":"keypoints","keypoints":[[0.1,0.2,0.3]]}` and returns a mock gloss with
  confidence. Replace `recognize_keypoints` when a trained model is ready.

The SQLite database and generated audio are stored under `backend/data/` by default.
Persist that directory when running the Docker image. Gemini and gTTS calls need
outbound network access; chat returns a clear service error if Gemini is not configured.
