import type { Holistic, Results } from "@mediapipe/holistic";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AudioLines,
  Camera,
  CameraOff,
  ChevronDown,
  CirclePlay,
  CircleStop,
  Download,
  Hand,
  Mic2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useNavigate } from "react-router";
import { AppSidebar } from "../components/AppSidebar";
import { AppTopbar } from "../components/AppTopbar";
import {
  exportDataset,
  getDatasetCounts,
  getRecognitionModelStatus,
  getTranslationStatus,
  postTranslation,
  requestSpeech,
  saveDatasetRecording,
  type DatasetCounts,
  type DatasetLabel,
  type RecognitionModelStatus,
} from "../services/api";
import { createKeypointFrame } from "../services/keypoints";
import { clearLandmarkOverlay, drawLandmarkOverlay } from "../services/landmarkOverlay";
import { loadHolistic, locateHolisticFile } from "../services/mediapipe";
import {
  SignSocket,
  type KeypointFrame,
  type RecognitionResponse,
  type SocketStatus,
} from "../services/signSocket";

const KeypointScene = lazy(() => import("../components/KeypointScene"));
type LandmarkCounts = { leftHand: number; rightHand: number; pose: number };
type RecordingStatus = "idle" | "recording" | "saving" | "saved" | "error";
const RECORDING_DURATION_MS = 4_000;
const MIN_RECORDING_DURATION_MS = 3_000;
const EMPTY_DATASET_COUNTS: DatasetCounts = {
  hello_how_are_you: 0,
  i_need_help: 0,
  i_need_to_meet_the_doctor: 0,
  no_sign: 0,
};

function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 15_000): Promise<void> {
  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", checkReady);
      video.removeEventListener("resize", checkReady);
      video.removeEventListener("error", onError);
    };
    const checkReady = () => {
      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        cleanup();
        resolve();
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error("The webcam video element reported a playback error."));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Webcam video did not become ready with valid dimensions (readyState=${video.readyState}, size=${video.videoWidth}x${video.videoHeight}).`,
        ),
      );
    }, timeoutMs);

    video.addEventListener("loadeddata", checkReady);
    video.addEventListener("resize", checkReady);
    video.addEventListener("error", onError);
    checkReady();
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs / 1000}s.`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

type SessionMessage = {
  id: number;
  text: string;
  sub?: string;
  time: string;
  audioUrl?: string;
  audioError?: string | null;
  eventId?: string;
  pending?: boolean;
  error?: string;
  translated?: string;
  targetLanguage?: "en" | "hi" | "kn";
  recognitionLabel?: DatasetLabel;
};

export function SessionPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(false);
  const sessionActiveRef = useRef(true);
  const socketRef = useRef<SignSocket | null>(null);
  const pausedRef = useRef(false);
  const landmarkPresenceRef = useRef({ leftHand: false, rightHand: false, pose: false });
  const lastAutoSubmittedPhraseRef = useRef<string | null>(null);
  const submitRecognizedRef = useRef<(phrase: string, label: DatasetLabel) => void>(() => {});
  const pendingEventsRef = useRef(new Set<string>());
  const languageRef = useRef<"en" | "hi" | "kn">("en");
  const voiceRef = useRef(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedDatasetLabelRef = useRef<DatasetLabel>("hello_how_are_you");
  const recordingLabelRef = useRef<DatasetLabel>("hello_how_are_you");
  const recordingActiveRef = useRef(false);
  const recordingBusyRef = useRef(false);
  const recordingFramesRef = useRef<KeypointFrame[]>([]);
  const recordingIdRef = useRef<string | null>(null);
  const recordingTimestampRef = useRef(0);
  const recordingStartedAtRef = useRef(0);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recordingCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const stopRecordingRef = useRef<() => void>(() => {});
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("off");
  const [cameraError, setCameraError] = useState("");
  const [mediaPipeStatus, setMediaPipeStatus] = useState("waiting");
  const [videoProcessingStatus, setVideoProcessingStatus] = useState("stopped");
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("disconnected");
  const [recognitionError, setRecognitionError] = useState("");
  const [latestRecognition, setLatestRecognition] = useState<RecognitionResponse | null>(null);
  const [recognizedPhrase, setRecognizedPhrase] = useState<string | null>(null);
  const [recognitionModelStatus, setRecognitionModelStatus] =
    useState<RecognitionModelStatus | null>(null);
  const [groqConfigured, setGroqConfigured] = useState<
    "checking" | "ready" | "missing" | "unavailable"
  >("checking");
  const [landmarkPresence, setLandmarkPresence] = useState({
    leftHand: false,
    rightHand: false,
    pose: false,
  });
  const [landmarkCounts, setLandmarkCounts] = useState<LandmarkCounts>({
    leftHand: 0,
    rightHand: 0,
    pose: 0,
  });
  const [resultFrameCount, setResultFrameCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [language, setLanguage] = useState<"en" | "hi" | "kn">("en");
  const [glosses, setGlosses] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [playing, setPlaying] = useState(0);
  const [sending, setSending] = useState(false);
  const [audioLoadingId, setAudioLoadingId] = useState(0);
  const [selectedDatasetLabel, setSelectedDatasetLabel] =
    useState<DatasetLabel>("hello_how_are_you");
  const [datasetCounts, setDatasetCounts] = useState<DatasetCounts>(EMPTY_DATASET_COUNTS);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>("idle");
  const [recordingCountdown, setRecordingCountdown] = useState(0);
  const [recordingFrameCount, setRecordingFrameCount] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [recordingSavedFilename, setRecordingSavedFilename] = useState("");
  const [datasetExporting, setDatasetExporting] = useState(false);
  const [datasetExportError, setDatasetExportError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    voiceRef.current = voiceOn;
  }, [voiceOn]);

  async function submitDatasetRecording() {
    if (recordingBusyRef.current || !recordingIdRef.current) return;
    const sequence = recordingFramesRef.current;
    if (!sequence.length) {
      setRecordingStatus("error");
      setRecordingError("No landmark frames were captured. Please record again.");
      return;
    }

    recordingBusyRef.current = true;
    setRecordingStatus("saving");
    setRecordingError("");
    try {
      const result = await saveDatasetRecording({
        recordingId: recordingIdRef.current,
        label: recordingLabelRef.current,
        timestamp: recordingTimestampRef.current,
        sequence,
      });
      if (!result.saved || result.label !== recordingLabelRef.current || !result.filename) {
        throw new Error("The backend did not confirm saving this recording.");
      }
      setDatasetCounts(result.counts);
      setRecordingFrameCount(sequence.length);
      setRecordingSavedFilename(result.filename);
      recordingFramesRef.current = [];
      setRecordingStatus("saved");
    } catch (error) {
      setRecordingStatus("error");
      setRecordingError(error instanceof Error ? error.message : "Could not save this recording.");
    } finally {
      recordingBusyRef.current = false;
    }
  }

  async function stopDatasetRecording() {
    if (!recordingActiveRef.current || recordingBusyRef.current) return;
    if (performance.now() - recordingStartedAtRef.current < MIN_RECORDING_DURATION_MS) return;

    recordingActiveRef.current = false;
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    if (recordingCountdownIntervalRef.current) clearInterval(recordingCountdownIntervalRef.current);
    recordingTimeoutRef.current = undefined;
    recordingCountdownIntervalRef.current = undefined;
    setRecordingCountdown(0);
    await submitDatasetRecording();
  }
  stopRecordingRef.current = () => {
    void stopDatasetRecording();
  };

  function startDatasetRecording() {
    if (
      !cameraOn ||
      videoProcessingStatus !== "running" ||
      recordingActiveRef.current ||
      recordingBusyRef.current
    ) {
      return;
    }

    recordingFramesRef.current = [];
    recordingIdRef.current = crypto.randomUUID();
    recordingLabelRef.current = selectedDatasetLabelRef.current;
    recordingTimestampRef.current = Date.now();
    recordingStartedAtRef.current = performance.now();
    recordingActiveRef.current = true;
    setRecordingFrameCount(0);
    setRecordingSavedFilename("");
    setRecordingError("");
    setRecordingStatus("recording");
    setRecordingCountdown(RECORDING_DURATION_MS / 1000);
    recordingCountdownIntervalRef.current = setInterval(() => {
      const remaining = RECORDING_DURATION_MS - (performance.now() - recordingStartedAtRef.current);
      setRecordingCountdown(Math.max(0, Math.ceil(remaining / 1000)));
    }, 100);
    recordingTimeoutRef.current = setTimeout(
      () => stopRecordingRef.current(),
      RECORDING_DURATION_MS,
    );
  }

  async function downloadDataset() {
    setDatasetExporting(true);
    setDatasetExportError("");
    try {
      const archive = await exportDataset();
      const objectUrl = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "signara-dataset.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (error) {
      setDatasetExportError(
        error instanceof Error ? error.message : "Could not export the dataset.",
      );
    } finally {
      setDatasetExporting(false);
    }
  }

  useEffect(() => {
    let active = true;
    void getDatasetCounts()
      .then((counts) => {
        if (active) setDatasetCounts(counts);
      })
      .catch((error: unknown) => {
        if (active) {
          setRecordingError(
            error instanceof Error ? error.message : "Could not load dataset recording counts.",
          );
        }
      });
    return () => {
      active = false;
      recordingActiveRef.current = false;
      recordingFramesRef.current = [];
      recordingBusyRef.current = false;
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      if (recordingCountdownIntervalRef.current)
        clearInterval(recordingCountdownIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void getRecognitionModelStatus()
      .then((status) => {
        if (active) setRecognitionModelStatus(status);
      })
      .catch((error: unknown) => {
        if (active) {
          setRecognitionModelStatus({
            model_loaded: false,
            model_path: "",
            model_type: "scikit-learn",
            load_error:
              error instanceof Error ? error.message : "Could not load recognition model status.",
            probability_threshold: 0.65,
            probability_note: "SVC probability estimates are not calibrated confidence.",
          });
        }
      });
    void getTranslationStatus()
      .then((status) => {
        if (active) setGroqConfigured(status.groq_configured ? "ready" : "missing");
      })
      .catch(() => {
        if (active) setGroqConfigured("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!cameraOn) return;

    let cancelled = false;
    let processingFailed = false;
    let frameNumber = 0;
    let lastVideoTime = -1;
    let lastDebugUpdate = 0;
    let processTimer: ReturnType<typeof setTimeout> | undefined;
    let holistic: Holistic | undefined;
    let lastLandmarkCounts: LandmarkCounts = { leftHand: 0, rightHand: 0, pose: 0 };
    let latestResults: Results | undefined;
    const stream = streamRef.current;
    const video = videoRef.current;
    const canvas = landmarkCanvasRef.current;
    const canvasContainer = canvas?.parentElement;
    const resizeObserver =
      canvasContainer && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (
              latestResults &&
              video &&
              canvas &&
              window.HAND_CONNECTIONS &&
              window.POSE_CONNECTIONS
            ) {
              drawLandmarkOverlay(
                canvas,
                video,
                latestResults,
                window.HAND_CONNECTIONS,
                window.POSE_CONNECTIONS,
              );
            }
          })
        : undefined;
    if (canvasContainer) resizeObserver?.observe(canvasContainer);
    setMediaPipeStatus("loading");
    setVideoProcessingStatus("waiting");
    setLandmarkCounts({ leftHand: 0, rightHand: 0, pose: 0 });
    setResultFrameCount(0);
    const socket = new SignSocket({
      onRecognition: (result) => {
        setLatestRecognition(result);
        if (result.status === "inference_error" || result.status === "model_not_loaded") {
          setRecognitionError(result.error ?? "The recognition model is unavailable.");
          return;
        }
        setRecognitionError("");
        if (result.status === "no_sign_detected") {
          lastAutoSubmittedPhraseRef.current = null;
          setRecognizedPhrase(null);
        }
        if (
          result.status === "phrase_recognized" &&
          result.label !== "no_sign" &&
          result.label !== null
        ) {
          const phraseByLabel: Record<Exclude<DatasetLabel, "no_sign">, string> = {
            hello_how_are_you: "Hello, how are you?",
            i_need_help: "I need help",
            i_need_to_meet_the_doctor: "I need to meet the doctor",
          };
          const phrase = phraseByLabel[result.label];
          setRecognizedPhrase(phrase);
          if (lastAutoSubmittedPhraseRef.current !== phrase) {
            lastAutoSubmittedPhraseRef.current = phrase;
            submitRecognizedRef.current(phrase, result.label);
          }
        }
      },
      onStatus: (status) => {
        setSocketStatus(status);
        if (status === "connected") setRecognitionError("");
      },
      onError: setRecognitionError,
    });
    socketRef.current = socket;
    socket.connect();

    const cleanupStream = () => {
      stream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === stream) streamRef.current = null;
      if (video?.srcObject === stream) video.srcObject = null;
    };

    if (!stream || !video) {
      setCameraStatus("error");
      setCameraError("Camera stream is unavailable. Turn the camera on again.");
      return () => {
        cancelled = true;
        resizeObserver?.disconnect();
        clearLandmarkOverlay(canvas);
        socket.disconnect();
        if (socketRef.current === socket) socketRef.current = null;
        cleanupStream();
      };
    }

    video.srcObject = stream;
    const processFrame = async (detector: Holistic) => {
      if (cancelled) return;
      const frameStartedAt = performance.now();
      try {
        if (pausedRef.current) {
          setVideoProcessingStatus("paused");
        } else if (
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0 &&
          video.videoHeight > 0 &&
          video.currentTime !== lastVideoTime
        ) {
          lastVideoTime = video.currentTime;
          await detector.send({ image: video });
          if (!cancelled) setVideoProcessingStatus("running");
        } else {
          setVideoProcessingStatus("waiting");
        }
      } catch (error) {
        if (!cancelled) {
          processingFailed = true;
          setMediaPipeStatus("failed");
          setVideoProcessingStatus("failed");
          setRecognitionError(
            error instanceof Error
              ? `MediaPipe frame processing failed: ${error.message}`
              : "MediaPipe frame processing failed with an unknown error.",
          );
        }
      }
      if (!cancelled && !processingFailed) {
        const remainingInterval = Math.max(0, 100 - (performance.now() - frameStartedAt));
        processTimer = setTimeout(() => void processFrame(detector), remainingInterval);
      }
    };

    const startHolistic = async () => {
      try {
        if (video.srcObject !== stream) {
          video.srcObject = stream;
        }
        await video.play();
        await waitForVideoReady(video);
        clearLandmarkOverlay(canvas);
        const HolisticConstructor = await loadHolistic();
        if (cancelled) return;
        const detector = new HolisticConstructor({
          locateFile: locateHolisticFile,
        });
        holistic = detector;
        detector.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          refineFaceLandmarks: false,
          enableSegmentation: false,
        });
        detector.onResults((results: Results) => {
          if (cancelled) return;
          try {
            latestResults = results;
            if (!window.HAND_CONNECTIONS || !window.POSE_CONNECTIONS) {
              throw new Error("MediaPipe hand or pose connection definitions are unavailable.");
            }
            if (canvas) {
              drawLandmarkOverlay(
                canvas,
                video,
                results,
                window.HAND_CONNECTIONS,
                window.POSE_CONNECTIONS,
              );
            }
            frameNumber += 1;
            const frame = createKeypointFrame(results, frameNumber);
            if (recordingActiveRef.current) recordingFramesRef.current.push(frame);
            const counts = {
              leftHand: results.leftHandLandmarks?.length ?? 0,
              rightHand: results.rightHandLandmarks?.length ?? 0,
              pose: results.poseLandmarks?.length ?? 0,
            };
            const presence = {
              leftHand: counts.leftHand > 0,
              rightHand: counts.rightHand > 0,
              pose: counts.pose > 0,
            };
            const previousPresence = landmarkPresenceRef.current;
            if (
              previousPresence.leftHand !== presence.leftHand ||
              previousPresence.rightHand !== presence.rightHand ||
              previousPresence.pose !== presence.pose
            ) {
              landmarkPresenceRef.current = presence;
              setLandmarkPresence(presence);
            }
            if (
              lastLandmarkCounts.leftHand !== counts.leftHand ||
              lastLandmarkCounts.rightHand !== counts.rightHand ||
              lastLandmarkCounts.pose !== counts.pose
            ) {
              lastLandmarkCounts = counts;
              setLandmarkCounts(counts);
            }
            setMediaPipeStatus(
              presence.leftHand || presence.rightHand || presence.pose ? "tracking" : "ready",
            );
            const now = performance.now();
            if (now - lastDebugUpdate >= 500) {
              lastDebugUpdate = now;
              setResultFrameCount(frameNumber);
            }
            socket.sendKeypoints(frame);
          } catch (error) {
            processingFailed = true;
            setMediaPipeStatus("failed");
            setVideoProcessingStatus("failed");
            setRecognitionError(
              error instanceof Error
                ? `MediaPipe result handling failed: ${error.message}`
                : "MediaPipe result handling failed with an unknown error.",
            );
          }
        });
        await withTimeout(detector.initialize(), 45_000, "MediaPipe model initialization");
        if (cancelled) {
          await detector.close();
          return;
        }
        setMediaPipeStatus("ready");
        processTimer = setTimeout(() => void processFrame(detector), 0);
      } catch (error) {
        if (holistic) {
          const detector = holistic;
          holistic = undefined;
          void detector.close().catch(() => undefined);
        }
        if (!cancelled) {
          setMediaPipeStatus("failed");
          setVideoProcessingStatus("failed");
          setRecognitionError(
            error instanceof Error
              ? `MediaPipe initialization failed: ${error.message}`
              : "MediaPipe initialization failed with an unknown error. Check network access to the pinned MediaPipe CDN assets.",
          );
        }
      }
    };
    void startHolistic();

    return () => {
      cancelled = true;
      if (processTimer) clearTimeout(processTimer);
      resizeObserver?.disconnect();
      clearLandmarkOverlay(canvas);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      if (holistic) void holistic.close().catch(() => undefined);
      cleanupStream();
    };
  }, [cameraOn]);

  useEffect(() => {
    sessionActiveRef.current = true;
    return () => {
      sessionActiveRef.current = false;
      socketRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      audioRef.current?.pause();
    };
  }, []);

  async function toggleCamera() {
    if (cameraOn) {
      if (recordingActiveRef.current || recordingBusyRef.current) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraOn(false);
      setCameraStatus("off");
      setMediaPipeStatus("waiting");
      setVideoProcessingStatus("stopped");
      landmarkPresenceRef.current = { leftHand: false, rightHand: false, pose: false };
      setLandmarkPresence({ leftHand: false, rightHand: false, pose: false });
      setLandmarkCounts({ leftHand: 0, rightHand: 0, pose: 0 });
      setResultFrameCount(0);
      setLatestRecognition(null);
      setRecognizedPhrase(null);
      return;
    }
    if (cameraRequestRef.current || streamRef.current) return;
    cameraRequestRef.current = true;
    setCameraStatus("requesting");
    setCameraError("");
    setRecognitionError("");
    setLatestRecognition(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access requires HTTPS or localhost and a supported browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!sessionActiveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraStatus("connected");
      setCameraOn(true);
    } catch (error) {
      if (!sessionActiveRef.current) return;
      setCameraOn(false);
      setCameraStatus("error");
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setCameraError(
          "Camera permission was denied. Allow camera access in your browser settings.",
        );
      } else if (error instanceof DOMException && error.name === "NotFoundError") {
        setCameraError("No camera was found on this device.");
      } else if (error instanceof DOMException && error.name === "NotReadableError") {
        setCameraError("The camera is already in use by another application.");
      } else {
        setCameraError(error instanceof Error ? error.message : "Could not access the camera.");
      }
    } finally {
      cameraRequestRef.current = false;
    }
  }
  function addGloss(word: string) {
    setGlosses((old) => [...old.slice(-4), word]);
  }
  async function requestTranslation(
    userMessage: SessionMessage,
    targetLanguage: "en" | "hi" | "kn",
  ) {
    if (!userMessage.eventId || pendingEventsRef.current.has(userMessage.eventId)) return;
    pendingEventsRef.current.add(userMessage.eventId);
    setSending(true);
    setMessages((old) =>
      old.map((message) =>
        message.id === userMessage.id
          ? { ...message, pending: true, error: undefined, targetLanguage }
          : message,
      ),
    );
    try {
      const result = await postTranslation({
        originalText: userMessage.text,
        targetLanguage,
        eventId: userMessage.eventId,
        generateAudio: false,
        recognitionLabel: userMessage.recognitionLabel,
      });
      setMessages((old) =>
        old.map((message) =>
          message.id === userMessage.id
            ? {
                ...message,
                translated: result.translated_text,
                pending: false,
                error: undefined,
                targetLanguage: result.target_language,
                audioUrl: result.audio_url ?? undefined,
                audioError: result.audio_error,
              }
            : message,
        ),
      );
      if (voiceRef.current) {
        setAudioLoadingId(userMessage.id);
        try {
          const audioUrl = await requestSpeech(result.translated_text, result.target_language);
          setMessages((old) =>
            old.map((message) =>
              message.id === userMessage.id ? { ...message, audioUrl, audioError: null } : message,
            ),
          );
          if (voiceRef.current) {
            const audio = new Audio(audioUrl);
            audioRef.current = audio;
            audio.onended = () => setPlaying(0);
            setPlaying(userMessage.id);
            void audio.play().catch(() => setPlaying(0));
          }
        } catch (error) {
          const audioError =
            error instanceof Error ? error.message : "Speech could not be generated.";
          setMessages((old) =>
            old.map((message) =>
              message.id === userMessage.id ? { ...message, audioError } : message,
            ),
          );
        } finally {
          setAudioLoadingId(0);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The message could not be sent.";
      setMessages((old) =>
        old.map((item) =>
          item.id === userMessage.id ? { ...item, pending: false, error: message } : item,
        ),
      );
    } finally {
      pendingEventsRef.current.delete(userMessage.eventId);
      setSending(pendingEventsRef.current.size > 0);
    }
  }

  function submitUserMessage(originalText: string, recognitionLabel?: DatasetLabel) {
    if (!originalText.trim() || recognitionLabel === "no_sign") return;
    const eventId = crypto.randomUUID();
    const message: SessionMessage = {
      id: Date.now(),
      text: originalText.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      eventId,
      pending: true,
      targetLanguage: languageRef.current,
      recognitionLabel,
    };
    setMessages((old) => [...old, message]);
    void requestTranslation(message, languageRef.current);
  }

  submitRecognizedRef.current = (phrase, label) => {
    submitUserMessage(phrase, label);
  };

  async function sendMessage() {
    const input = text.trim() || glosses.join(" ").trim();
    if (!input || sending) return;
    submitUserMessage(input);
    setText("");
    setGlosses([]);
  }

  async function playMessage(message: SessionMessage) {
    if (message.pending || !message.translated) return;
    if (playing === message.id) {
      audioRef.current?.pause();
      setPlaying(0);
      return;
    }
    let audioUrl = message.audioUrl;
    if (!audioUrl) {
      const languageCode = message.targetLanguage ?? languageRef.current;
      setAudioLoadingId(message.id);
      try {
        audioUrl = await requestSpeech(message.translated, languageCode);
        setMessages((old) =>
          old.map((item) =>
            item.id === message.id ? { ...item, audioUrl, audioError: null } : item,
          ),
        );
      } catch (error) {
        const audioError =
          error instanceof Error ? error.message : "Speech could not be generated.";
        setMessages((old) =>
          old.map((item) => (item.id === message.id ? { ...item, audioError } : item)),
        );
        return;
      } finally {
        setAudioLoadingId(0);
      }
    }
    if (!audioUrl) return;
    audioRef.current?.pause();
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlaying(0);
    setPlaying(message.id);
    void audio.play().catch(() => setPlaying(0));
  }
  return (
    <div className="app-frame">
      <AppSidebar />
      <main className="app-main session-main">
        <AppTopbar title="Live translation" subtitle="Your signs are translated in real time" />
        <div className="session-controls mobile-controls">
          <button
            className={voiceOn ? "control active" : "control"}
            onClick={() => setVoiceOn(!voiceOn)}
          >
            {voiceOn ? <Volume2 /> : <VolumeX />}
          </button>
          <button
            className={cameraOn ? "control active" : "control"}
            onClick={toggleCamera}
            disabled={
              cameraStatus === "requesting" ||
              recordingStatus === "recording" ||
              recordingStatus === "saving"
            }
          >
            {cameraOn ? <Camera /> : <CameraOff />}
          </button>
          <button className="end-btn" onClick={() => navigate("/history")}>
            <CircleStop size={17} /> End
          </button>
        </div>
        <div className="session-grid">
          <section className="video-column">
            <div className="video-card">
              {cameraOn ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted />
                  <canvas ref={landmarkCanvasRef} className="landmark-overlay" aria-hidden="true" />
                </>
              ) : (
                <div className="camera-placeholder">
                  <div className="camera-ring">
                    <Hand />
                  </div>
                  <h2>Camera is off</h2>
                  <p>
                    {cameraError ||
                      "Turn it on to extract landmarks and recognize supported phrases."}
                  </p>
                  <button className="btn btn-light" onClick={toggleCamera}>
                    <Camera size={18} />
                    {cameraStatus === "requesting" ? "Requesting camera…" : "Turn on camera"}
                  </button>
                </div>
              )}
              <div className="pipeline-status" aria-live="polite">
                <div>
                  <span>Camera</span>
                  <strong>{cameraStatus}</strong>
                  <span>MediaPipe</span>
                  <strong>{mediaPipeStatus}</strong>
                  <span>WebSocket</span>
                  <strong>{socketStatus}</strong>
                  <span>Recognition model</span>
                  <strong>
                    {recognitionModelStatus
                      ? recognitionModelStatus.model_loaded
                        ? "loaded"
                        : "not loaded"
                      : "loading"}
                  </strong>
                </div>
                <small>
                  Landmarks: left hand {landmarkPresence.leftHand ? "detected" : "missing"} · right
                  hand {landmarkPresence.rightHand ? "detected" : "missing"} · pose{" "}
                  {landmarkPresence.pose ? "detected" : "missing"}
                </small>
                <small>
                  Video processing: {videoProcessingStatus} · {videoRef.current?.videoWidth ?? 0}×
                  {videoRef.current?.videoHeight ?? 0} · Results frames: {resultFrameCount}
                </small>
                <small>
                  Landmark points: left hand {landmarkCounts.leftHand}/21 · right hand{" "}
                  {landmarkCounts.rightHand}/21 · pose {landmarkCounts.pose}/33
                </small>
                {latestRecognition && (
                  <small className="recognition-result">
                    {latestRecognition.status === "phrase_recognized" &&
                    (latestRecognition.gloss || recognizedPhrase)
                      ? `${latestRecognition.gloss ?? recognizedPhrase} · SVC probability estimate ${((latestRecognition.confidence ?? 0) * 100).toFixed(1)}%`
                      : latestRecognition.status === "no_sign_detected"
                        ? "No sign detected"
                        : latestRecognition.status === "model_not_loaded"
                          ? "Recognition model not loaded"
                          : latestRecognition.status === "waiting_for_sign"
                            ? "Waiting for sign"
                            : latestRecognition.status === "recognizing"
                              ? "Recognizing…"
                              : latestRecognition.status === "inference_error"
                                ? "Recognition inference failed"
                                : "Waiting for sign"}
                  </small>
                )}
                {recognitionModelStatus && !recognitionModelStatus.model_loaded && (
                  <small className="pipeline-error">
                    Model unavailable: {recognitionModelStatus.load_error ?? "Unknown load error"}
                  </small>
                )}
                {cameraError && <small className="pipeline-error">{cameraError}</small>}
                {recognitionError && <small className="pipeline-error">{recognitionError}</small>}
              </div>
              <div className="video-status-row">
                <span className="recording-badge">
                  <i /> CAMERA {cameraStatus.toUpperCase()}
                </span>
                <span className={`state-badge ${paused ? "paused" : ""}`}>
                  {paused ? <Pause size={14} /> : <Sparkles size={14} />}{" "}
                  {paused ? "Paused" : `MediaPipe ${mediaPipeStatus}`}
                </span>
              </div>
              <div className="mini-hand-card">
                <Suspense fallback={null}>
                  <KeypointScene mini />
                </Suspense>
                <div>
                  <small>LANDMARK EXTRACTION</small>
                  <strong>{cameraOn ? mediaPipeStatus : "Camera off"}</strong>
                </div>
              </div>
              <div className="caption-bar">
                <span>RECOGNITION</span>
                <p>
                  {latestRecognition?.status === "phrase_recognized" && recognizedPhrase
                    ? `Phrase recognized: ${recognizedPhrase}`
                    : latestRecognition?.status === "no_sign_detected"
                      ? "Waiting for signs"
                      : latestRecognition?.status === "recognizing"
                        ? "Recognizing…"
                        : latestRecognition?.status === "model_not_loaded" ||
                            (recognitionModelStatus && !recognitionModelStatus.model_loaded)
                          ? "Recognition model not loaded"
                          : "Waiting for signs"}
                  <i />
                </p>
              </div>
            </div>
            <div className="gloss-row">
              <div>
                <span className="gloss-label">MANUAL GLOSSES</span>
                <AnimatePresence>
                  {glosses.map((word, i) => (
                    <motion.button
                      key={`${word}-${i}`}
                      className="gloss-chip"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {word}
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
              <button
                className="pause-btn"
                onClick={() => setPaused(!paused)}
                disabled={recordingStatus === "recording" || recordingStatus === "saving"}
              >
                {paused ? <Play size={17} /> : <Pause size={17} />} {paused ? "Resume" : "Pause"}
              </button>
            </div>
            <section className="dataset-recorder" aria-labelledby="dataset-recorder-title">
              <div className="dataset-recorder-heading">
                <div>
                  <strong id="dataset-recorder-title">Phrase dataset recording</strong>
                  <small>
                    Captures real landmarks from this camera session; no predictions are made.
                  </small>
                </div>
                <button
                  type="button"
                  className="dataset-export-btn"
                  onClick={() => void downloadDataset()}
                  disabled={
                    datasetExporting ||
                    datasetCounts.hello_how_are_you +
                      datasetCounts.i_need_help +
                      datasetCounts.no_sign ===
                      0
                  }
                >
                  <Download size={15} />
                  {datasetExporting ? "Preparing ZIP…" : "Export ZIP"}
                </button>
              </div>
              <label className="dataset-phrase-select">
                <span>Phrase label</span>
                <select
                  value={selectedDatasetLabel}
                  disabled={recordingStatus === "recording" || recordingStatus === "saving"}
                  onChange={(event) => {
                    const label = event.target.value as DatasetLabel;
                    selectedDatasetLabelRef.current = label;
                    setSelectedDatasetLabel(label);
                    setRecordingStatus("idle");
                    setRecordingError("");
                    setRecordingFrameCount(0);
                  }}
                >
                  <option value="hello_how_are_you">Hello, how are you?</option>
                  <option value="i_need_help">I need help</option>
                  <option value="i_need_to_meet_the_doctor">
                    I need to meet the doctor
                  </option>
                  <option value="no_sign">Neutral / no sign</option>
                </select>
              </label>
              <div className="dataset-record-controls">
                <button
                  type="button"
                  className="dataset-start-btn"
                  onClick={startDatasetRecording}
                  disabled={
                    !cameraOn ||
                    videoProcessingStatus !== "running" ||
                    recordingStatus === "recording" ||
                    recordingStatus === "saving"
                  }
                >
                  <CirclePlay size={16} />
                  Start recording
                </button>
                <button
                  type="button"
                  className="dataset-stop-btn"
                  onClick={() => void stopDatasetRecording()}
                  disabled={
                    recordingStatus !== "recording" ||
                    recordingCountdown > 1 ||
                    recordingBusyRef.current
                  }
                >
                  <CircleStop size={16} />
                  Stop recording
                </button>
                <span className="dataset-countdown" aria-live="polite">
                  {recordingStatus === "recording"
                    ? `${recordingCountdown}s remaining · ${recordingFramesRef.current.length} frames`
                    : recordingStatus === "saving"
                      ? "Saving sample…"
                      : `${recordingFrameCount} frames in last sample`}
                </span>
              </div>
              <div className="dataset-counts" aria-live="polite">
                <span>
                  Hello, how are you? <strong>{datasetCounts.hello_how_are_you}</strong>
                </span>
                <span>
                  I need help <strong>{datasetCounts.i_need_help}</strong>
                </span>
                <span>
                  I need to meet the doctor{" "}
                  <strong>{datasetCounts.i_need_to_meet_the_doctor}</strong>
                </span>
                <span>
                  Neutral / no sign <strong>{datasetCounts.no_sign}</strong>
                </span>
              </div>
              <small className="dataset-record-status" aria-live="polite">
                {recordingStatus === "recording"
                  ? `Recording ${recordingLabelRef.current.replace(/_/g, " ")}. Frames are sampled from MediaPipe at approximately 10 FPS.`
                  : recordingStatus === "saving"
                    ? "Saving this landmark sequence to the backend dataset."
                    : recordingStatus === "saved"
                    ? `Recording saved successfully (${recordingSavedFilename}).`
                      : cameraOn && videoProcessingStatus === "running"
                        ? "Ready. Each sample records for 4 seconds; stop is enabled after 3 seconds."
                        : "Turn on the camera and wait for video processing before recording."}
              </small>
              {recordingStatus === "error" && recordingFramesRef.current.length > 0 && (
                <button
                  type="button"
                  className="dataset-retry-btn"
                  onClick={() => void submitDatasetRecording()}
                  disabled={recordingBusyRef.current}
                >
                  Retry saving recording
                </button>
              )}
              {recordingError && <small className="dataset-error">{recordingError}</small>}
              {datasetExportError && <small className="dataset-error">{datasetExportError}</small>}
            </section>
            <div className="fallback-card">
              <div className="fallback-header">
                <div>
                  <span>
                    <Plus />
                  </span>
                  <div>
                    <strong>Manual translation</strong>
                    <small>Camera unavailable? Keep the conversation going.</small>
                  </div>
                </div>
                <button>
                  <MoreHorizontal />
                </button>
              </div>
              <div className="quick-glosses">
                {["HELLO", "HELP", "YES", "NO", "THANK YOU"].map((w) => (
                  <button onClick={() => addGloss(w)} key={w}>
                    + {w}
                  </button>
                ))}
              </div>
              <div className="message-input">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Type English text or add glosses to translate…"
                />
                <button
                  onClick={() => void sendMessage()}
                  aria-label="Send message"
                  disabled={sending}
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </section>
          <aside className="chat-panel">
            <div className="chat-header">
              <div>
                <span className="online-dot" />
                <div>
                  <h2>Translation</h2>
                  <p>
                    {groqConfigured === "missing"
                      ? "Groq is not configured"
                      : groqConfigured === "checking"
                        ? "Checking conversation service…"
                        : groqConfigured === "unavailable"
                          ? "Conversation service unavailable"
                          : "Groq ready"}{" "}
                    · {language === "en" ? "English" : language === "hi" ? "हिन्दी" : "ಕನ್ನಡ"}
                  </p>
                </div>
              </div>
              <label className="language-select conversation-language">
                <span className="language-dot">
                  {language === "en" ? "EN" : language === "hi" ? "हि" : "ಕ"}
                </span>
                <select
                  aria-label="Conversation language"
                  value={language}
                  onChange={(event) => {
                    const selected = event.target.value as "en" | "hi" | "kn";
                    languageRef.current = selected;
                    setLanguage(selected);
                  }}
                >
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                  <option value="kn">ಕನ್ನಡ</option>
                </select>
                <ChevronDown size={14} />
              </label>
            </div>
            <div className="messages" aria-live="polite">
              {messages.length === 0 && (
                <p className="conversation-empty">
                  Recognized signs and their translations will appear here.
                </p>
              )}
              {messages.map((message) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="message user"
                  key={message.id}
                >
                  <div className="message-meta">
                    <span>YOU SIGNED</span>
                    <small>{message.time}</small>
                  </div>
                  <div className="message-bubble">
                    <p>{message.text}</p>
                    {message.pending && <small className="message-progress">Translating…</small>}
                    {message.translated && (
                      <div className="translation-result">
                        <strong>TRANSLATION</strong>
                        <p>{message.translated}</p>
                        <button
                          className="audio-player"
                          onClick={() => void playMessage(message)}
                          disabled={audioLoadingId === message.id}
                          aria-label={
                            audioLoadingId === message.id
                              ? "Generating translation speech"
                              : playing === message.id
                                ? "Pause translation audio"
                                : "Play translation audio"
                          }
                        >
                          {audioLoadingId === message.id ? (
                            <span className="audio-loading" />
                          ) : playing === message.id ? (
                            <Pause size={15} />
                          ) : (
                            <Play size={15} />
                          )}
                          <span className={playing === message.id ? "wave playing" : "wave"}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                              <i key={i} />
                            ))}
                          </span>
                          <small>
                            {audioLoadingId === message.id
                              ? "Loading"
                              : playing === message.id
                                ? "Pause"
                                : "Play"}
                          </small>
                        </button>
                        {message.audioError && (
                          <small className="audio-error">{message.audioError}</small>
                        )}
                      </div>
                    )}
                    {message.error && (
                      <div className="message-error">
                        <small>{message.error}</small>
                        <button
                          onClick={() =>
                            void requestTranslation(
                              message,
                              message.targetLanguage ?? languageRef.current,
                            )
                          }
                          disabled={message.pending}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="chat-footer">
              <AudioLines size={18} />
              <div>
                <strong>Voice output is {voiceOn ? "on" : "off"}</strong>
                <small>
                  {voiceOn
                    ? `Translations play automatically in ${language === "en" ? "English" : language === "hi" ? "Hindi" : "Kannada"}`
                    : "Translations can be played manually"}
                </small>
              </div>
              <button
                className={voiceOn ? "toggle on" : "toggle"}
                onClick={() => setVoiceOn(!voiceOn)}
              >
                <i />
              </button>
            </div>
          </aside>
        </div>
      </main>
      <div className="session-controls desktop-controls">
        <button
          className={voiceOn ? "control active" : "control"}
          onClick={() => setVoiceOn(!voiceOn)}
          aria-label="Toggle voice output"
        >
          {voiceOn ? <Mic2 /> : <VolumeX />}
          <span>Voice</span>
        </button>
        <button
          className={cameraOn ? "control active" : "control"}
          onClick={toggleCamera}
          disabled={
            cameraStatus === "requesting" ||
            recordingStatus === "recording" ||
            recordingStatus === "saving"
          }
          aria-label="Toggle camera"
        >
          {cameraOn ? <Camera /> : <CameraOff />}
          <span>Camera</span>
        </button>
        <button className="end-btn" onClick={() => navigate("/history")}>
          <CircleStop size={17} /> End session
        </button>
      </div>
    </div>
  );
}
