import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { todos } from "./db/schema";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// GET /todos - 全件取得
app.get("/todos", async (c) => {
  const db = drizzle(c.env.DB);
  const result = await db.select().from(todos).all();
  return c.json(result);
});

// GET /todos/:id - 1件取得
app.get("/todos/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  const result = await db.select().from(todos).where(eq(todos.id, id)).get();
  if (!result) {
    return c.json({ error: "Todo not found" }, 404);
  }
  return c.json(result);
});

// POST /todos - 新規作成
app.post("/todos", async (c) => {
  const body = await c.req.json<{ title: string }>();
  if (!body.title) {
    return c.json({ error: "Title is required" }, 400);
  }
  const db = drizzle(c.env.DB);
  const now = new Date().toISOString();
  const result = await db.insert(todos).values({
    title: body.title,
    completed: false,
    createdAt: now,
    updatedAt: now,
  }).returning().get();
  return c.json(result, 201);
});

// PUT /todos/:id - 更新
app.put("/todos/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ title?: string; completed?: boolean }>();
  const db = drizzle(c.env.DB);

  const existing = await db.select().from(todos).where(eq(todos.id, id)).get();
  if (!existing) {
    return c.json({ error: "Todo not found" }, 404);
  }

  const result = await db.update(todos)
    .set({
      title: body.title ?? existing.title,
      completed: body.completed ?? existing.completed,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(todos.id, id))
    .returning()
    .get();
  return c.json(result);
});

// DELETE /todos/:id - 削除
app.delete("/todos/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const existing = await db.select().from(todos).where(eq(todos.id, id)).get();
  if (!existing) {
    return c.json({ error: "Todo not found" }, 404);
  }

  await db.delete(todos).where(eq(todos.id, id)).run();
  return c.json({ message: "Deleted successfully" });
});

export default app;
