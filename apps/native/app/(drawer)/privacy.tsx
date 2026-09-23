import { Row } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Platform } from "react-native";

import { Body, Card, Chip, Heading, Input, PillButton, Screen } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useAppLock } from "@/lib/app-lock";
import { authClient } from "@/lib/auth-client";
import { isRealMode } from "@/lib/auth-mode";
import { useDevUser } from "@/lib/dev-user";
import { disablePush, registerForPush, sendDiscreetLocalTest } from "@/lib/notifications";
import { queryClient } from "@/lib/query";

// Phase 9 — the privacy controls the app is selling on: export everything,
// one-tap hard delete, an optional PIN/biometric app-lock, and discreet
// notifications that never leak health details.

type Profile = { role: string | null; displayName: string | null; pushToken: string | null };

async function exportData() {
  const data = await apiFetch<Record<string, unknown>>("/api/privacy/export");
  const json = JSON.stringify(data, null, 2);
  if (Platform.OS === "web") {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ttc-export.json";
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.document, "ttc-export.json");
  try {
    file.create({ overwrite: true });
  } catch {
    // already exists — write() overwrites contents
  }
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
}

export default function PrivacyScreen() {
  const { role } = useDevUser();
  const lock = useAppLock();
  const [pin, setPin] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const profile = useQuery({
    queryKey: ["profile", role],
    queryFn: () => apiFetch<{ profile: Profile | null }>("/api/profile"),
  });
  const pushOn = !!profile.data?.profile?.pushToken;

  const exportMut = useMutation({ mutationFn: exportData });

  const deleteMut = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/api/privacy/all", { method: "DELETE" }),
    onSuccess: async () => {
      if (isRealMode()) await authClient.signOut().catch(() => {});
      queryClient.clear();
      setConfirmDelete(false);
    },
  });

  const notif = useMutation({
    mutationFn: async (on: boolean) => (on ? registerForPush() : disablePush()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile", role] }),
  });

  const testNotif = useMutation({ mutationFn: sendDiscreetLocalTest });

  return (
    <Screen eyebrow="Yours alone" title="Privacy & data" subtitle="Your data is yours. Take it with you, lock it down, or erase it — all in one tap.">
      {/* Export */}
      <Card spacing={10}>
        <Heading>Export your data</Heading>
        <Body tone="muted" size={13}>Download everything we hold about you as a single JSON file.</Body>
        <Row spacing={12}>
          <PillButton
            variant="outline"
            label={exportMut.isPending ? "Preparing…" : "Export"}
            onPress={() => exportMut.mutate()}
            disabled={exportMut.isPending}
          />
        </Row>
        {exportMut.isSuccess && <Body tone="accent" size={12}>Export ready.</Body>}
        {exportMut.error && <Body tone="error" size={12}>{(exportMut.error as Error).message}</Body>}
      </Card>

      {/* App lock */}
      <Card spacing={10}>
        <Row spacing={10} alignment="center">
          <Heading>App lock</Heading>
          <Chip label={lock.hasPin ? "On" : "Off"} tone={lock.hasPin ? "accent" : "muted"} />
        </Row>
        {Platform.OS === "web" ? (
          <Body tone="muted" size={13}>App lock is available on the iOS/Android app.</Body>
        ) : lock.hasPin ? (
          <>
            <Body tone="muted" size={13}>A PIN (and biometrics, if set up) is required to open the app.</Body>
            <Row spacing={12}>
              <PillButton variant="outline" label="Turn off lock" onPress={() => lock.disable()} />
            </Row>
          </>
        ) : (
          <>
            <Body tone="muted" size={13}>Set a 4+ digit PIN to require unlock on launch.</Body>
            <Input onChangeText={setPin} placeholder="New PIN" secureTextEntry keyboardType="number-pad" maxLength={8} />
            <Row spacing={12}>
              <PillButton
                label="Set PIN"
                disabled={pin.length < 4}
                onPress={async () => {
                  await lock.setPin(pin);
                  setPin("");
                }}
              />
            </Row>
          </>
        )}
      </Card>

      {/* Notifications */}
      <Card spacing={10}>
        <Row spacing={10} alignment="center">
          <Heading>Discreet notifications</Heading>
          <Chip label={pushOn ? "On" : "Off"} tone={pushOn ? "accent" : "muted"} />
        </Row>
        <Body tone="muted" size={13}>Reminders and nudges — always worded so nothing sensitive shows on your lock screen.</Body>
        <Row spacing={12}>
          <PillButton
            variant={pushOn ? "outline" : "primary"}
            label={notif.isPending ? "…" : pushOn ? "Turn off" : "Turn on"}
            disabled={notif.isPending}
            onPress={() => notif.mutate(!pushOn)}
          />
          <PillButton variant="ghost" label="Send test" onPress={() => testNotif.mutate()} />
        </Row>
        {testNotif.data === false && <Body tone="muted" size={12}>Notifications aren’t available here (web or permission denied).</Body>}
      </Card>

      {/* Delete everything */}
      <Card variant="feature" spacing={10}>
        <Heading>Delete everything</Heading>
        <Body tone="muted" size={13}>Permanently erases your account and all data — logs, photos, sharing, coaching. This cannot be undone.</Body>
        {!confirmDelete ? (
          <Row spacing={12}>
            <PillButton variant="outline" label="Delete my data" onPress={() => setConfirmDelete(true)} />
          </Row>
        ) : (
          <>
            <Body tone="error" size={13} weight="600">Are you absolutely sure? Everything will be gone.</Body>
            <Row spacing={12}>
              <PillButton variant="ghost" label="Cancel" onPress={() => setConfirmDelete(false)} />
              <PillButton
                variant="accent"
                label={deleteMut.isPending ? "Deleting…" : "Yes, delete"}
                disabled={deleteMut.isPending}
                onPress={() => deleteMut.mutate()}
              />
            </Row>
          </>
        )}
        {deleteMut.isSuccess && <Body tone="accent" size={13}>Your data has been erased.</Body>}
        {deleteMut.error && <Body tone="error" size={12}>{(deleteMut.error as Error).message}</Body>}
      </Card>
    </Screen>
  );
}
