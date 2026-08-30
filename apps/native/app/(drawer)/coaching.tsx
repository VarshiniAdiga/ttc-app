import { Button, Column, Host, Switch, Text as ExpoText } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, View } from "react-native";

import { Container } from "@/components/container";
import { apiFetch } from "@/lib/api";
import { NAV_THEME } from "@/lib/constants";
import { useDevUser } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";
import { useColorScheme } from "@/lib/use-color-scheme";

// Phase 7 — coaching (the paid feature). The server generates one action per
// partner from the rules engine and gates reading it behind a pro flag. The dev
// pro toggle + "generate" button stand in for RevenueCat (Phase 8) and the weekly
// cron (Phase 11).

type Coaching = { id: string; ruleId: string; ruleVersion: number; body: string; weekOf: string };

export default function CoachingScreen() {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
  const { role } = useDevUser();

  const pro = useQuery({
    queryKey: ["pro-status", role],
    queryFn: () => apiFetch<{ isPro: boolean }>("/api/coaching/pro-status"),
  });

  // 402 (pro required) is expected for non-pro users; treat it as "empty", not an error.
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
    mutationFn: (isPro: boolean) =>
      apiFetch("/api/coaching/dev-pro", { method: "POST", body: JSON.stringify({ isPro }) }),
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
    <Container>
      <ScrollView style={styles.scroll} contentInsetAdjustmentBehavior="never">
        <View style={styles.content}>
          <Host matchContents={{ vertical: true }}>
            <Column spacing={16}>
              <ExpoText textStyle={{ color: theme.text, fontSize: 22, fontWeight: "bold" }}>
                {`Coaching (${role})`}
              </ExpoText>

              <Column spacing={6} style={{ ...styles.card, backgroundColor: theme.card, borderColor: theme.border }}>
                <Switch value={isPro} onValueChange={(v) => setPro.mutate(v)} label="Pro (dev toggle)" />
                <ExpoText textStyle={{ color: theme.text, fontSize: 12 }} style={{ opacity: 0.6 }}>
                  Real subscriptions arrive in Phase 8. This fakes the entitlement.
                </ExpoText>
              </Column>

              <Button
                label={generate.isPending ? "Generating…" : "Generate this week's coaching"}
                onPress={() => generate.mutate()}
              />
              {generate.data && (
                <ExpoText textStyle={{ color: theme.text, fontSize: 13 }} style={{ opacity: 0.7 }}>
                  {`Generated ${generate.data.generated} action(s) for the couple.`}
                </ExpoText>
              )}
              {generate.error && (
                <ExpoText textStyle={{ color: theme.notification, fontSize: 13 }}>
                  {(generate.error as Error).message}
                </ExpoText>
              )}

              <ExpoText textStyle={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>
                Your coaching
              </ExpoText>

              {!isPro ? (
                <Column spacing={6} style={{ ...styles.card, backgroundColor: theme.card, borderColor: theme.primary }}>
                  <ExpoText textStyle={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
                    Unlock personalized coaching
                  </ExpoText>
                  <ExpoText textStyle={{ color: theme.text, fontSize: 14 }}>
                    Turn on Pro above to see your weekly guidance. The server refuses to send it
                    otherwise — the client can't unlock it on its own.
                  </ExpoText>
                </Column>
              ) : list.isLoading ? (
                <ExpoText textStyle={{ color: theme.text, fontSize: 14 }}>loading…</ExpoText>
              ) : list.data && list.data.coaching.length > 0 ? (
                list.data.coaching.map((c) => (
                  <Column key={c.id} spacing={4} style={{ ...styles.card, backgroundColor: theme.card, borderColor: theme.border }}>
                    <ExpoText textStyle={{ color: theme.text, fontSize: 12 }} style={{ opacity: 0.6 }}>
                      {`Week of ${c.weekOf} · ${c.ruleId} v${c.ruleVersion}`}
                    </ExpoText>
                    <ExpoText textStyle={{ color: theme.text, fontSize: 14 }}>{c.body}</ExpoText>
                  </Column>
                ))
              ) : (
                <ExpoText textStyle={{ color: theme.text, fontSize: 14 }} style={{ opacity: 0.7 }}>
                  No coaching yet — tap “Generate” after logging some data.
                </ExpoText>
              )}
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
