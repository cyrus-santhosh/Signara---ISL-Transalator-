export type RecognisedGloss = { gloss: string; confidence: number };

export class SignSocket {
  private socket?: WebSocket;
  constructor(private onGloss: (result: RecognisedGloss) => void) {}

  connect(url?: string) {
    const socketUrl = new URL(url ?? "/ws/sign", window.location.href);
    socketUrl.protocol =
      socketUrl.protocol === "https:" || socketUrl.protocol === "wss:" ? "wss:" : "ws:";
    this.socket = new WebSocket(socketUrl.toString());
    this.socket.onmessage = (event) => {
      const result = JSON.parse(event.data) as RecognisedGloss | { error: string };
      if ("gloss" in result && typeof result.confidence === "number") {
        this.onGloss(result);
      }
    };
  }

  sendKeypoints(keypoints: number[][]) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "keypoints", keypoints }));
    }
  }

  disconnect() {
    this.socket?.close();
  }
}
