import { Button, Column, Host, Picker, Row, Switch, Text as ExpoText, TextInput } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Container } from "@/components/container";
import { apiFetch } from "@/lib/api";
import { NAV_THEME } from "@/lib/constants";
import { useDevUser } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";
import { useColorScheme } from "@/lib/use-color-scheme";

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
  return parts.length ? parts.join(" · ") : "—";
}

export default function Habits() {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
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
    <Container>
      <ScrollView style={styles.scroll} contentInsetAdjustmentBehavior="never">
        <View style={styles.content}>
          <Host matchContents={{ vertical: true }}>
            <Column spacing={16}>
              <ExpoText textStyle={{ color: theme.text, fontSize: 22, fontWeight: "bold" }}>
                {`Habits (${role})`}
              </ExpoText>
              {role !== "him" && (
                <ExpoText textStyle={{ color: theme.notification, fontSize: 13 }}>
                  This is his log — switch to Him on Home to edit.
                </ExpoText>
              )}

              <Field label="Date (YYYY-MM-DD)" theme={theme}>
                <TextInput defaultValue={date} onChangeText={setDate} placeholder="2026-08-29" autoCapitalize="none" />
              </Field>
              <NumField k="alcoholUnits" label="Alcohol (units)" theme={theme} value={f.alcoholUnits} onChange={set} />
              <NumField k="cigarettes" label="Cigarettes" theme={theme} value={f.cigarettes} onChange={set} />
              <NumField k="exerciseMinutes" label="Exercise (min)" theme={theme} value={f.exerciseMinutes} onChange={set} />
              <NumField k="sleepHours" label="Sleep (hours)" theme={theme} value={f.sleepHours} onChange={set} decimal />
              <Field label="Hot bath / sauna today" theme={theme}>
                <Switch value={heat} onValueChange={setHeat} label={heat ? "Yes" : "No"} />
              </Field>
              <Field label="Stress (1–5)" theme={theme}>
                <Picker selectedValue={f.stressLevel ?? ""} onValueChange={(v) => set("stressLevel", String(v))}>
                  <Picker.Item label="—" value="" />
                  {["1", "2", "3", "4", "5"].map((n) => (
                    <Picker.Item key={n} label={n} value={n} />
                  ))}
                </Picker>
              </Field>
              <Field label="Notes" theme={theme}>
                <TextInput defaultValue={f.notes ?? ""} onChangeText={(v) => set("notes", v)} placeholder="optional" />
              </Field>

              <Button label={save.isPending ? "Saving…" : "Save entry"} onPress={() => save.mutate()} />
              {save.error && (
                <ExpoText textStyle={{ color: theme.notification, fontSize: 13 }}>
                  {(save.error as Error).message}
                </ExpoText>
              )}

              <ExpoText textStyle={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>Entries</ExpoText>
              {list.isLoading ? (
                <ExpoText textStyle={{ color: theme.text, fontSize: 14 }}>loading…</ExpoText>
              ) : list.data && list.data.entries.length > 0 ? (
                list.data.entries.map((e) => (
                  <Row key={e.id} spacing={12} style={{ ...styles.card, backgroundColor: theme.card, borderColor: theme.border }}>
                    <Column spacing={2}>
                      <ExpoText textStyle={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>{e.date}</ExpoText>
                      <ExpoText textStyle={{ color: theme.text, fontSize: 13 }} style={{ opacity: 0.7 }}>
                        {describe(e)}
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

function Field({ label, theme, children }: { label: string; theme: (typeof NAV_THEME)["light"]; children: React.ReactNode }) {
  return (
    <Column spacing={6}>
      <ExpoText textStyle={{ color: theme.text, fontSize: 13 }} style={{ opacity: 0.7 }}>
        {label}
      </ExpoText>
      {children}
    </Column>
  );
}

function NumField({
  k,
  label,
  theme,
  value,
  onChange,
  decimal,
}: {
  k: string;
  label: string;
  theme: (typeof NAV_THEME)["light"];
  value?: string;
  onChange: (k: string, v: string) => void;
  decimal?: boolean;
}) {
  return (
    <Field label={label} theme={theme}>
      <TextInput
        defaultValue={value ?? ""}
        onChangeText={(v) => onChange(k, v)}
        placeholder="0"
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
      />
    </Field>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  card: { padding: 16, borderWidth: 1, borderRadius: 16, justifyContent: "space-between", alignItems: "center" },
});
