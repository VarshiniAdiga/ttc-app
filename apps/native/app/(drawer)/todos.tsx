import { Picker, Row, Switch, TextInput } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DEV_USERS, type DevRole } from "@ttc/config/dev-users";
import { useState } from "react";
import { Share } from "react-native";

import { Body, Card, Chip, EmptyState, Field, Heading, PillButton, Screen, SkeletonList } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useDevUser } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";

// Phase 6 — the couple's shared to-dos + the partner-invite flow. Todos are
// scoped to the couple by RLS; the invite generates a single-use, expiring link
// that (when accepted) links the two users and writes the chosen consent rows.

type Todo = { id: string; title: string; done: boolean; assignedTo: string | null };

const nameFor = (id: string | null) => {
  if (!id) return "anyone";
  const hit = Object.values(DEV_USERS).find((u) => u.id === id);
  return hit?.label ?? id.slice(0, 8);
};

export default function Todos() {
  const { role } = useDevUser();

  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [titleKey, setTitleKey] = useState(0);

  const list = useQuery({
    queryKey: ["todos", role],
    queryFn: () => apiFetch<{ todos: Todo[] }>("/api/todos"),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["todos", role] });

  const add = useMutation({
    mutationFn: () =>
      apiFetch("/api/todos", { method: "POST", body: JSON.stringify({ title, assignedTo: assignee || null }) }),
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
    <Screen eyebrow="As a team" title="Shared to-dos" subtitle="The small steps that move you forward, together.">
      <Field label="New to-do">
        <TextInput key={titleKey} defaultValue="" onChangeText={setTitle} placeholder="e.g. Book doctor appointment" />
      </Field>
      <Field label="Assign to">
        <Picker appearance="menu" selectedValue={assignee} onValueChange={(v) => setAssignee(String(v))}>
          <Picker.Item label="anyone" value="" />
          {(Object.keys(DEV_USERS) as DevRole[]).map((r) => (
            <Picker.Item key={r} label={DEV_USERS[r].label} value={DEV_USERS[r].id} />
          ))}
        </Picker>
      </Field>
      <Row spacing={12}>
        <PillButton label={add.isPending ? "Adding…" : "Add to-do"} onPress={() => title.trim() && add.mutate()} disabled={add.isPending} />
      </Row>
      {add.error && <Body tone="error" size={13}>{(add.error as Error).message}</Body>}

      {list.isLoading ? (
        <SkeletonList rows={2} />
      ) : list.data && list.data.todos.length > 0 ? (
        list.data.todos.map((t) => (
          <Card key={t.id} spacing={10}>
            <Body weight="600">{t.done ? `✓  ${t.title}` : t.title}</Body>
            <Row spacing={10} alignment="center">
              <Chip label={`→ ${nameFor(t.assignedTo)}`} tone="muted" />
              <Switch value={t.done} onValueChange={() => toggle.mutate(t)} label="done" />
            </Row>
            <Row spacing={8}>
              <PillButton small variant="outline" label="Remove" onPress={() => remove.mutate(t.id)} />
            </Row>
          </Card>
        ))
      ) : (
        <EmptyState title="No to-dos yet" subtitle="Add the first step you want to take together." />
      )}

      <Heading>Invite your partner</Heading>
      <Card variant="olive" spacing={12}>
        <Body tone="onPrimary" size={13}>
          Create a single-use link. When your partner joins, they're linked to you and your chosen sharing turns on.
        </Body>
        {role === "her" && (
          <Switch value={inviteFertile} onValueChange={setInviteFertile} label="Share fertile window on join" />
        )}
        <Row spacing={12}>
          <PillButton variant="accent" label={invite.isPending ? "Creating…" : "Create invite link"} onPress={() => invite.mutate()} disabled={invite.isPending} />
        </Row>
        {invite.data && <Body tone="onPrimary" size={12}>{invite.data.url}</Body>}
      </Card>
      {invite.error && <Body tone="error" size={13}>{(invite.error as Error).message}</Body>}
    </Screen>
  );
}
