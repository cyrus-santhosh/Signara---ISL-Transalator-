import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AudioLines,
  Camera,
  CameraOff,
  ChevronDown,
  CircleStop,
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
import { postChat } from "../services/api";

const KeypointScene = lazy(() => import("../components/KeypointScene"));
type SessionMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  sub?: string;
  time: string;
  audioUrl?: string;
};

const starterMessages: SessionMessage[] = [
  { id: 1, role: "user", text: "I want water.", time: "10:42" },
  {
    id: 2,
    role: "assistant",
    text: "ज़रूर। आपको ठंडा या सामान्य पानी चाहिए?",
    sub: "Of course. Would you like cold or room-temperature water?",
    time: "10:42",
  },
];
const skeletonNodes = [
  [50, 15],
  [50, 26],
  [32, 38],
  [68, 38],
  [23, 58],
  [77, 58],
  [18, 78],
  [82, 78],
  [50, 51],
  [40, 70],
  [60, 70],
  [35, 92],
  [65, 92],
];

export function SessionPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [language, setLanguage] = useState("Hindi");
  const [glosses, setGlosses] = useState([
    { word: "I", score: 98 },
    { word: "WATER", score: 94 },
    { word: "WANT", score: 91 },
  ]);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<SessionMessage[]>(starterMessages);
  const [playing, setPlaying] = useState(0);
  const [chatError, setChatError] = useState("");
  const [sending, setSending] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      audioRef.current?.pause();
    },
    [],
  );
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOn]);
  async function toggleCamera() {
    if (cameraOn) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setCameraOn(false);
    }
  }
  function addGloss(word: string) {
    setGlosses((old) => [...old, { word, score: Math.floor(90 + Math.random() * 9) }].slice(-5));
  }
  async function sendMessage() {
    const submittedGlosses = text.trim()
      ? text.trim().split(/\s+/)
      : glosses.map((gloss) => gloss.word);
    if (!submittedGlosses.length) return;
    const sentence = submittedGlosses.join(" ").toLowerCase();
    const user: SessionMessage = {
      id: Date.now(),
      role: "user",
      text: sentence.replace(/^./, (c) => c.toUpperCase()) + ".",
      time: "Now",
    };
    setMessages((old) => [...old, user]);
    setText("");
    setChatError("");
    setSending(true);
    try {
      const result = await postChat(submittedGlosses, language);
      setMessages((old) =>
        old.map((message) =>
          message.id === user.id ? { ...message, text: result.sentence } : message,
        ),
      );
      const assistantMessage: SessionMessage = {
        id: Date.now() + 1,
        role: "assistant",
        text: result.replyText,
        sub: result.replyOriginal,
        time: "Now",
        audioUrl: result.audioUrl,
      };
      setMessages((old) => [...old, assistantMessage]);
      if (voiceOn && result.audioUrl) {
        const audio = new Audio(result.audioUrl);
        audioRef.current = audio;
        audio.onended = () => setPlaying(0);
        setPlaying(assistantMessage.id);
        void audio.play().catch(() => setPlaying(0));
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "The message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  function playMessage(message: SessionMessage) {
    if (!message.audioUrl) return;
    if (playing === message.id) {
      audioRef.current?.pause();
      setPlaying(0);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(message.audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlaying(0);
    setPlaying(message.id);
    void audio.play().catch(() => setPlaying(0));
  }
  return (
    <div className="app-frame">
      <AppSidebar />
      <main className="app-main session-main">
        <AppTopbar title="Live conversation" subtitle="Your signs are translated in real time">
          <label className="language-select">
            <span className="language-dot">अ</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {["Hindi", "Kannada", "Tamil", "English"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>
        </AppTopbar>
        <div className="session-controls mobile-controls">
          <button
            className={voiceOn ? "control active" : "control"}
            onClick={() => setVoiceOn(!voiceOn)}
          >
            {voiceOn ? <Volume2 /> : <VolumeX />}
          </button>
          <button className={cameraOn ? "control active" : "control"} onClick={toggleCamera}>
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
                <video ref={videoRef} autoPlay playsInline muted />
              ) : (
                <div className="camera-placeholder">
                  <div className="camera-ring">
                    <Hand />
                  </div>
                  <h2>Camera is off</h2>
                  <p>Turn it on to start recognising your signs.</p>
                  <button className="btn btn-light" onClick={toggleCamera}>
                    <Camera size={18} /> Turn on camera
                  </button>
                </div>
              )}
              {cameraOn && (
                <div className="keypoint-overlay">
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-label="MediaPipe keypoint overlay placeholder"
                  >
                    <path d="M50 15V26L32 38 23 58 18 78M50 26l18 12 9 20 5 20M50 26v25L40 70l-5 22M50 51l10 19 5 22" />
                    {skeletonNodes.map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r="1.3" />
                    ))}
                  </svg>
                </div>
              )}
              <div className="video-status-row">
                <span className="recording-badge">
                  <i /> LIVE
                </span>
                <span className={`state-badge ${paused ? "paused" : ""}`}>
                  {paused ? <Pause size={14} /> : <Sparkles size={14} />}{" "}
                  {paused ? "Paused" : "Signing"}
                </span>
              </div>
              <div className="mini-hand-card">
                <Suspense fallback={null}>
                  <KeypointScene mini />
                </Suspense>
                <div>
                  <small>HAND TRACKING</small>
                  <strong>{cameraOn ? "Stable · 98%" : "Ready"}</strong>
                </div>
              </div>
              <div className="caption-bar">
                <span>ISL</span>
                <p>
                  {glosses.length
                    ? glosses
                        .map((g) => g.word.toLowerCase())
                        .join(" ")
                        .replace(/^./, (c) => c.toUpperCase()) + "."
                    : "Start signing…"}
                  <i />
                </p>
              </div>
            </div>
            <div className="gloss-row">
              <div>
                <span className="gloss-label">LIVE GLOSSES</span>
                <AnimatePresence>
                  {glosses.map((g, i) => (
                    <motion.button
                      key={`${g.word}-${i}`}
                      className="gloss-chip"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {g.word}
                      <small>{g.score}%</small>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
              <button className="pause-btn" onClick={() => setPaused(!paused)}>
                {paused ? <Play size={17} /> : <Pause size={17} />} {paused ? "Resume" : "Pause"}
              </button>
            </div>
            <div className="fallback-card">
              <div className="fallback-header">
                <div>
                  <span>
                    <Plus />
                  </span>
                  <div>
                    <strong>Manual input</strong>
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
                  placeholder="Type a message or add glosses above…"
                />
                <button onClick={sendMessage} aria-label="Send message" disabled={sending}>
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
                  <h2>Conversation</h2>
                  <p>Translating to {language}</p>
                </div>
              </div>
              <button className="icon-btn">
                <MoreHorizontal />
              </button>
            </div>
            <div className="messages">
              <div className="conversation-start">
                <span>
                  <Sparkles size={16} />
                </span>
                <p>Conversation started</p>
                <small>Today, 10:42 AM</small>
              </div>
              {messages.map((message) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`message ${message.role}`}
                  key={message.id}
                >
                  <div className="message-meta">
                    <span>{message.role === "user" ? "You signed" : "Signara"}</span>
                    <small>{message.time}</small>
                  </div>
                  <div className="message-bubble">
                    <p>{message.text}</p>
                    {message.sub && <small>{message.sub}</small>}
                  </div>
                  {message.role === "assistant" && (
                    <button
                      className="audio-player"
                      onClick={() => playMessage(message)}
                      disabled={!message.audioUrl}
                    >
                      {playing === message.id ? <Pause size={15} /> : <Play size={15} />}
                      <span className={playing === message.id ? "wave playing" : "wave"}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                          <i key={i} />
                        ))}
                      </span>
                      <small>0:08</small>
                    </button>
                  )}
                </motion.div>
              ))}
              {chatError && (
                <p className="form-error" role="alert">
                  {chatError}
                </p>
              )}
            </div>
            <div className="chat-footer">
              <AudioLines size={18} />
              <div>
                <strong>Voice output is {voiceOn ? "on" : "off"}</strong>
                <small>
                  {voiceOn
                    ? `Replies play automatically in ${language}`
                    : "Turn on to hear replies"}
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
