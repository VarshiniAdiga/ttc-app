import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";

// Phase 9 — optional app-lock. A PIN (stored in the device keychain) gates entry;
// biometric unlock is offered when the device supports it. Native only — web has
// no SecureStore, so the lock is simply disabled there (web is a smoke-test surface).
const PIN_KEY = "ttc_pin";
const nativeSecureStore = Platform.OS !== "web";

type Ctx = {
  hasPin: boolean;
  locked: boolean;
  ready: boolean;
  setPin: (pin: string) => Promise<void>;
  disable: () => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometric: () => Promise<boolean>;
};

const AppLockContext = createContext<Ctx | null>(null);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [hasPin, setHasPin] = useState(false);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (!nativeSecureStore) {
        setReady(true);
        return;
      }
      const pin = await SecureStore.getItemAsync(PIN_KEY);
      setHasPin(!!pin);
      setLocked(!!pin); // if a PIN is set, start locked until unlocked
      setReady(true);
    })();
  }, []);

  const setPin = async (pin: string) => {
    if (!nativeSecureStore) return;
    await SecureStore.setItemAsync(PIN_KEY, pin);
    setHasPin(true);
  };
  const disable = async () => {
    if (!nativeSecureStore) return;
    await SecureStore.deleteItemAsync(PIN_KEY);
    setHasPin(false);
    setLocked(false);
  };
  const unlockWithPin = async (pin: string) => {
    if (!nativeSecureStore) return true;
    const stored = await SecureStore.getItemAsync(PIN_KEY);
    const ok = stored != null && stored === pin;
    if (ok) setLocked(false);
    return ok;
  };
  const unlockWithBiometric = async () => {
    if (!nativeSecureStore) return false;
    const has = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!has || !enrolled) return false;
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock" });
    if (res.success) setLocked(false);
    return res.success;
  };

  return (
    <AppLockContext.Provider value={{ hasPin, locked, ready, setPin, disable, unlockWithPin, unlockWithBiometric }}>
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock(): Ctx {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used within AppLockProvider");
  return ctx;
}
