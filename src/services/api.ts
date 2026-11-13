import type { KeypointFrame } from "./signSocket";

export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  translated?: string;
  time: string;
};

export type Conversation = {
  id: string;
  title: string;
  date: string;
  language: string;
  messages: Message[];
};

export const mockConversations: Conversation[] = [
  {
    id: "c1",
    title: "At the café",
    date: "Today, 10:42 AM",
    language: "Hindi",
    messages: [
      { id: "1", role: "user", text: "I want water.", time: "10:42" },
      {
        id: "2",
        role: "assistant",
        text: "Of course. Would you like cold or room-temperature water?",
        translated: "ज़रूर। आपको ठंडा या सामान्य पानी चाहिए?",
        time: "10:42",
      },
      { id: "3", role: "user", text: "Cold water, please.", time: "10:43" },
    ],
  },
  {
    id: "c2",
    title: "Bus stop directions",
    date: "Yesterday, 6:18 PM",
    language: "Kannada",
    messages: [
      { id: "1", role: "user", text: "Where is the nearest bus stop?", time: "18:18" },
      {
        id: "2",
        role: "assistant",
        text: "Walk straight for two minutes. It is on your left.",
        time: "18:18",
      },
    ],
  },
  {
    id: "c3",
    title: "Pharmacy visit",
    date: "12 Jun, 2:05 PM",
    language: "English",
    messages: [
      { id: "1", role: "user", text: "I need medicine for a headache.", time: "14:05" },
      {
        id: "2",
        role: "assistant",
        text: "I can help you explain that to the pharmacist.",
        time: "14:05",
      },
    ],
  },
];

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export type DatasetLabel =
  | "hello_how_are_you"
  | "i_need_help"
  | "i_need_to_meet_the_doctor"
  | "no_sign";
export type DatasetCounts = Record<DatasetLabel, number>;

export type RecognitionModelStatus = {
  model_loaded: boolean;
  model_path: string;
  model_type: string;
  load_error: string | null;
  probability_threshold: number;
  probability_note: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: string | { code?: string; message?: string };
    } | null;
    const detail = typeof body?.detail === "string" ? body.detail : body?.detail?.message;
    throw new Error(detail ?? `Request failed with status ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function saveDatasetRecording(recording: {
  recordingId: string;
  label: DatasetLabel;
  timestamp: number;
  sequence: KeypointFrame[];
}) {
  return request<{
    saved: true;
    label: DatasetLabel;
    filename: string;
    counts: DatasetCounts;
  }>("/api/dataset/recording", {
    method: "POST",
    body: JSON.stringify({
      recording_id: recording.recordingId,
      label: recording.label,
      timestamp: recording.timestamp,
      frame_count: recording.sequence.length,
      sequence: recording.sequence,
    }),
  });
}

export async function getDatasetCounts() {
  return request<DatasetCounts>("/api/dataset/counts");
}

export async function getRecognitionModelStatus() {
  return request<RecognitionModelStatus>("/api/recognition/model-status");
}

export async function exportDataset() {
  const response = await fetch(`${apiBaseUrl}/api/dataset/export.zip`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `Dataset export failed with status ${response.status}.`);
  }
  return response.blob();
}

export type TranslationResult = {
  original_text: string;
  translated_text: string;
  target_language: "en" | "hi" | "kn";
  audio_url: string | null;
  audio_error: string | null;
};

export async function getTranslationStatus() {
  return request<{ groq_configured: boolean; model: string }>("/api/conversation/status");
}

export async function postTranslation(input: {
  originalText: string;
  targetLanguage: "en" | "hi" | "kn";
  eventId: string;
  generateAudio: boolean;
  recognitionLabel?: string;
}) {
  const result = await request<Omit<TranslationResult, "audio_url"> & { audio_url: string | null }>(
    "/api/conversation",
    {
      method: "POST",
      body: JSON.stringify({
        original_text: input.originalText,
        target_language: input.targetLanguage,
        event_id: input.eventId,
        generate_audio: input.generateAudio,
        recognition_label: input.recognitionLabel,
      }),
    },
  );
  return {
    ...result,
    audio_url: result.audio_url ? `${apiBaseUrl}${result.audio_url}` : null,
  };
}

export async function requestSpeech(text: string, targetLanguage: "en" | "hi" | "kn") {
  const result = await request<{ audio_url: string }>("/api/speech", {
    method: "POST",
    body: JSON.stringify({ text, target_language: targetLanguage }),
  });
  return `${apiBaseUrl}${result.audio_url}`;
}

export async function getConversations() {
  return mockConversations;
}

export async function getConversation(id: string) {
  return mockConversations.find((item) => item.id === id) ?? null;
}
