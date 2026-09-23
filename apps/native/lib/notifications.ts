import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { apiFetch } from "./api";

// Phase 9 — discreet notifications: reminders/nudges that never reveal health
// details on the lock screen. The body is deliberately vague ("a new note").
//
// Local demo (schedule) works in Expo Go / dev. Real remote push additionally
// needs an EAS projectId + APNs/FCM credentials — that's the credential-gated
// last mile, same pattern as OPK storage and the RevenueCat SDK.

export const DISCREET_TITLE = "TTC";
export const DISCREET_BODY = "You have a new note this week.";

async function ensurePermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === "granted";
}

// Ask permission, get the Expo push token, and store it on the user's profile so
// the server can send them discreet nudges. Returns the token, or null if
// unavailable (web, denied permission, or no EAS projectId).
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!(await ensurePermission())) return null;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    await apiFetch("/api/profile", { method: "POST", body: JSON.stringify({ pushToken: token }) });
    return token;
  } catch {
    return null; // typically: no projectId configured in dev
  }
}

export async function disablePush(): Promise<void> {
  await apiFetch("/api/profile", { method: "POST", body: JSON.stringify({ pushToken: null }) });
}

// Fire a discreet local notification now — the demoable path without cloud creds.
export async function sendDiscreetLocalTest(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!(await ensurePermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: DISCREET_TITLE, body: DISCREET_BODY },
    trigger: null, // deliver immediately
  });
  return true;
}
