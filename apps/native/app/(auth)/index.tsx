import { Row } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";

import { Body, Card, Chip, Heading, Input, PillButton, Screen } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/lib/query";
import { useAuth } from "@/lib/session";

// Phase 10 — real login (Better Auth) + onboarding. Signed out → email/password
// forms. Signed in but no role yet → onboarding role selection. Signed in with a
// role → hand off to the app. Everything built in Phases 1–9 keeps working; only
// the source of the user id changed (dev switcher → verified session).

type Profile = { role: string | null };
type Mode = "sign-in" | "sign-up" | "reset";

export default function AuthScreen() {
  const session = useAuth();
  const user = session.data?.user;

  const profile = useQuery({
    queryKey: ["profile", "real", user?.id],
    queryFn: () => apiFetch<{ profile: Profile | null }>("/api/profile"),
    enabled: !!user,
  });

  if (user) {
    if (profile.isLoading) {
      return (
        <Screen title="One moment…" subtitle="Setting up your space.">
          <Card spacing={8}><Body tone="muted" size={13}>Loading your profile…</Body></Card>
        </Screen>
      );
    }
    if (profile.data?.profile?.role) return <Redirect href="/(drawer)" />;
    return <Onboarding userId={user.id} />;
  }

  return <AuthForms />;
}

function AuthForms() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      setError(null);
      setInfo(null);
      if (mode === "sign-up") {
        const r = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
        if (r.error) throw new Error(r.error.message || "Could not sign up");
      } else if (mode === "sign-in") {
        const r = await authClient.signIn.email({ email: email.trim(), password });
        if (r.error) throw new Error(r.error.message || "Could not sign in");
      } else {
        const r = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "ttc://reset" });
        if (r.error) throw new Error(r.error.message || "Could not send reset email");
        setInfo("If an account exists, a reset link is on its way.");
      }
    },
    onError: (e) => setError((e as Error).message),
  });

  const title = mode === "sign-up" ? "Create your account" : mode === "reset" ? "Reset password" : "Welcome back";

  return (
    <Screen eyebrow="Trying, together" title={title} subtitle="Private by design. Your data is encrypted and never sold.">
      <Card spacing={12}>
        {mode === "sign-up" && <Input onChangeText={setName} placeholder="Your name" autoCapitalize="sentences" />}
        <Input onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
        {mode !== "reset" && <Input onChangeText={setPassword} placeholder="Password (8+ characters)" secureTextEntry />}

        {error && <Body tone="error" size={13}>{error}</Body>}
        {info && <Body tone="accent" size={13}>{info}</Body>}

        <Row spacing={12}>
          <PillButton
            label={submit.isPending ? "…" : mode === "sign-up" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
            disabled={submit.isPending}
            onPress={() => submit.mutate()}
          />
        </Row>
      </Card>

      <Card variant="feature" spacing={10}>
        {mode !== "sign-in" && <PillButton variant="ghost" label="Have an account? Sign in" onPress={() => setMode("sign-in")} />}
        {mode !== "sign-up" && <PillButton variant="ghost" label="New here? Create an account" onPress={() => setMode("sign-up")} />}
        {mode !== "reset" && <PillButton variant="ghost" label="Forgot your password?" onPress={() => setMode("reset")} />}
      </Card>
    </Screen>
  );
}

const ROLES = [
  { role: "her" as const, label: "I'm tracking my cycle", sub: "Period, temperature, ovulation tests, symptoms." },
  { role: "him" as const, label: "I'm tracking my habits", sub: "Sleep, alcohol, exercise, stress and more." },
];

function Onboarding({ userId }: { userId: string }) {
  const router = useRouter();
  const [role, setRole] = useState<"her" | "him" | null>(null);

  const save = useMutation({
    mutationFn: () => apiFetch("/api/profile", { method: "POST", body: JSON.stringify({ role }) }),
    onSuccess: () => {
      // Write the known result directly instead of invalidating — a refetch
      // would flip profile.isLoading on this still-mounted screen mid-nav and
      // tear down the @expo/ui Host tree while it's transitioning (see
      // ttc-known-issues: disposed-view races → Compose crash).
      queryClient.setQueryData(["profile", "real", userId], { profile: { role } });
      router.replace("/(drawer)");
    },
  });

  return (
    <Screen eyebrow="Welcome" title="Which of you is this?" subtitle="This sets up the right tracker for you. You can link with your partner later.">
      {ROLES.map((r) => {
        const selected = role === r.role;
        return (
          <Card key={r.role} variant={selected ? "accent" : "feature"} spacing={6} onPress={() => setRole(r.role)}>
            <Row spacing={10} alignment="center">
              <Heading>{r.label}</Heading>
              {selected && <Chip label="Selected" tone="olive" />}
            </Row>
            <Body tone={selected ? "onAccent" : "muted"} size={13}>{r.sub}</Body>
          </Card>
        );
      })}
      <Row spacing={12}>
        <PillButton label={save.isPending ? "Saving…" : "Continue"} disabled={!role || save.isPending} onPress={() => save.mutate()} />
      </Row>
      {save.error && <Body tone="error" size={13}>{(save.error as Error).message}</Body>}
    </Screen>
  );
}
