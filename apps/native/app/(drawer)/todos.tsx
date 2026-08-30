import { Button, Column, Host, Picker, Row, Switch, Text as ExpoText, TextInput } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DEV_USERS, type DevRole } from "@ttc/config/dev-users";
import { useState } from "react";
import { ScrollView, Share, StyleSheet, View } from "react-native";

import { Container } from "@/components/container";
import { apiFetch } from "@/lib/api";
import { NAV_THEME } from "@/lib/constants";
import { useDevUser } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";
import { useColorScheme } from "@/lib/use-color-scheme";

// Phase 6 — the couple's shared to-dos + the partner-invite flow. Todos are
// scoped to the couple by RLS; the invite generates a single-use, expiring link
// that (when accepted) links the two users and writes the chosen consent rows.

type Todo = { id: string; title: string; done: boolean; assignedTo: string | null };

// Map a user id back to a friendly label for the assignee chip.
const nameFor = (id: string | null) => {
  if (!id) return "anyone";
  const hit = Object.values(DEV_USERS).find((u) => u.id === id);
  return hit?.label ?? id.slice(0, 8);
};

export default function Todos() {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
  const { role } = useDevUser();

  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [titleKey, setTitleKey] = useState(0); // bump to clear the uncontrolled input

  const list = useQuery({
    queryKey: ["todos", role],
    queryFn: () => apiFetch<{ todos: Todo[] }>("/api/todos"),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["todos", role] });

  const add = useMutation({
    mutationFn: () =>
      apiFetch("/api/todos", {
        method: "POST",
        body: JSON.stringify({ title, assignedTo: assignee || null }),
      }),
    onSuccess: () => {
      setTitle("");
      setTitleKey((k) => k + 1);
      invalidate();
    },
  });
  const toggle = useMutation({
    mutationFn: (t: Todo) => apiFetch(`/api/todos/${t.id}`, { method: "PATCH", body: JSON.stringify({ done: !t.done }) }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/todos/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  // Invite: default to sharing the current role's headline category.
  const [inviteFertile, setInviteFertile] = useState(role === "her");
  const invite = useMutation({
    mutationFn: () =>
      apiFetch<{ url: string; token: string }>("/api/invite", {
        method: "POST",
        body: JSON.stringify({
          categories: role === "her" ? (inviteFertile ? ["fertile_window"] : []) : ["habit"],
        }),
      }),
    onSuccess: (r) => Share.share({ message: `Join me on TTC: ${r.url}` }),
  });

  return (
    <Container>
      <ScrollView style={styles.scroll} contentInsetAdjustmentBehavior="never">
        <View style={styles.content}>
          <Host matchContents={{ vertical: true }}>
            <Column spacing={16}>
              <ExpoText textStyle={{ color: theme.text, fontSize: 22, fontWeight: "bold" }}>
                {`Shared to-dos (${role})`}
              </ExpoText>

              <Field label="New to-do" theme={theme}>
                <TextInput key={titleKey} defaultValue="" onChangeText={setTitle} placeholder="e.g. Book doctor appointment" />
              </Field>
              <Field label="Assign to" theme={theme}>
                <Picker selectedValue={assignee} onValueChange={(v) => setAssignee(String(v))}>
                  <Picker.Item label="anyone" value="" />
                  {(Object.keys(DEV_USERS) as DevRole[]).map((r) => (
                    <Picker.Item key={r} label={DEV_USERS[r].label} value={DEV_USERS[r].id} />
                  ))}
                </Picker>
              </Field>
              <Button label={add.isPending ? "Adding…" : "Add"} onPress={() => title.trim() && add.mutate()} />
              {add.error && (
                <ExpoText textStyle={{ color: theme.notification, fontSize: 13 }}>{(add.error as Error).message}</ExpoText>
              )}

              {list.isLoading ? (
                <ExpoText textStyle={{ color: theme.text, fontSize: 14 }}>loading…</ExpoText>
              ) : list.data && list.data.todos.length > 0 ? (
                list.data.todos.map((t) => (
                  <Row key={t.id} spacing={12} style={{ ...styles.card, backgroundColor: theme.card, borderColor: theme.border }}>
                    <Column spacing={2} style={{ opacity: t.done ? 0.5 : 1 }}>
                      <ExpoText textStyle={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                        {t.done ? `✓ ${t.title}` : t.title}
                      </ExpoText>
                      <ExpoText textStyle={{ color: theme.text, fontSize: 12 }} style={{ opacity: 0.6 }}>
                        {`→ ${nameFor(t.assignedTo)}`}
                      </ExpoText>
                    </Column>
                    <Row spacing={8}>
                      <Switch value={t.done} onValueChange={() => toggle.mutate(t)} label="done" />
                      <Button label="✕" variant="outlined" onPress={() => remove.mutate(t.id)} />
                    </Row>
                  </Row>
                ))
              ) : (
                <ExpoText textStyle={{ color: theme.text, fontSize: 14 }} style={{ opacity: 0.7 }}>
                  No to-dos yet.
                </ExpoText>
              )}

              <ExpoText textStyle={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>Invite a partner</ExpoText>
              {role === "her" && (
                <Switch value={inviteFertile} onValueChange={setInviteFertile} label="Share fertile window on join" />
              )}
              <Button
                label={invite.isPending ? "Creating…" : "Create invite link"}
                onPress={() => invite.mutate()}
              />
              {invite.data && (
                <ExpoText textStyle={{ color: theme.text, fontSize: 12 }} style={{ opacity: 0.7 }}>
                  {invite.data.url}
                </ExpoText>
              )}
              {invite.error && (
                <ExpoText textStyle={{ color: theme.notification, fontSize: 13 }}>{(invite.error as Error).message}</ExpoText>
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

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  card: { padding: 16, borderWidth: 1, borderRadius: 16, justifyContent: "space-between", alignItems: "center" },
});
