import { Column, Host, Switch, Text as ExpoText } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, View } from "react-native";

import { Container } from "@/components/container";
import { apiFetch } from "@/lib/api";
import { NAV_THEME } from "@/lib/constants";
import { useDevUser } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";
import { useColorScheme } from "@/lib/use-color-scheme";

// Phase 5 — consent capture. Each switch is one shareable category, default-OFF.
// The server (not this screen) enforces access; flipping a switch just records
// the choice. The shared dashboard then reflects it on the partner's next load.

// What each role can choose to share.
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
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
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
    <Container>
      <ScrollView style={styles.scroll} contentInsetAdjustmentBehavior="never">
        <View style={styles.content}>
          <Host matchContents={{ vertical: true }}>
            <Column spacing={16}>
              <ExpoText textStyle={{ color: theme.text, fontSize: 22, fontWeight: "bold" }}>
                {`Sharing (${role})`}
              </ExpoText>
              <ExpoText textStyle={{ color: theme.text, fontSize: 13 }} style={{ opacity: 0.7 }}>
                Everything is private by default. Turn on only what you want your partner to see.
              </ExpoText>

              {flip.error && (
                <ExpoText textStyle={{ color: theme.notification, fontSize: 13 }}>
                  {(flip.error as Error).message}
                </ExpoText>
              )}

              {categories.map((cat) => (
                <Column key={cat.key} spacing={6} style={{ ...styles.card, backgroundColor: theme.card, borderColor: theme.border }}>
                  <Switch
                    value={granted.get(cat.key) ?? false}
                    onValueChange={(v) => flip.mutate({ category: cat.key, granted: v })}
                    label={cat.label}
                  />
                </Column>
              ))}
            </Column>
          </Host>
        </View>
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  card: { padding: 16, borderWidth: 1, borderRadius: 16 },
});
