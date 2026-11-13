export type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility: number | null;
  presence: number | null;
};

export type LandmarkSet = Landmark[] | null;

export type KeypointFrame = {
  type: "keypoints";
  timestamp: number;
  frameNumber: number;
  landmarks: {
    leftHand: LandmarkSet;
    rightHand: LandmarkSet;
    pose: LandmarkSet;
  };
};

export type RecognitionResponse = {
  type: "recognition";
  timestamp: number;
  frameNumber: number;
  gloss: string | null;
  label:
    | "hello_how_are_you"
    | "i_need_help"
    | "i_need_to_meet_the_doctor"
    | "no_sign"
    | null;
  confidence: number | null;
  probabilities: Record<string, number> | null;
  status:
    | "model_not_loaded"
    | "waiting_for_sign"
    | "recognizing"
    | "phrase_recognized"
    | "no_sign_detected"
    | "inference_error"
    | "invalid_sequence";
  error?: string | null;
};

export type SocketStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

type SignSocketCallbacks = {
  onRecognition: (result: RecognitionResponse) => void;
  onStatus: (status: SocketStatus) => void;
  onError: (message: string) => void;
};

const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 8_000;
const RECOGNITION_STATUSES = new Set<RecognitionResponse["status"]>([
  "model_not_loaded",
  "waiting_for_sign",
  "recognizing",
  "phrase_recognized",
  "no_sign_detected",
  "inference_error",
  "invalid_sequence",
]);

export class SignSocket {
  private socket?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private stopped = true;
  private generation = 0;
  private hasConnected = false;

  constructor(private readonly callbacks: SignSocketCallbacks) {}

  connect(url?: string) {
    if (!this.stopped) return;
    this.stopped = false;
    this.generation += 1;
    this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    this.hasConnected = false;
    this.openSocket(url, this.generation);
  }

  sendKeypoints(frame: KeypointFrame): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify(frame));
      return true;
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error ? error.message : "Could not send keypoints over WebSocket.",
      );
      return false;
    }
  }

  disconnect() {
    this.stopped = true;
    this.generation += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    socket?.close(1000, "Session ended.");
    this.callbacks.onStatus("disconnected");
  }

  private openSocket(url: string | undefined, generation: number) {
    if (this.stopped || generation !== this.generation) return;
    this.callbacks.onStatus(this.hasConnected ? "reconnecting" : "connecting");

    let socket: WebSocket;
    try {
      const socketUrl = new URL(url ?? "/ws/sign", window.location.href);
      socketUrl.protocol =
        socketUrl.protocol === "https:" || socketUrl.protocol === "wss:" ? "wss:" : "ws:";
      socket = new WebSocket(socketUrl.toString());
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error ? error.message : "Could not create the WebSocket connection.",
      );
      this.scheduleReconnect(url, generation);
      return;
    }

    this.socket = socket;
    socket.onopen = () => {
      if (this.stopped || generation !== this.generation) {
        socket.close();
        return;
      }
      this.hasConnected = true;
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.callbacks.onStatus("connected");
    };
    socket.onmessage = (event) => {
      if (this.stopped || generation !== this.generation) return;
      try {
        const message: unknown = JSON.parse(String(event.data));
        if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "recognition" &&
          "frameNumber" in message &&
          typeof message.frameNumber === "number" &&
          "timestamp" in message &&
          typeof message.timestamp === "number" &&
          "gloss" in message &&
          (message.gloss === null || typeof message.gloss === "string") &&
          "label" in message &&
          (message.label === null ||
            message.label === "hello_how_are_you" ||
            message.label === "i_need_help" ||
          message.label === "i_need_to_meet_the_doctor" ||
          message.label === "no_sign") &&
          "confidence" in message &&
          (message.confidence === null || typeof message.confidence === "number") &&
          "probabilities" in message &&
          (message.probabilities === null ||
            (typeof message.probabilities === "object" && message.probabilities !== null)) &&
          "status" in message &&
          typeof message.status === "string" &&
          RECOGNITION_STATUSES.has(message.status as RecognitionResponse["status"])
        ) {
          this.callbacks.onRecognition(message as RecognitionResponse);
        } else if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "error" &&
          "message" in message &&
          typeof message.message === "string"
        ) {
          this.callbacks.onError(message.message);
        } else {
          this.callbacks.onError("Received an unrecognized WebSocket response.");
        }
      } catch {
        this.callbacks.onError("Received invalid JSON from the recognition service.");
      }
    };
    socket.onerror = () => {
      if (!this.stopped && generation === this.generation) {
        this.callbacks.onError("WebSocket connection error.");
      }
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = undefined;
      if (!this.stopped && generation === this.generation) {
        this.scheduleReconnect(url, generation);
      }
    };
  }

  private scheduleReconnect(url: string | undefined, generation: number) {
    if (this.stopped || generation !== this.generation || this.reconnectTimer) return;
    this.callbacks.onStatus("reconnecting");
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.openSocket(url, generation);
    }, delay);
  }
}
