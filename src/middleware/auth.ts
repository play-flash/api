import { MiddlewareHandler } from "hono";
import { createAuth, Bindings } from "../lib/auth";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
};

export type AuthSession = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
};

export type Variables = {
  user: AuthUser | null;
  session: AuthSession | null;
};

export const authMiddleware: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  const auth = createAuth(c.env);

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);

  await next();
};

export const requireAuth: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
