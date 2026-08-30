import { Row } from "@expo/ui";
import { DEV_USERS, type DevRole } from "@ttc/config/dev-users";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { Body, Card, Chip, Heading, PillButton, Screen } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useDevUser } from "@/lib/dev-user";

// Phase 0 dev harness, reskinned. Switch between the two fake users and confirm
// the app can reach the Worker as each. The real auth screens return in Phase 10.
export default function Home() {
  const { role, setRole } = useDevUser();

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
      <Card variant="olive" spacing={14}>
        <Body tone="onPrimary" size={13} weight="600">
          You're exploring as
        </Body>
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
      </Card>

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
