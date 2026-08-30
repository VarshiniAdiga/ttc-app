import { couple, createAppDb, todo, withUser } from "@ttc/db";
import { eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

// Phase 6 — the couple's shared to-do list. RLS (todo_members) scopes every read
// and write to the caller's couple, so no ownership checks are needed here.

type Vars = { userId: string | null };

const app = new Hono<{ Variables: Vars }>();

app.use("/*", async (c, next) => {
  if (!c.get("userId")) return c.json({ error: "no user" }, 401);
  await next();
});

app.get("/", async (c) => {
  const db = createAppDb();
  const todos = await withUser(db, c.get("userId")!, (tx) =>
    tx.select().from(todo).orderBy(todo.done, todo.createdAt),
  );
  return c.json({ todos });
});

app.post("/", async (c) => {
  const body = z
    .object({ title: z.string().min(1).max(200), assignedTo: z.string().nullish() })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const userId = c.get("userId")!;
  const db = createAppDb();
  const [row] = await withUser(db, userId, async (tx) => {
    const [cpl] = await tx
      .select({ id: couple.id })
      .from(couple)
      .where(or(eq(couple.memberA, userId), eq(couple.memberB, userId)))
      .limit(1);
    if (!cpl) return [undefined];
    return tx
      .insert(todo)
      .values({ coupleId: cpl.id, createdBy: userId, title: body.data.title, assignedTo: body.data.assignedTo ?? null })
      .returning();
  });
  if (!row) return c.json({ error: "not linked to a partner yet" }, 409);
  return c.json({ todo: row });
});

app.patch("/:id", async (c) => {
  const body = z
    .object({
      done: z.boolean().optional(),
      title: z.string().min(1).max(200).optional(),
      assignedTo: z.string().nullish(),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const db = createAppDb();
  const [row] = await withUser(db, c.get("userId")!, (tx) =>
    tx
      .update(todo)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(todo.id, c.req.param("id")))
      .returning(),
  );
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ todo: row });
});

app.delete("/:id", async (c) => {
  const db = createAppDb();
  const deleted = await withUser(db, c.get("userId")!, (tx) =>
    tx.delete(todo).where(eq(todo.id, c.req.param("id"))).returning({ id: todo.id }),
  );
  return c.json({ deleted: deleted.length });
});

export default app;
