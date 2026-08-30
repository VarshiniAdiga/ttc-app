import { Picker, Row, Switch, TextInput } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Body, Card, EmptyState, Field, Heading, PillButton, Screen, SkeletonList, WeekStrip } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useDevUser } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";

// Phase 4 — his daily habit log. Upsert-by-day over /api/logs/habit; RLS keeps
// each entry private to him until he grants the `habit` consent category.

type Entry = { id: string; date: string; [k: string]: unknown };

const today = () => new Date().toISOString().slice(0, 10);
const num = (s: string) => (s.trim() === "" ? null : Number(s));

function describe(e: Entry): string {
  const parts = [
    e.alcoholUnits != null && `🍷 ${e.alcoholUnits}`,
    e.cigarettes != null && `🚬 ${e.cigarettes}`,
    e.exerciseMinutes != null && `🏃 ${e.exerciseMinutes}m`,
    e.sleepHours != null && `😴 ${e.sleepHours}h`,
    e.heatExposure ? "🔥 heat" : null,
    e.stressLevel != null && `stress ${e.stressLevel}/5`,
  ].filter(Boolean);
  return parts.length ? parts.join("  ·  ") : "—";
}

export default function Habits() {
  const { role } = useDevUser();

  const [date, setDate] = useState(today());
  const [f, setF] = useState<Record<string, string>>({});
  const [heat, setHeat] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const list = useQuery({
    queryKey: ["logs", "habit", role],
    queryFn: () => apiFetch<{ entries: Entry[] }>("/api/logs/habit"),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["logs", "habit", role] });

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/api/logs/habit", {
        method: "POST",
        body: JSON.stringify({
          date,
          alcoholUnits: num(f.alcoholUnits ?? ""),
          cigarettes: num(f.cigarettes ?? ""),
          exerciseMinutes: num(f.exerciseMinutes ?? ""),
          sleepHours: num(f.sleepHours ?? ""),
          heatExposure: heat,
          stressLevel: f.stressLevel ? Number(f.stressLevel) : null,
          notes: f.notes || null,
        }),
      }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (d: string) => apiFetch(`/api/logs/habit/${d}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <Screen eyebrow="His habits" title="Daily habits" subtitle="Small choices, compounded. Private to you until you choose to share.">
      {role !== "him" && (
        <Card variant="accent">
          <Body tone="onAccent" size={13} weight="600">This is his log — switch to Him on Home to edit.</Body>
        </Card>
      )}

      <WeekStrip value={date} onChange={setDate} />

      <NumField k="alcoholUnits" label="Alcohol (units)" value={f.alcoholUnits} onChange={set} />
      <NumField k="cigarettes" label="Cigarettes" value={f.cigarettes} onChange={set} />
      <NumField k="exerciseMinutes" label="Exercise (min)" value={f.exerciseMinutes} onChange={set} />
      <NumField k="sleepHours" label="Sleep (hours)" value={f.sleepHours} onChange={set} decimal />

      <Field label="Hot bath / sauna today">
        <Switch value={heat} onValueChange={setHeat} label={heat ? "Yes" : "No"} />
      </Field>
      <Field label="Stress (1–5)">
        <Picker appearance="menu" selectedValue={f.stressLevel ?? ""} onValueChange={(v) => set("stressLevel", String(v))}>
          <Picker.Item label="—" value="" />
          {["1", "2", "3", "4", "5"].map((n) => (
            <Picker.Item key={n} label={n} value={n} />
          ))}
        </Picker>
      </Field>
      <Field label="Notes">
        <TextInput defaultValue={f.notes ?? ""} onChangeText={(v) => set("notes", v)} placeholder="optional" />
      </Field>

      <Row spacing={12}>
        <PillButton label={save.isPending ? "Saving…" : "Save entry"} onPress={() => save.mutate()} disabled={save.isPending} />
      </Row>
      {save.error && <Body tone="error" size={13}>{(save.error as Error).message}</Body>}

      <Heading>Recent entries</Heading>
      {list.isLoading ? (
        <SkeletonList />
      ) : list.data && list.data.entries.length > 0 ? (
        list.data.entries.map((e) => (
          <Card key={e.id} spacing={8}>
            <Body weight="600">{e.date}</Body>
            <Body tone="muted" size={13}>{describe(e)}</Body>
            <Row spacing={8}>
              <PillButton small variant="outline" label="Delete" onPress={() => remove.mutate(e.date)} />
            </Row>
          </Card>
        ))
      ) : (
        <EmptyState title="No entries yet" subtitle="Log a day to start building the picture." />
      )}
    </Screen>
  );
}

function NumField({
  k,
  label,
  value,
  onChange,
  decimal,
}: {
  k: string;
  label: string;
  value?: string;
  onChange: (k: string, v: string) => void;
  decimal?: boolean;
}) {
  return (
    <Field label={label}>
      <TextInput
        defaultValue={value ?? ""}
        onChangeText={(v) => onChange(k, v)}
        placeholder="0"
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
      />
    </Field>
  );
}
