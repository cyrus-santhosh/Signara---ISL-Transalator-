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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `Request failed with status ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function postChat(glosses: string[], targetLanguage: string) {
  const languageCodes: Record<string, string> = {
    Hindi: "hi",
    Kannada: "kn",
    Tamil: "ta",
    English: "en",
  };
  return request<{
    sentence: string;
    replyText: string;
    replyOriginal: string;
    audioUrl: string;
  }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      glosses,
      target_lang: languageCodes[targetLanguage] ?? targetLanguage,
    }),
  });
}

export async function getConversations() {
  return mockConversations;
}

export async function getConversation(id: string) {
  return mockConversations.find((item) => item.id === id) ?? null;
}
