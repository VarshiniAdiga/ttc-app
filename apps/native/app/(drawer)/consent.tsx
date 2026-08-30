import { Switch } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Body, Card, Screen } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useDevUser } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";

// Phase 5 — consent capture. Each switch is one shareable category, default-OFF.
// The server (not this screen) enforces access; flipping a switch just records
// the choice. The shared dashboard reflects it on the partner's next load.

const BY_ROLE: Record<string, { key: string; label: string }[]> = {
  her: [
    { key: "fertile_window", label: "Fertile window (estimate)" },
    { key: "cycle", label: "Period / cycle" },
    { key: "bbt", label: "Basal temperature" },
    { key: "opk", label: "Ovulation tests" },
    { key: "mucus", label: "Cervical mucus" },
    { key: "symptom", label: "Symptoms" },
  ],
  him: [{ key: "habit", label: "Daily habits" }],
};

type ConsentRow = { category: string; granted: boolean };

export default function Consent() {
  const { role } = useDevUser();
  const categories = BY_ROLE[role] ?? [];

  const list = useQuery({
    queryKey: ["consent", role],
    queryFn: () => apiFetch<{ consent: ConsentRow[] }>("/api/consent"),
  });
  const granted = new Map((list.data?.consent ?? []).map((r) => [r.category, r.granted]));

  const flip = useMutation({
    mutationFn: (v: { category: string; granted: boolean }) =>
      apiFetch("/api/consent", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["consent", role] }),
  });

  return (
    <Screen eyebrow="Privacy first" title="What you share" subtitle="Everything is private by default. Turn on only what you want your partner to see.">
      {flip.error && <Body tone="error" size={13}>{(flip.error as Error).message}</Body>}

      {categories.map((cat) => (
        <Card key={cat.key}>
          <Switch
            value={granted.get(cat.key) ?? false}
            onValueChange={(v) => flip.mutate({ category: cat.key, granted: v })}
            label={cat.label}
          />
        </Card>
      ))}
    </Screen>
  );
}
