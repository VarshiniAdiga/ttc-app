import { env } from "@ttc/env/native";

import { getDevUserId } from "./dev-user";

// Shared API client. Sends the dev user via x-dev-user-id (Phase 10 swaps this for a session cookie).
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.EXPO_PUBLIC_SERVER_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-dev-user-id": getDevUserId(),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
