import { Column, Host, Text as ExpoText } from "@expo/ui";
import { useQuery } from "@tanstack/react-query";
import type { Prediction } from "@ttc/domain";
import { ScrollView, StyleSheet, View } from "react-native";

import { Container } from "@/components/container";
import { apiFetch } from "@/lib/api";
import { NAV_THEME } from "@/lib/constants";
import { useDevUser } from "@/lib/dev-user";
import { useColorScheme } from "@/lib/use-color-scheme";

// Phase 5 — the shared dashboard. It shows ONLY what the partner has consented to
// share; the server returns nulls for anything not granted, so this screen never
// has to make the privacy decision.

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
  return `${h.date}: ${parts.length ? parts.join(" · ") : "—"}`;
}

export default function Dashboard() {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
  const { role } = useDevUser();

  const q = useQuery({
    queryKey: ["dashboard", role],
    queryFn: () => apiFetch<Dash>("/api/dashboard"),
  });

  const d = q.data;
  const fw = d?.fertileWindow;

  return (
    <Container>
      <ScrollView style={styles.scroll} contentInsetAdjustmentBehavior="never">
        <View style={styles.content}>
          <Host matchContents={{ vertical: true }}>
            <Column spacing={16}>
              <ExpoText textStyle={{ color: theme.text, fontSize: 22, fontWeight: "bold" }}>
                {`Shared dashboard (${role})`}
              </ExpoText>

              {q.isLoading && (
                <ExpoText textStyle={{ color: theme.text, fontSize: 14 }}>loading…</ExpoText>
              )}

              {d && !d.partner && (
                <ExpoText textStyle={{ color: theme.text, fontSize: 14 }} style={{ opacity: 0.7 }}>
                  Not linked to a partner yet.
                </ExpoText>
              )}

              {d?.partner && (
                <ExpoText textStyle={{ color: theme.text, fontSize: 14 }} style={{ opacity: 0.7 }}>
                  {`Partner: ${d.partner.displayName ?? d.partner.userId} (${d.partner.role ?? "?"})`}
                </ExpoText>
              )}

              <Card theme={theme} title="Her fertile window">
                {fw
                  ? fw.status === "insufficient_data"
                    ? fw.message
                    : `Next period ~ ${fw.nextPeriodStart}\nFertile ${fw.fertileWindow.start} → ${fw.fertileWindow.end}\nconfidence ${fw.confidence}`
                  : "Not shared."}
              </Card>

              <Card theme={theme} title="His habits (latest)">
                {d?.habit ? habitLine(d.habit) : "Not shared."}
              </Card>

              <ExpoText textStyle={{ color: theme.text, fontSize: 12 }} style={{ opacity: 0.6 }}>
                Guidance, not medical advice.
              </ExpoText>
            </Column>
          </Host>
        </View>
      </ScrollView>
    </Container>
  );
}

function Card({ theme, title, children }: { theme: (typeof NAV_THEME)["light"]; title: string; children: string }) {
  return (
    <Column spacing={6} style={{ ...styles.card, backgroundColor: theme.card, borderColor: theme.border }}>
      <ExpoText textStyle={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>{title}</ExpoText>
      <ExpoText textStyle={{ color: theme.text, fontSize: 14 }}>{children}</ExpoText>
    </Column>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  card: { padding: 16, borderWidth: 1, borderRadius: 16 },
});
