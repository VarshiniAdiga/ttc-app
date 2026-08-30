import { Button, Column, Host, Picker, Row, Text as ExpoText, TextInput } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { predictFromCycleLogs } from "@ttc/domain";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Container } from "@/components/container";
import { apiFetch } from "@/lib/api";
import { NAV_THEME } from "@/lib/constants";
import { useDevUser } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";
import { useColorScheme } from "@/lib/use-color-scheme";

// Phase 2 — her core tracker. One screen, a Picker to choose the category, an
// upsert-by-day Save, a list with per-day Delete. For cycle, Phase 3's pure
// prediction (derived, never stored) is shown from the logged entries.

type LogType = "cycle" | "bbt" | "opk" | "mucus" | "symptom";
type Entry = { id: string; date: string; [k: string]: unknown };

const TYPES: LogType[] = ["cycle", "bbt", "opk", "mucus", "symptom"];

const CHOICES: Partial<Record<LogType, { key: string; options: string[] }>> = {
  cycle: { key: "flow", options: ["spotting", "light", "medium", "heavy"] },
  opk: { key: "result", options: ["low", "high", "peak", "positive", "negative"] },
  mucus: { key: "type", options: ["dry", "sticky", "creamy", "watery", "eggwhite"] },
};

const today = () => new Date().toISOString().slice(0, 10);

// Turn the raw text field state into the typed body each category expects.
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
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
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
    <Container>
      <ScrollView style={styles.scroll} contentInsetAdjustmentBehavior="never">
        <View style={styles.content}>
          <Host matchContents={{ vertical: true }}>
            <Column spacing={16}>
              <ExpoText textStyle={{ color: theme.text, fontSize: 22, fontWeight: "bold" }}>
                {`Track (${role})`}
              </ExpoText>

              <Field label="Category" theme={theme}>
                <Picker selectedValue={type} onValueChange={(v) => { setType(v as LogType); setFields({}); }}>
                  {TYPES.map((t) => (
                    <Picker.Item key={t} label={t} value={t} />
                  ))}
                </Picker>
              </Field>

              <Field label="Date (YYYY-MM-DD)" theme={theme}>
                <TextInput defaultValue={date} onChangeText={setDate} placeholder="2026-08-29" autoCapitalize="none" />
              </Field>

              {choice && (
                <Field label={choice.key} theme={theme}>
                  <Picker
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
                <Field label="Temp °C" theme={theme}>
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
                <Field label="Symptoms (comma-separated)" theme={theme}>
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
                <Field label="Notes" theme={theme}>
                  <TextInput
                    key={`notes-${type}`}
                    defaultValue={fields.notes ?? ""}
                    onChangeText={(v) => setField("notes", v)}
                    placeholder="optional"
                  />
                </Field>
              )}

              <Button label={save.isPending ? "Saving…" : "Save entry"} onPress={() => save.mutate()} />
              {save.error && (
                <ExpoText textStyle={{ color: theme.notification, fontSize: 13 }}>
                  {(save.error as Error).message}
                </ExpoText>
              )}

              {prediction && <PredictionCard theme={theme} p={prediction} />}

              <ExpoText textStyle={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>
                Entries
              </ExpoText>
              {list.isLoading ? (
                <ExpoText textStyle={{ color: theme.text, fontSize: 14 }}>loading…</ExpoText>
              ) : list.data && list.data.entries.length > 0 ? (
                list.data.entries.map((e) => (
                  <Row key={e.id} spacing={12} style={{ ...styles.card, backgroundColor: theme.card, borderColor: theme.border }}>
                    <Column spacing={2}>
                      <ExpoText textStyle={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                        {e.date}
                      </ExpoText>
                      <ExpoText textStyle={{ color: theme.text, fontSize: 13 }} style={{ opacity: 0.7 }}>
                        {describe(type, e)}
                      </ExpoText>
                    </Column>
                    <Button label="Delete" variant="outlined" onPress={() => remove.mutate(e.date)} />
                  </Row>
                ))
              ) : (
                <ExpoText textStyle={{ color: theme.text, fontSize: 14 }} style={{ opacity: 0.7 }}>
                  No entries yet.
                </ExpoText>
              )}
            </Column>
          </Host>
        </View>
      </ScrollView>
    </Container>
  );
}

function Field({
  label,
  theme,
  children,
}: {
  label: string;
  theme: (typeof NAV_THEME)["light"];
  children: React.ReactNode;
}) {
  return (
    <Column spacing={6}>
      <ExpoText textStyle={{ color: theme.text, fontSize: 13 }} style={{ opacity: 0.7 }}>
        {label}
      </ExpoText>
      {children}
    </Column>
  );
}

function PredictionCard({
  theme,
  p,
}: {
  theme: (typeof NAV_THEME)["light"];
  p: ReturnType<typeof predictFromCycleLogs>;
}) {
  const body =
    p.status === "insufficient_data"
      ? p.message
      : `Next period ~ ${p.nextPeriodStart}\nFertile window ${p.fertileWindow.start} → ${p.fertileWindow.end}\nAvg cycle ${p.avgCycleLength}d · confidence ${p.confidence}`;
  return (
    <Column spacing={6} style={{ ...styles.card, backgroundColor: theme.card, borderColor: theme.primary }}>
      <ExpoText textStyle={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
        Prediction (estimate, not medical advice)
      </ExpoText>
      <ExpoText textStyle={{ color: theme.text, fontSize: 14 }}>{body}</ExpoText>
    </Column>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  card: { padding: 16, borderWidth: 1, borderRadius: 16, justifyContent: "space-between", alignItems: "center" },
});
