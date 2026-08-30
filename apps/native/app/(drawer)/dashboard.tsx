import { Column } from "@expo/ui";
import { useQuery } from "@tanstack/react-query";
import type { Prediction } from "@ttc/domain";

import { Body, Card, Chip, Heading, Screen, SkeletonList } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useDevUser } from "@/lib/dev-user";

// Phase 5 — the shared dashboard. It shows ONLY what the partner consented to
// share; the server returns nulls for anything not granted, so this screen never
// makes the privacy decision itself.

type Dash = {
  partner: { userId: string; displayName: string | null; role: string | null } | null;
  habit: Record<string, unknown> | null;
  fertileWindow: Prediction | null;
};

function habitLine(h: Record<string, unknown>): string {
  const parts = [
    h.alcoholUnits != null && `🍷 ${h.alcoholUnits}`,
    h.cigarettes != null && `🚬 ${h.cigarettes}`,
    h.exerciseMinutes != null && `🏃 ${h.exerciseMinutes}m`,
    h.sleepHours != null && `😴 ${h.sleepHours}h`,
    h.heatExposure ? "🔥 heat" : null,
    h.stressLevel != null && `stress ${h.stressLevel}/5`,
  ].filter(Boolean);
  return `${h.date}: ${parts.length ? parts.join("  ·  ") : "—"}`;
}

export default function Dashboard() {
  const { role } = useDevUser();

  const q = useQuery({
    queryKey: ["dashboard", role],
    queryFn: () => apiFetch<Dash>("/api/dashboard"),
  });

  const d = q.data;
  const fw = d?.fertileWindow;

  return (
    <Screen eyebrow="Together" title="Shared dashboard" subtitle="What the two of you have chosen to share, in one calm view.">
      {q.isLoading && <SkeletonList rows={2} />}

      {d && !d.partner && (
        <Card>
          <Body tone="muted">Not linked to a partner yet. Send an invite from To-dos & invite.</Body>
        </Card>
      )}

      {d?.partner && (
        <Card variant="olive" spacing={8}>
          <Body tone="onPrimary" size={12} weight="600">YOUR PARTNER</Body>
          <Body tone="onPrimary" size={18} weight="bold">{d.partner.displayName ?? d.partner.userId.slice(0, 8)}</Body>
          {d.partner.role ? (
            <Column style={{ paddingTop: 4 }}>
              <Chip label={d.partner.role} tone="accent" />
            </Column>
          ) : null}
        </Card>
      )}

      <Heading>Her fertile window</Heading>
      <Card variant={fw && fw.status !== "insufficient_data" ? "accent" : "surface"} spacing={8}>
        {fw ? (
          fw.status === "insufficient_data" ? (
            <Body tone="muted">{fw.message}</Body>
          ) : (
            <Column spacing={4}>
              <Body tone="onAccent" size={17} weight="bold">{`Fertile  ${fw.fertileWindow.start} → ${fw.fertileWindow.end}`}</Body>
              <Body tone="onAccent" size={13}>{`Next period ~ ${fw.nextPeriodStart} · confidence ${fw.confidence}`}</Body>
            </Column>
          )
        ) : (
          <Body tone="muted">Not shared.</Body>
        )}
      </Card>

      <Heading>His habits (latest)</Heading>
      <Card>
        <Body>{d?.habit ? habitLine(d.habit) : "Not shared."}</Body>
      </Card>

      <Body tone="muted" size={12}>Guidance, not medical advice.</Body>
    </Screen>
  );
}
