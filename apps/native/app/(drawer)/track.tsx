import { Column, Picker, Row, TextInput } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { predictFromCycleLogs } from "@ttc/domain";
import { useMemo, useState } from "react";

import { Body, Card, EmptyState, Field, Heading, PillButton, Screen, SkeletonList, WeekStrip } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useDevUser } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";

// Phase 2 — her core tracker. A week-strip calendar picks the day, a Picker
// chooses the category, Save upserts by day, and each entry lists with a Delete.
// For cycle, Phase 3's pure prediction (derived, never stored) is shown.

type LogType = "cycle" | "bbt" | "opk" | "mucus" | "symptom";
type Entry = { id: string; date: string; [k: string]: unknown };

const TYPES: LogType[] = ["cycle", "bbt", "opk", "mucus", "symptom"];
const TYPE_LABEL: Record<LogType, string> = {
  cycle: "Period / cycle",
  bbt: "Basal temperature",
  opk: "Ovulation test",
  mucus: "Cervical mucus",
  symptom: "Symptoms",
};

const CHOICES: Partial<Record<LogType, { key: string; options: string[] }>> = {
  cycle: { key: "flow", options: ["spotting", "light", "medium", "heavy"] },
  opk: { key: "result", options: ["low", "high", "peak", "positive", "negative"] },
  mucus: { key: "type", options: ["dry", "sticky", "creamy", "watery", "eggwhite"] },
};

const today = () => new Date().toISOString().slice(0, 10);

function buildBody(type: LogType, date: string, f: Record<string, string>) {
  switch (type) {
    case "cycle":
      return { date, flow: f.flow || null, notes: f.notes || null };
    case "bbt":
      return { date, tempC: Number(f.tempC) };
    case "opk":
      return { date, result: f.result || null };
    case "mucus":
      return { date, type: f.type || null };
    case "symptom":
      return {
        date,
        symptoms: (f.symptoms ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        notes: f.notes || null,
      };
  }
}

function describe(type: LogType, e: Entry): string {
  switch (type) {
    case "cycle":
      return `${e.flow ?? "—"}${e.notes ? ` · ${e.notes}` : ""}`;
    case "bbt":
      return `${e.tempC ?? "—"} °C`;
    case "opk":
      return `${e.result ?? "—"}${e.photoPath ? " · 📷" : ""}`;
    case "mucus":
      return String(e.type ?? "—");
    case "symptom":
      return `${(e.symptoms as string[] | undefined)?.join(", ") || "—"}${e.notes ? ` · ${e.notes}` : ""}`;
  }
}

export default function Track() {
  const { role } = useDevUser();

  const [type, setType] = useState<LogType>("cycle");
  const [date, setDate] = useState(today());
  const [fields, setFields] = useState<Record<string, string>>({});
  const setField = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const list = useQuery({
    queryKey: ["logs", type, role],
    queryFn: () => apiFetch<{ entries: Entry[] }>(`/api/logs/${type}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["logs", type, role] });

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/logs/${type}`, {
        method: "POST",
        body: JSON.stringify(buildBody(type, date, fields)),
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (d: string) => apiFetch(`/api/logs/${type}/${d}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const prediction = useMemo(() => {
    if (type !== "cycle" || !list.data) return null;
    return predictFromCycleLogs(list.data.entries as { date: string; flow?: string | null }[]);
  }, [type, list.data]);

  const choice = CHOICES[type];

  return (
    <Screen eyebrow={role === "her" ? "Her tracker" : "Tracker"} title="Track today" subtitle="A gentle check-in. Log what feels true — nothing here is shared unless you choose to.">
      <WeekStrip value={date} onChange={setDate} />

      <Field label="What are you logging?">
        <Picker
          appearance="menu"
          selectedValue={type}
          onValueChange={(v) => {
            setType(v as LogType);
            setFields({});
          }}
        >
          {TYPES.map((t) => (
            <Picker.Item key={t} label={TYPE_LABEL[t]} value={t} />
          ))}
        </Picker>
      </Field>

      {choice && (
        <Field label={choice.key}>
          <Picker
            appearance="menu"
            selectedValue={fields[choice.key] ?? ""}
            onValueChange={(v) => setField(choice.key, String(v))}
          >
            <Picker.Item label="—" value="" />
            {choice.options.map((o) => (
              <Picker.Item key={o} label={o} value={o} />
            ))}
          </Picker>
        </Field>
      )}

      {type === "bbt" && (
        <Field label="Temp °C">
          <TextInput
            key={`tempC-${type}`}
            defaultValue={fields.tempC ?? ""}
            onChangeText={(v) => setField("tempC", v)}
            placeholder="36.60"
            keyboardType="decimal-pad"
          />
        </Field>
      )}

      {type === "symptom" && (
        <Field label="Symptoms (comma-separated)">
          <TextInput
            key={`symptoms-${type}`}
            defaultValue={fields.symptoms ?? ""}
            onChangeText={(v) => setField("symptoms", v)}
            placeholder="cramps, headache"
            autoCapitalize="none"
          />
        </Field>
      )}

      {(type === "cycle" || type === "symptom") && (
        <Field label="Notes">
          <TextInput
            key={`notes-${type}`}
            defaultValue={fields.notes ?? ""}
            onChangeText={(v) => setField("notes", v)}
            placeholder="optional"
          />
        </Field>
      )}

      <Row spacing={12}>
        <PillButton label={save.isPending ? "Saving…" : "Save entry"} onPress={() => save.mutate()} disabled={save.isPending} />
      </Row>
      {save.error && <Body tone="error" size={13}>{(save.error as Error).message}</Body>}

      {prediction && <PredictionCard p={prediction} />}

      <Heading>Recent entries</Heading>
      {list.isLoading ? (
        <SkeletonList />
      ) : list.data && list.data.entries.length > 0 ? (
        list.data.entries.map((e) => (
          <Card key={e.id} spacing={8}>
            <Row spacing={10} alignment="center">
              <Body weight="600">{e.date}</Body>
            </Row>
            <Body tone="muted" size={13}>{describe(type, e)}</Body>
            <Row spacing={8}>
              <PillButton small variant="outline" label="Delete" onPress={() => remove.mutate(e.date)} />
            </Row>
          </Card>
        ))
      ) : (
        <EmptyState title="No entries yet" subtitle="Your first log starts the story." />
      )}
    </Screen>
  );
}

function PredictionCard({ p }: { p: ReturnType<typeof predictFromCycleLogs> }) {
  const insufficient = p.status === "insufficient_data";
  return (
    <Card variant="accent" spacing={10}>
      <Body tone="onAccent" size={12} weight="600">
        PREDICTION · ESTIMATE, NOT MEDICAL ADVICE
      </Body>
      {insufficient ? (
        <Body tone="onAccent">{p.message}</Body>
      ) : (
        <Column spacing={4}>
          <Body tone="onAccent" size={17} weight="bold">{`Next period ~ ${p.nextPeriodStart}`}</Body>
          <Body tone="onAccent" size={14}>{`Fertile window  ${p.fertileWindow.start} → ${p.fertileWindow.end}`}</Body>
          <Body tone="onAccent" size={13}>{`Avg cycle ${p.avgCycleLength}d · confidence ${p.confidence}`}</Body>
        </Column>
      )}
    </Card>
  );
}
