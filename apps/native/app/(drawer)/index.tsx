import { Button, Column, Host, Row, Text as ExpoText } from "@expo/ui";
import { DEV_USERS, type DevRole } from "@ttc/config/dev-users";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ScrollView, StyleSheet, View } from "react-native";

import { Container } from "@/components/container";
import { apiFetch } from "@/lib/api";
import { NAV_THEME } from "@/lib/constants";
import { useDevUser } from "@/lib/dev-user";
import { useColorScheme } from "@/lib/use-color-scheme";

// Phase 0 dev harness: switch between the two fake users and confirm the app can
// reach the Worker as each. Parked: the real auth screens (sign-in/sign-up) return in Phase 10.
export default function Home() {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
  const { role, setRole } = useDevUser();

  const health = useQuery({
    queryKey: ["health", role],
    queryFn: () => apiFetch<{ ok: boolean; appEnv: string; user: string | null }>("/health"),
  });
  const me = useQuery({
    queryKey: ["me", role],
    queryFn: () => apiFetch<{ userId: string }>("/api/me"),
  });

  return (
    <Container>
      <ScrollView style={styles.scrollView} contentInsetAdjustmentBehavior="never">
        <View style={styles.content}>
          <Host matchContents={{ vertical: true }}>
            <Column spacing={16}>
              <ExpoText textStyle={{ color: theme.text, fontSize: 22, fontWeight: "bold" }}>
                TTC — Phase 0 dev harness
              </ExpoText>

              <Column spacing={8}>
                <ExpoText textStyle={{ color: theme.text, fontSize: 14 }} style={{ opacity: 0.7 }}>
                  Acting as
                </ExpoText>
                <Row spacing={12}>
                  {(Object.keys(DEV_USERS) as DevRole[]).map((r) => (
                    <Button
                      key={r}
                      label={DEV_USERS[r].label}
                      variant={role === r ? "filled" : "outlined"}
                      onPress={() => setRole(r)}
                    />
                  ))}
                </Row>
              </Column>

              <ResultCard
                title="GET /health"
                theme={theme}
                query={health}
                render={(d) => `ok=${d.ok}  env=${d.appEnv}\nuser=${d.user ?? "—"}`}
              />
              <ResultCard
                title="GET /api/me"
                theme={theme}
                query={me}
                render={(d) => `userId=${d.userId}`}
              />
            </Column>
          </Host>
        </View>
      </ScrollView>
    </Container>
  );
}

function ResultCard<T>({
  title,
  theme,
  query,
  render,
}: {
  title: string;
  theme: (typeof NAV_THEME)["light"];
  query: UseQueryResult<T>;
  render: (data: T) => string;
}) {
  const body = query.isLoading
    ? "loading…"
    : query.error
      ? `error: ${(query.error as Error).message}`
      : query.data
        ? render(query.data)
        : "—";
  return (
    <Column spacing={6} style={{ ...styles.card, backgroundColor: theme.card, borderColor: theme.border }}>
      <ExpoText textStyle={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
        {title}
      </ExpoText>
      <ExpoText textStyle={{ color: theme.text, fontSize: 14 }}>{body}</ExpoText>
    </Column>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 32 },
  card: { padding: 16, borderWidth: 1, borderRadius: 16 },
});
