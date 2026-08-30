import { DEV_USERS, type DevRole } from "@ttc/config/dev-users";
import { createContext, useContext, useState, type ReactNode } from "react";

// Module-level so the plain apiFetch() can read the current id without React.
let currentUserId: string = DEV_USERS.her.id;
export function getDevUserId(): string {
  return currentUserId;
}

type Ctx = { role: DevRole; setRole: (role: DevRole) => void };
const DevUserContext = createContext<Ctx | null>(null);

export function DevUserProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<DevRole>("her");
  const setRole = (r: DevRole) => {
    currentUserId = DEV_USERS[r].id;
    setRoleState(r);
  };
  return <DevUserContext.Provider value={{ role, setRole }}>{children}</DevUserContext.Provider>;
}

export function useDevUser(): Ctx {
  const ctx = useContext(DevUserContext);
  if (!ctx) throw new Error("useDevUser must be used within DevUserProvider");
  return ctx;
}
