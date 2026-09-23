import { env } from "@ttc/env/native";

import { authClient } from "./auth-client";
import { isRealMode } from "./auth-mode";
import { getDevUserId } from "./dev-user";

// Shared API client. Auth is picked per request (see auth-mode): a real Better
// Auth session cookie once signed in, otherwise the dev user-switcher header.
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const auth: Record<string, string> = isRealMode()
    ? { Cookie: (await authClient.getCookie()) || "" } // native; web uses credentials below
    : { "x-dev-user-id": getDevUserId() };

  const res = await fetch(`${env.EXPO_PUBLIC_SERVER_URL}${path}`, {
    credentials: "include", // carry the session cookie on web
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...auth,
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
