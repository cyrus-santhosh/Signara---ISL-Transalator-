# Signara

*Bridging communication through AI-powered sign language recognition and translation.*

## About the Project

Signara is an AI-powered application that recognizes sign language gestures through a webcam and turns them into text. It can translate the recognized text into a selected language and provide spoken output. By combining computer vision, translation, and speech, Signara aims to make everyday communication more accessible for sign language users and non-signers.

## Key Features

- Real-time webcam-based sign recognition
- Hand and body landmark detection
- AI-powered gesture classification
- Multilingual text translation
- Text-to-speech output
- Simple interface with camera, language, and voice controls

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS 4
- **Backend:** Python, FastAPI, Uvicorn
- **AI / Machine Learning:** MediaPipe Holistic, scikit-learn
- **Translation and Speech:** Groq API, gTTS

## How It Works

**Webcam Input → Landmark Detection → Sign Recognition → Text Translation → Speech Output**

## Setup

Requires Node.js 22, Python 3.11, and a webcam.

```powershell
git clone https://github.com/cyrus-santhosh/WannaBeEinsteins-codespark.git
Set-Location WannaBeEinsteins-codespark
Copy-Item .env.example .env
npm ci
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m pip install -r backend\training-requirements.txt
```

Add your Groq API key to `.env`. Run the backend and frontend in separate terminals:

```powershell
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

```powershell
npm run dev -- --port 8443
```

Open [http://localhost:8443](http://localhost:8443).

## Current Development Status

Signara's sign recognition model is under active development. Work is focused on expanding the dataset and continuing model training and testing. A compatible trained checkpoint is required for live recognition.
