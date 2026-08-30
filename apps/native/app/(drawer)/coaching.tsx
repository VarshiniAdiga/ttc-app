import { Row, Switch } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Body, Card, Chip, EmptyState, Heading, PillButton, Screen, SkeletonList } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useDevUser } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";

// Phase 7 — coaching (the paid feature). The server generates one action per
// partner from the rules engine and gates reading it behind a pro flag. The dev
// pro toggle + "generate" button stand in for RevenueCat (Phase 8) and the
// weekly cron (Phase 11).

type Coaching = { id: string; ruleId: string; ruleVersion: number; body: string; weekOf: string };

export default function CoachingScreen() {
  const { role } = useDevUser();

  const pro = useQuery({
    queryKey: ["pro-status", role],
    queryFn: () => apiFetch<{ isPro: boolean }>("/api/coaching/pro-status"),
  });

  const list = useQuery({
    queryKey: ["coaching", role],
    queryFn: async () => {
      try {
        return await apiFetch<{ coaching: Coaching[] }>("/api/coaching");
      } catch (e) {
        if ((e as Error).message.startsWith("402")) return { coaching: [] as Coaching[] };
        throw e;
      }
    },
  });

  const setPro = useMutation({
    mutationFn: (isPro: boolean) => apiFetch("/api/coaching/dev-pro", { method: "POST", body: JSON.stringify({ isPro }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pro-status", role] });
      queryClient.invalidateQueries({ queryKey: ["coaching", role] });
    },
  });

  const generate = useMutation({
    mutationFn: () => apiFetch<{ generated: number }>("/api/coaching/generate", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coaching", role] }),
  });

  const isPro = pro.data?.isPro ?? false;

  return (
    <Screen eyebrow="Premiere Plus" title="Your coaching" subtitle="Gentle, personalized guidance for the week — grounded in what you've both logged.">
      {!isPro ? (
        <Card variant="olive" spacing={14}>
          <Row spacing={10} alignment="center">
            <Body tone="onPrimary" size={22} weight="bold">Unlock coaching</Body>
            <Chip label="Pro" tone="accent" />
          </Row>
          <Body tone="onPrimary" size={14}>
            Deeper insights and gentle guidance, when you're ready. The server refuses to send coaching
            without Pro — the client can't unlock it on its own.
          </Body>
          <Row spacing={12}>
            <PillButton variant="accent" label="Try 7 days for free" onPress={() => setPro.mutate(true)} disabled={setPro.isPending} />
          </Row>
        </Card>
      ) : (
        <Card spacing={10}>
          <Row spacing={10} alignment="center">
            <Body weight="600">Pro active (dev toggle)</Body>
            <Switch value={isPro} onValueChange={(v) => setPro.mutate(v)} label="" />
          </Row>
          <Body tone="muted" size={12}>Real subscriptions arrive in Phase 8. This fakes the entitlement.</Body>
        </Card>
      )}

      {isPro && (
        <>
          <Row spacing={12}>
            <PillButton label={generate.isPending ? "Generating…" : "Generate this week"} onPress={() => generate.mutate()} disabled={generate.isPending} />
          </Row>
          {generate.data && <Body tone="muted" size={13}>{`Generated ${generate.data.generated} action(s) for the couple.`}</Body>}
          {generate.error && <Body tone="error" size={13}>{(generate.error as Error).message}</Body>}

          <Heading>This week's guidance</Heading>
          {list.isLoading ? (
            <SkeletonList rows={2} />
          ) : list.data && list.data.coaching.length > 0 ? (
            list.data.coaching.map((c) => (
              <Card key={c.id} variant="feature" spacing={6}>
                <Body tone="muted" size={12}>{`Week of ${c.weekOf} · ${c.ruleId} v${c.ruleVersion}`}</Body>
                <Body size={15}>{c.body}</Body>
              </Card>
            ))
          ) : (
            <EmptyState title="No coaching yet" subtitle="Tap “Generate this week” after you’ve both logged some data." />
          )}
        </>
      )}
    </Screen>
  );
}
