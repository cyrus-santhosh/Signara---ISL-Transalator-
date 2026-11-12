const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function authenticate(path: string, email: string, password: string) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const result = (await response.json()) as {
    user?: { id: string; email: string; name: string };
    token?: string;
    detail?: string;
  };
  if (!response.ok || !result.user || !result.token) {
    throw new Error(result.detail ?? `Authentication failed with status ${response.status}.`);
  }
  sessionStorage.setItem("signara-token", result.token);
  return result.user;
}

export async function signIn(email: string, password: string) {
  return authenticate("/api/auth/login", email, password);
}

export async function signUp(email: string, password: string) {
  return authenticate("/api/auth/register", email, password);
}

export async function signOut() {
  sessionStorage.removeItem("signara-token");
  return true;
}
