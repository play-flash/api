import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, sql } from "drizzle-orm";
import { decks, cards } from "./db/schema";
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

// ==================== デッキ CRUD ====================

// GET /decks - ユーザーのデッキ全件取得（カード数付き）
app.get("/decks", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = drizzle(c.env.DB);
  const result = await db
    .select({
      id: decks.id,
      name: decks.name,
      description: decks.description,
      userId: decks.userId,
      createdAt: decks.createdAt,
      updatedAt: decks.updatedAt,
      cardCount: sql<number>`(SELECT COUNT(*) FROM cards WHERE cards.deck_id = decks.id)`,
    })
    .from(decks)
    .where(eq(decks.userId, user.id))
    .all();
  return c.json(result);
});

// GET /decks/:id - ユーザーのデッキ1件取得
app.get("/decks/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  const result = await db
    .select({
      id: decks.id,
      name: decks.name,
      description: decks.description,
      userId: decks.userId,
      createdAt: decks.createdAt,
      updatedAt: decks.updatedAt,
      cardCount: sql<number>`(SELECT COUNT(*) FROM cards WHERE cards.deck_id = decks.id)`,
    })
    .from(decks)
    .where(and(eq(decks.id, id), eq(decks.userId, user.id)))
    .get();
  if (!result) {
    return c.json({ error: "Deck not found" }, 404);
  }
  return c.json(result);
});

// POST /decks - ユーザーのデッキ新規作成
app.post("/decks", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{ name: string; description?: string }>();
  if (!body.name) {
    return c.json({ error: "Name is required" }, 400);
  }
  const db = drizzle(c.env.DB);
  const now = new Date().toISOString();
  const result = await db
    .insert(decks)
    .values({
      name: body.name,
      description: body.description ?? null,
      userId: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return c.json(result, 201);
});

// PUT /decks/:id - ユーザーのデッキ更新
app.put("/decks/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ name?: string; description?: string }>();
  const db = drizzle(c.env.DB);

  const existing = await db
    .select()
    .from(decks)
    .where(and(eq(decks.id, id), eq(decks.userId, user.id)))
    .get();
  if (!existing) {
    return c.json({ error: "Deck not found" }, 404);
  }

  const result = await db
    .update(decks)
    .set({
      name: body.name ?? existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(decks.id, id))
    .returning()
    .get();
  return c.json(result);
});

// DELETE /decks/:id - ユーザーのデッキ削除
app.delete("/decks/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const existing = await db
    .select()
    .from(decks)
    .where(and(eq(decks.id, id), eq(decks.userId, user.id)))
    .get();
  if (!existing) {
    return c.json({ error: "Deck not found" }, 404);
  }

  await db.delete(decks).where(eq(decks.id, id)).run();
  return c.json({ message: "Deleted successfully" });
});

// ==================== カード CRUD ====================

// デッキの所有者確認ヘルパー
async function verifyDeckOwnership(db: ReturnType<typeof drizzle>, deckId: number, userId: string) {
  const deck = await db
    .select()
    .from(decks)
    .where(and(eq(decks.id, deckId), eq(decks.userId, userId)))
    .get();
  return deck;
}

// GET /decks/:deckId/cards - デッキ内のカード全件取得
app.get("/decks/:deckId/cards", requireAuth, async (c) => {
  const user = c.get("user")!;
  const deckId = Number(c.req.param("deckId"));
  const db = drizzle(c.env.DB);

  const deck = await verifyDeckOwnership(db, deckId, user.id);
  if (!deck) {
    return c.json({ error: "Deck not found" }, 404);
  }

  const result = await db
    .select()
    .from(cards)
    .where(eq(cards.deckId, deckId))
    .all();
  return c.json(result);
});

// POST /decks/:deckId/cards - デッキにカード新規作成
app.post("/decks/:deckId/cards", requireAuth, async (c) => {
  const user = c.get("user")!;
  const deckId = Number(c.req.param("deckId"));
  const body = await c.req.json<{ front: string; back: string }>();

  if (!body.front || !body.back) {
    return c.json({ error: "Front and back are required" }, 400);
  }

  const db = drizzle(c.env.DB);
  const deck = await verifyDeckOwnership(db, deckId, user.id);
  if (!deck) {
    return c.json({ error: "Deck not found" }, 404);
  }

  const now = new Date().toISOString();
  const result = await db
    .insert(cards)
    .values({
      deckId,
      front: body.front,
      back: body.back,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return c.json(result, 201);
});

// PUT /decks/:deckId/cards/:id - カード更新
app.put("/decks/:deckId/cards/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const deckId = Number(c.req.param("deckId"));
  const cardId = Number(c.req.param("id"));
  const body = await c.req.json<{ front?: string; back?: string }>();
  const db = drizzle(c.env.DB);

  const deck = await verifyDeckOwnership(db, deckId, user.id);
  if (!deck) {
    return c.json({ error: "Deck not found" }, 404);
  }

  const existing = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.deckId, deckId)))
    .get();
  if (!existing) {
    return c.json({ error: "Card not found" }, 404);
  }

  const result = await db
    .update(cards)
    .set({
      front: body.front ?? existing.front,
      back: body.back ?? existing.back,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(cards.id, cardId))
    .returning()
    .get();
  return c.json(result);
});

// DELETE /decks/:deckId/cards/:id - カード削除
app.delete("/decks/:deckId/cards/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const deckId = Number(c.req.param("deckId"));
  const cardId = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const deck = await verifyDeckOwnership(db, deckId, user.id);
  if (!deck) {
    return c.json({ error: "Deck not found" }, 404);
  }

  const existing = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.deckId, deckId)))
    .get();
  if (!existing) {
    return c.json({ error: "Card not found" }, 404);
  }

  await db.delete(cards).where(eq(cards.id, cardId)).run();
  return c.json({ message: "Deleted successfully" });
});

// ==================== 学習モード ====================

// GET /decks/:deckId/study - シャッフルされたカード取得
app.get("/decks/:deckId/study", requireAuth, async (c) => {
  const user = c.get("user")!;
  const deckId = Number(c.req.param("deckId"));
  const db = drizzle(c.env.DB);

  const deck = await verifyDeckOwnership(db, deckId, user.id);
  if (!deck) {
    return c.json({ error: "Deck not found" }, 404);
  }

  const result = await db
    .select()
    .from(cards)
    .where(eq(cards.deckId, deckId))
    .orderBy(sql`RANDOM()`)
    .all();
  return c.json(result);
});

export default app;
