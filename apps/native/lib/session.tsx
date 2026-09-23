import { env } from "@ttc/env/native";
import { createContext, useContext, useEffect, type ReactNode } from "react";

import { authClient } from "./auth-client";
import { setRealMode } from "./auth-mode";
import { queryClient } from "./query";

// The dev user-switcher is a non-production convenience. Set
// EXPO_PUBLIC_ALLOW_DEV_SWITCH=false (production) to force real login.
export const DEV_SWITCH_ALLOWED = env.EXPO_PUBLIC_ALLOW_DEV_SWITCH !== "false";

type Session = ReturnType<typeof authClient.useSession>;

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  // When a real session appears/disappears, flip apiFetch's auth source and drop
  // cached data so screens refetch as the new (or no) user.
  useEffect(() => {
    setRealMode(!!userId);
    queryClient.invalidateQueries();
  }, [userId]);

  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useAuth(): Session {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within SessionProvider");
  return ctx;
}
