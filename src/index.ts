import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { todos } from "./db/schema";
import { createAuth, Bindings } from "./lib/auth";
import { authMiddleware, requireAuth, Variables } from "./middleware/auth";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS設定
app.use(
  "/*",
  cors({
    origin: ["https://flash.shgysd.workers.dev", "http://localhost:3000"],
    credentials: true,
  })
);

// 認証ルート - better-authが処理
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// 認証ミドルウェアを適用
app.use("/*", authMiddleware);

// GET /todos - ユーザーのTodo全件取得
app.get("/todos", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = drizzle(c.env.DB);
  const result = await db
    .select()
    .from(todos)
    .where(eq(todos.userId, user.id))
    .all();
  return c.json(result);
});

// GET /todos/:id - ユーザーのTodo1件取得
app.get("/todos/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  const result = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, id), eq(todos.userId, user.id)))
    .get();
  if (!result) {
    return c.json({ error: "Todo not found" }, 404);
  }
  return c.json(result);
});

// POST /todos - ユーザーのTodo新規作成
app.post("/todos", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{ title: string }>();
  if (!body.title) {
    return c.json({ error: "Title is required" }, 400);
  }
  const db = drizzle(c.env.DB);
  const now = new Date().toISOString();
  const result = await db
    .insert(todos)
    .values({
      title: body.title,
      completed: false,
      userId: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return c.json(result, 201);
});

// PUT /todos/:id - ユーザーのTodo更新
app.put("/todos/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ title?: string; completed?: boolean }>();
  const db = drizzle(c.env.DB);

  const existing = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, id), eq(todos.userId, user.id)))
    .get();
  if (!existing) {
    return c.json({ error: "Todo not found" }, 404);
  }

  const result = await db
    .update(todos)
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

// DELETE /todos/:id - ユーザーのTodo削除
app.delete("/todos/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const existing = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, id), eq(todos.userId, user.id)))
    .get();
  if (!existing) {
    return c.json({ error: "Todo not found" }, 404);
  }

  await db.delete(todos).where(eq(todos.id, id)).run();
  return c.json({ message: "Deleted successfully" });
});

export default app;
