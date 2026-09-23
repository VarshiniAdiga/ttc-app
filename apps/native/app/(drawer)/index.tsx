import { Row } from "@expo/ui";
import { DEV_USERS, type DevRole } from "@ttc/config/dev-users";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import { Body, Card, Chip, Heading, PillButton, Screen } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useDevUser } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";
import { DEV_SWITCH_ALLOWED, useAuth } from "@/lib/session";

// Welcome / harness. When signed in with a real account, shows the account +
// sign-out; otherwise the dev user-switcher (Phase 0) plus a link to real login.
export default function Home() {
  const { role, setRole } = useDevUser();
  const session = useAuth();
  const router = useRouter();
  const user = session.data?.user;

  const health = useQuery({
    queryKey: ["health", role],
    queryFn: () => apiFetch<{ ok: boolean; appEnv: string; user: string | null }>("/health"),
  });
  const me = useQuery({
    queryKey: ["me", role],
    queryFn: () => apiFetch<{ userId: string }>("/api/me"),
  });

  return (
    <Screen eyebrow="Welcome" title="Your journey, together" subtitle="A calm, private space to track, share, and grow toward the two of you becoming three.">
      {user ? (
        <Card variant="olive" spacing={12}>
          <Body tone="onPrimary" size={13} weight="600">Signed in</Body>
          <Body tone="onPrimary" size={15}>{user.email}</Body>
          <Row spacing={12}>
            <PillButton
              variant="accent"
              label="Sign out"
              onPress={async () => {
                await authClient.signOut().catch(() => {});
                queryClient.clear();
              }}
            />
          </Row>
        </Card>
      ) : (
        <Card variant="olive" spacing={14}>
          {DEV_SWITCH_ALLOWED && (
            <>
              <Body tone="onPrimary" size={13} weight="600">You're exploring as</Body>
              <Row spacing={10}>
                {(Object.keys(DEV_USERS) as DevRole[]).map((r) => (
                  <PillButton
                    key={r}
                    label={DEV_USERS[r].label}
                    variant={role === r ? "accent" : "outline"}
                    onPress={() => setRole(r)}
                  />
                ))}
              </Row>
              <Body tone="onPrimary" size={12}>
                Switch roles anytime — each partner sees only what the other chooses to share.
              </Body>
            </>
          )}
          <Row spacing={12}>
            <PillButton variant={DEV_SWITCH_ALLOWED ? "outline" : "accent"} label="Sign in with a real account" onPress={() => router.push("/(auth)")} />
          </Row>
        </Card>
      )}

      <Heading>Connection</Heading>
      <StatusCard title="Worker health" query={health} render={(d) => `Environment: ${d.appEnv}`} ok={(d) => d.ok} />
      <StatusCard title="Your session" query={me} render={(d) => `user ${d.userId.slice(0, 8)}…`} ok={() => true} />
    </Screen>
  );
}

function StatusCard<T>({
  title,
  query,
  render,
  ok,
}: {
  title: string;
  query: UseQueryResult<T>;
  render: (d: T) => string;
  ok: (d: T) => boolean;
}) {
  const status = query.isLoading ? "…" : query.error ? "offline" : query.data && ok(query.data) ? "live" : "issue";
  const tone = status === "live" ? "accent" : "muted";
  return (
    <Card spacing={7}>
      <Row spacing={10} alignment="center">
        <Body weight="600">{title}</Body>
        <Chip label={status} tone={tone} />
      </Row>
      <Body tone="muted" size={13}>
        {query.isLoading
          ? "checking…"
          : query.error
            ? (query.error as Error).message
            : query.data
              ? render(query.data)
              : "—"}
      </Body>
    </Card>
  );
}
